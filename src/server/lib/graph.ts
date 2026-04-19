import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";
import type { Document } from "@langchain/core/documents";
import type {
  AskRequest, AgentResponse, AnswerMode, ResponseLanguage, Confidence,
  QuestionTypeDecision, ModelTier, ImageAnalysisResult,
  RenderMode, TableData, StatementCheck, VisualHint,
} from "./types";
import { DEFAULT_STRUCTURE } from "./question-structure";
import { detectDominantLanguage as _detectDominantLanguage } from "./language";
import { classifyQuestion } from "./question-type";
import { selectRelevantRecentMessages, formatMemoryContext } from "./memory";
import { decideStrategy, type Strategy } from "./routing";
import { buildClarificationOptions } from "./clarification";
import { buildAnswerPromptInput } from "./prompt";
import { ACADEMIC_SYSTEM_PROMPT } from "./prompt";
import { selectModelTier, getModelConfig, type ModelPolicy } from "./model-policy";
import { resolveConfidenceAction, buildUncertaintyDisclaimer, isEscalationWorthIt } from "./confidence";
import { runVerification } from "./verification";
import { getChapterDoc } from "./chapter-data";
import { chapterToDocuments } from "./loaders";
import { buildVectorStore } from "./vector";
import { fetchWikipediaSummary, buildWikiSearchTerm, shouldFetchPublic } from "./tools";
import {
  buildUnreadableImageResponse,
  buildPhotoRejectionResponse,
  buildPartialImageResponse,
  needsHighDetail,
} from "./image-analysis";
import { runOCRPipeline } from "./ocr-pipeline";
import { buildExtendedJsonSchema } from "./response-format";
import { logRequest, logError } from "./logger";
import { serverConfig } from "../config";

// ── State definition ──────────────────────────────────────────────────────────

const DEFAULT_QUESTION_DECISION: QuestionTypeDecision = {
  answerMode: "short_answer",
  needsSteps: false,
  needsRetrieval: false,
  needsClarification: false,
  targetLength: "3_lines",
  confidence: "medium",
  structure: DEFAULT_STRUCTURE,
};

const AgentStateAnnotation = Annotation.Root({
  request: Annotation<AskRequest>(),
  lang: Annotation<ResponseLanguage>({
    value: (_prev, next) => next,
    default: () => "en" as ResponseLanguage,
  }),
  questionDecision: Annotation<QuestionTypeDecision>({
    value: (_prev, next) => next,
    default: () => DEFAULT_QUESTION_DECISION,
  }),
  strategy: Annotation<Strategy>({
    value: (_prev, next) => next,
    default: () => "direct" as Strategy,
  }),
  modelTier: Annotation<ModelTier>({
    value: (_prev, next) => next,
    default: () => "lightweight" as ModelTier,
  }),
  imageAnalysis: Annotation<ImageAnalysisResult | null>({
    value: (_prev, next) => next,
    default: () => null,
  }),
  evidenceDocs: Annotation<Document[]>({
    value: (_prev, next) => next,
    default: () => [] as Document[],
  }),
  evidenceLabel: Annotation<string>({
    value: (_prev, next) => next,
    default: () => "",
  }),
  agentResponse: Annotation<AgentResponse | null>({
    value: (_prev, next) => next,
    default: () => null,
  }),
  // ── Observability ─────────────────────────────────────────────────────────
  escalated: Annotation<boolean>({
    value: (_prev, next) => next,
    default: () => false,
  }),
});

type AgentState = typeof AgentStateAnnotation.State;

// ── Model output shape ────────────────────────────────────────────────────────

type ModelOutput = {
  answer: string;
  answerMode: AnswerMode;
  responseLanguage: ResponseLanguage;
  needsClarification: boolean;
  clarificationQuestion?: string;
  clarificationOptions?: string[];
  confidence: Confidence;
  renderMode?: RenderMode;
  tableData?: TableData;
  stepData?: string[];
  statementChecks?: StatementCheck[];
  finalOption?: string;
  finalAnswerText?: string;
  visualHint?: VisualHint;
};

/**
 * Fix unescaped backslashes in JSON string values.
 * Model output may include bare LaTeX like \sin, \alpha — these are
 * not valid JSON escape sequences and cause JSON.parse to throw.
 * Replace any \ not already part of a valid JSON escape with \\.
 */
function repairJsonBackslashes(raw: string): string {
  // Valid JSON escape chars after \: " \ / b f n r t u
  return raw.replace(/\\(?!["\\/bfnrtu]|u[0-9a-fA-F]{4})/g, "\\\\");
}

/**
 * Fix LaTeX commands that use JSON-valid but semantically-wrong escape sequences.
 *
 * JSON parses these escape sequences silently (no throw) but incorrectly:
 *   \t  → tab char (0x09)  — but model meant \tan, \theta, \tau, \times, \text…
 *   \b  → backspace (0x08) — but model meant \beta, \binom, \bar…
 *   \f  → form-feed (0x0C) — but model meant \frac, \forall…
 *   \r  → CR (0x0D)        — but model meant \rho, \rightarrow…
 *
 * The negative lookbehind (?<!\\) ensures we only fix SINGLE-escaped sequences
 * like \tan — not already-correct DOUBLE-escaped ones like \\tan (which would
 * parse correctly as \tan after JSON.parse).
 */
function repairLatexJsonEscapes(raw: string): string {
  return raw
    .replace(/(?<!\\)\\t(?=[a-zA-Z])/g, "\\\\t")   // \tan \theta \tau \times \text …
    .replace(/(?<!\\)\\b(?=[a-zA-Z])/g, "\\\\b")   // \beta \binom \bar …
    .replace(/(?<!\\)\\f(?=[a-zA-Z])/g, "\\\\f")   // \frac \forall …
    .replace(/(?<!\\)\\r(?=[a-zA-Z])/g, "\\\\r");  // \rho \rightarrow …
}

/**
 * After JSON.parse, scan string values for control characters that slipped
 * through (from LaTeX escapes that JSON parsed without throwing).
 * Restores them to proper LaTeX backslash sequences.
 */
function fixGarbledLatex(text: string): string {
  return text
    .replace(/\u0009([a-zA-Z])/g, "\\$1")   // tab + letter → \letter (\tan, \theta…)
    .replace(/\u0008([a-zA-Z])/g, "\\$1")   // backspace + letter → \letter (\beta…)
    .replace(/\u000C([a-zA-Z])/g, "\\$1")   // form-feed + letter → \letter (\frac…)
    .replace(/\u000D([a-zA-Z])/g, "\\$1");  // CR + letter → \letter (\rho…)
}

function fixGarbledLatexInOutput(parsed: ModelOutput): ModelOutput {
  return {
    ...parsed,
    answer: fixGarbledLatex(parsed.answer),
    stepData: parsed.stepData?.map(fixGarbledLatex),
    finalAnswerText: parsed.finalAnswerText ? fixGarbledLatex(parsed.finalAnswerText) : parsed.finalAnswerText,
  };
}

function safeParseOutput(raw: string): ModelOutput | null {
  console.log(`[model:rawOutput] len=${raw.length} preview="${raw.slice(0, 300).replace(/\n/g, "\\n").replace(/\t/g, "\\t")}"`);

  // Pre-process: fix `\t`, `\b`, `\f`, `\r` followed by letters before parsing.
  // These are valid JSON escapes but in academic math they are almost always
  // LaTeX backslash commands (not whitespace). Run this on cleaned input always.
  const cleaned = repairLatexJsonEscapes(
    raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim()
  );

  // Attempt 1: direct parse (fast path — valid JSON from json_object mode)
  try {
    const parsed = JSON.parse(cleaned) as ModelOutput;
    if (typeof parsed.answer !== "string") {
      console.log(`[model:parseError] answer field missing or not a string`);
      return null;
    }
    const fixed = fixGarbledLatexInOutput(parsed);
    console.log(`[model:parsed] ok answerLen=${fixed.answer.length} answerMode="${fixed.answerMode}" renderMode="${fixed.renderMode ?? "none"}" confidence="${fixed.confidence}" preview="${fixed.answer.slice(0, 150).replace(/\n/g, "\\n")}"`);
    return fixed;
  } catch (e1) {
    console.log(`[model:parseWarn] direct parse failed (${String(e1).slice(0, 80)}) — trying backslash repair`);
  }

  // Attempt 2: repair unescaped backslashes (LaTeX: \sin, \alpha, etc. that throw)
  try {
    const repaired = repairJsonBackslashes(cleaned);
    const parsed = JSON.parse(repaired) as ModelOutput;
    if (typeof parsed.answer !== "string") {
      console.log(`[model:repairError] repaired JSON missing answer field`);
      return null;
    }
    const fixed = fixGarbledLatexInOutput(parsed);
    console.log(`[model:repaired] backslash repair succeeded answerLen=${fixed.answer.length} answerMode="${fixed.answerMode}"`);
    return fixed;
  } catch (e2) {
    console.log(`[model:repairWarn] backslash repair failed (${String(e2).slice(0, 80)}) — trying field extraction`);
  }

  // Attempt 3: regex field extraction (last resort when JSON structure is malformed
  // but the answer text itself is intact with a proper closing quote).
  try {
    // Capture the answer value — handles escaped quotes inside via (?:[^"\\]|\\.)*
    const answerMatch = cleaned.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
    if (answerMatch?.[1]) {
      // Unescape: keep \n as newline, keep \\ as \, keep \" as ".
      // For \t: don't convert to tab — it's LaTeX (already pre-fixed by repairLatexJsonEscapes).
      const answerText = fixGarbledLatex(
        answerMatch[1]
          .replace(/\\n/g, "\n")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\")
      );
      const modeMatch = cleaned.match(/"answerMode"\s*:\s*"([^"]+)"/);
      const confMatch = cleaned.match(/"confidence"\s*:\s*"([^"]+)"/);
      const langMatch = cleaned.match(/"responseLanguage"\s*:\s*"([^"]+)"/);
      const renderMatch = cleaned.match(/"renderMode"\s*:\s*"([^"]+)"/);
      const finalTextMatch = cleaned.match(/"finalAnswerText"\s*:\s*"([^"]+)"/);
      console.log(`[model:extracted] regex extraction recovered answer len=${answerText.length} mode="${modeMatch?.[1] ?? "short_answer"}"`);
      return {
        answer: answerText,
        answerMode: (modeMatch?.[1] ?? "short_answer") as AnswerMode,
        responseLanguage: (langMatch?.[1] ?? "bn") as ResponseLanguage,
        renderMode: (renderMatch?.[1] ?? undefined) as RenderMode | undefined,
        finalAnswerText: finalTextMatch?.[1],
        needsClarification: false,
        confidence: (confMatch?.[1] ?? "medium") as Confidence,
      };
    }
  } catch {
    // ignore — fall through to attempt 4
  }

  // Attempt 4: truncated JSON repair — response was cut off at max_tokens mid-string.
  // The closing " of the answer field is missing, so attempt 3 cannot match.
  // Extract whatever content was generated before truncation — partial is better than nothing.
  try {
    // No closing " required — matches even when JSON is truncated inside the answer field.
    const truncatedMatch = cleaned.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)/s);
    if (truncatedMatch?.[1] && truncatedMatch[1].length > 30) {
      const answerText = fixGarbledLatex(
        truncatedMatch[1]
          .replace(/\\n/g, "\n")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\")
          .trimEnd()
      );
      const modeMatch = cleaned.match(/"answerMode"\s*:\s*"([^"]+)"/);
      const confMatch = cleaned.match(/"confidence"\s*:\s*"([^"]+)"/);
      const langMatch = cleaned.match(/"responseLanguage"\s*:\s*"([^"]+)"/);
      const renderMatch = cleaned.match(/"renderMode"\s*:\s*"([^"]+)"/);
      console.log(`[model:truncatedRepair] recovered truncated answer len=${answerText.length} mode="${modeMatch?.[1] ?? "short_answer"}"`);
      return {
        answer: answerText,
        answerMode: (modeMatch?.[1] ?? "short_answer") as AnswerMode,
        responseLanguage: (langMatch?.[1] ?? "bn") as ResponseLanguage,
        renderMode: (renderMatch?.[1] ?? undefined) as RenderMode | undefined,
        needsClarification: false,
        confidence: (confMatch?.[1] ?? "medium") as Confidence,
      };
    }
  } catch {
    // ignore — fall through to final null
  }

  console.log(`[model:parseFailed] all parse attempts failed raw="${cleaned.slice(0, 300)}"`);
  return null;
}

// ── Answer chain runner (text-only) ──────────────────────────────────────────

async function runAnswerChain(
  policy: ModelPolicy,
  promptInput: Record<string, string>,
): Promise<ModelOutput | null> {
  const model = new ChatOpenAI({
    model: policy.modelName,
    maxTokens: policy.maxTokens,
    temperature: policy.temperature,
    modelKwargs: { response_format: { type: "json_object" } },
    apiKey: serverConfig.openaiApiKey,
  });

  const completenessBlock = promptInput["completenessInstruction"]
    ? `\n${promptInput["completenessInstruction"]}\n`
    : "";
  const correctionBlock = promptInput["correctionInstruction"]
    ? `\n${promptInput["correctionInstruction"]}\n`
    : "";

  const systemText = `${ACADEMIC_SYSTEM_PROMPT}

== Academic Scope ==
Class: ${promptInput["selectedClass"]}
Subject: ${promptInput["selectedSubject"]}
Chapter: ${promptInput["selectedChapter"]}

== Language Rule ==
${promptInput["langInstruction"]}

== Answer Format ==
Answer mode: ${promptInput["answerMode"]}
${promptInput["formatInstruction"]}

== Evidence ==
${promptInput["evidenceBlock"]}
${completenessBlock}${correctionBlock}
${buildExtendedJsonSchema()}`;

  const humanText = `${promptInput["memoryBlock"]}Student question: ${promptInput["message"]}`;

  try {
    const chain = model.pipe(new StringOutputParser());
    const raw = await chain.invoke([
      new SystemMessage(systemText),
      new HumanMessage(humanText),
    ]);
    return safeParseOutput(raw);
  } catch (err) {
    console.log(`[chain:error] text-only chain threw: ${String(err).slice(0, 300)}`);
    return null;
  }
}

// ── Answer chain runner (vision — image + text) ───────────────────────────────

async function runAnswerChainVision(
  policy: ModelPolicy,
  promptInput: Record<string, string>,
  imageDataUrl: string,
  imageDetail: "low" | "high" | "auto" = "high",
): Promise<ModelOutput | null> {
  const model = new ChatOpenAI({
    model: policy.modelName,
    maxTokens: policy.maxTokens,
    temperature: policy.temperature,
    modelKwargs: { response_format: { type: "json_object" } },
    apiKey: serverConfig.openaiApiKey,
  });

  const completenessBlockV = promptInput["completenessInstruction"]
    ? `\n${promptInput["completenessInstruction"]}\n`
    : "";
  const correctionBlockV = promptInput["correctionInstruction"]
    ? `\n${promptInput["correctionInstruction"]}\n`
    : "";

  const systemText = `${ACADEMIC_SYSTEM_PROMPT}

== Academic Scope ==
Class: ${promptInput["selectedClass"]}
Subject: ${promptInput["selectedSubject"]}
Chapter: ${promptInput["selectedChapter"]}

== Language Rule ==
${promptInput["langInstruction"]}

== Answer Format ==
Answer mode: ${promptInput["answerMode"]}
${promptInput["formatInstruction"]}

== Evidence ==
${promptInput["evidenceBlock"]}

== Image Instruction ==
${promptInput["imageInstruction"]}
${completenessBlockV}${correctionBlockV}
${buildExtendedJsonSchema()}`;

  const humanParts: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [
    { type: "image_url", image_url: { url: imageDataUrl, detail: imageDetail } },
    { type: "text", text: `${promptInput["memoryBlock"]}Student question: ${promptInput["message"]}` },
  ];

  try {
    const chain = model.pipe(new StringOutputParser());
    const raw = await chain.invoke([
      new SystemMessage(systemText),
      new HumanMessage({ content: humanParts }),
    ]);
    return safeParseOutput(raw);
  } catch (err) {
    console.log(`[vision:error] vision chain threw: ${String(err).slice(0, 300)}`);
    return null;
  }
}

// ── Node: classifyAndRoute ────────────────────────────────────────────────────

async function classifyAndRouteNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  // Always respond in Bangla — policy override regardless of input language.
  // detectDominantLanguage is still called internally by prompt-builder for
  // retrieval translation decisions, but lang state is always "bn".
  const lang: ResponseLanguage = "bn";
  const questionDecision = classifyQuestion(state.request.message, !!state.request.image);
  const strategy = decideStrategy(state.request, questionDecision);
  const modelTier = selectModelTier(
    questionDecision.answerMode,
    state.request.selectedSubject,
  );
  return { lang, questionDecision, strategy, modelTier };
}

// ── Node: analyzeImage ────────────────────────────────────────────────────────
// Image-first pipeline: extract → verify quality → normalize → route.
// extract first, verify second, solve third.

async function analyzeImageNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const { image, selectedSubject, selectedChapter, message } = state.request;

  console.log(`[graph:analyzeImage] ENTRY hasImage=${!!image} enableVision=${serverConfig.enableVision} debugDisableVision=${serverConfig.debugDisableVision} imageLen=${image?.length ?? 0} typedMsg="${message.slice(0, 100)}"`);

  if (!image || !serverConfig.enableVision || serverConfig.debugDisableVision) {
    console.log(`[graph:analyzeImage] SKIPPED — no image or vision disabled`);
    return { imageAnalysis: null };
  }

  // Run the full OCR pipeline: extract → verify quality → detect complexity → normalize math
  const ocrResult = await runOCRPipeline(image, {
    subject: selectedSubject,
    chapter: selectedChapter ?? undefined,
    lang: state.lang,
  });

  const analysis = ocrResult.analysis;
  console.log(`[graph:analyzeImage] ocrResult quality="${ocrResult.quality}" isComplex=${ocrResult.isComplex} shouldBlock=${ocrResult.shouldBlock} extractedLen=${analysis.extractedText?.length ?? 0}`);

  const meta = {
    selectedClass: state.request.selectedClass,
    selectedSubject,
    selectedChapter,
  };

  // 1. Photo with no academic content → rejection
  if (analysis.contentType === "photo" && !message.trim()) {
    return {
      imageAnalysis: analysis,
      agentResponse: {
        answer: buildPhotoRejectionResponse(state.lang),
        answerMode: "short_answer",
        responseLanguage: state.lang,
        needsClarification: false,
        confidence: "low",
        imageInfo: { readable: false, status: "unreadable", message: "Non-academic photo" },
        metadata: meta,
      },
    };
  }

  // 2. not_verified quality — extraction failed or too sparse to solve reliably.
  // Return a specific failure message explaining the real reason.
  // Do NOT attempt to answer from badly extracted content.
  if (ocrResult.shouldBlock && !message.trim()) {
    const failMsg = ocrResult.failureMessage
      ?? buildUnreadableImageResponse(state.lang);
    return {
      imageAnalysis: analysis,
      agentResponse: {
        answer: failMsg,
        answerMode: "short_answer",
        responseLanguage: state.lang,
        needsClarification: analysis.readability !== "unreadable",
        clarificationQuestion: analysis.readability !== "unreadable" ? failMsg : undefined,
        confidence: "low",
        imageInfo: {
          readable: false,
          status: analysis.readability,
          message: analysis.partialReason ?? undefined,
        },
        metadata: meta,
      },
    };
  }

  // 3. partially_verified — extracted some content but not fully reliable.
  // Allow answer generation with a warning banner (partial image info).
  // But if user typed nothing and content is too sparse, block.
  if (ocrResult.quality === "partially_verified" && !analysis.extractedText && !message.trim()) {
    const failMsg = ocrResult.failureMessage
      ?? buildPartialImageResponse(state.lang, analysis.partialReason);
    return {
      imageAnalysis: analysis,
      agentResponse: {
        answer: failMsg,
        answerMode: "short_answer",
        responseLanguage: state.lang,
        needsClarification: true,
        clarificationQuestion: failMsg,
        confidence: "low",
        imageInfo: { readable: false, status: "partial", message: analysis.partialReason ?? undefined },
        metadata: meta,
      },
    };
  }

  // 4. verified_good or partially_verified with content — continue through academic flow.
  // The extracted text is already normalized by the OCR pipeline.

  const lang: ResponseLanguage = "bn";
  const extractedText = analysis.extractedText;
  const userMessage = message.trim();

  // Re-classify using normalized extracted text when more informative than typed message.
  const shouldReclassify =
    !!extractedText &&
    extractedText.length > 20 &&
    (!userMessage || userMessage.length < extractedText.length);

  // Strategy override: image content is the question — never route to "clarify".
  const effectiveMessage = extractedText && extractedText.length > 20 ? extractedText : userMessage;
  const imageStrategy =
    state.request.selectedChapter?.trim()
      ? "chapter"
      : effectiveMessage.length >= 6
        ? state.strategy === "clarify" ? "direct" : state.strategy
        : state.strategy;

  if (shouldReclassify) {
    const reclassified = classifyQuestion(extractedText!, true);
    // Complex images always use the strong model regardless of mode
    const newTier = selectModelTier(
      reclassified.answerMode,
      state.request.selectedSubject,
      analysis.contentType,
      ocrResult.isComplex,
    );
    return {
      imageAnalysis: analysis,
      lang,
      questionDecision: reclassified,
      modelTier: newTier,
      strategy: imageStrategy,
    };
  }

  // User typed a real question — keep classification but upgrade tier if image is complex.
  const modelTier = selectModelTier(
    state.questionDecision.answerMode,
    state.request.selectedSubject,
    analysis.contentType,
    ocrResult.isComplex,
  );

  return { imageAnalysis: analysis, lang, modelTier, strategy: imageStrategy };
}

// ── Node: loadChapterEvidence ─────────────────────────────────────────────────

async function loadChapterEvidenceNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const { selectedChapter, selectedSubject, message } = state.request;

  if (!selectedChapter) return { evidenceDocs: [], evidenceLabel: "" };

  const chapterDoc = getChapterDoc(selectedChapter);
  if (!chapterDoc) return { evidenceDocs: [], evidenceLabel: "" };

  // Use extracted image text for retrieval if message is empty
  const query = message.trim() || state.imageAnalysis?.extractedText || message;

  try {
    const docs = await chapterToDocuments(chapterDoc);
    const store = await buildVectorStore(chapterDoc.chapterId, docs);
    const relevant = await store.similaritySearch(query, 3);
    return {
      evidenceDocs: relevant,
      evidenceLabel: `${selectedSubject} — ${selectedChapter}`,
    };
  } catch {
    return { evidenceDocs: [], evidenceLabel: "" };
  }
}

// ── Node: fetchPublicEvidence ─────────────────────────────────────────────────

async function fetchPublicEvidenceNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  if (!serverConfig.enablePublicRetrieval) {
    return { evidenceDocs: [], evidenceLabel: "" };
  }

  // Apply retrieval gate — skip for unreadable images or simple question types
  if (!shouldFetchPublic(state.questionDecision, state.imageAnalysis)) {
    return { evidenceDocs: [], evidenceLabel: "" };
  }

  const { selectedSubject, selectedChapter, message } = state.request;
  const query = message.trim() || state.imageAnalysis?.extractedText || message;
  const searchTerm = buildWikiSearchTerm(selectedSubject, selectedChapter, query);
  const doc = await fetchWikipediaSummary(searchTerm);

  if (!doc) return { evidenceDocs: [], evidenceLabel: "" };

  return {
    evidenceDocs: [doc],
    evidenceLabel: `Wikipedia: ${(doc.metadata as { title?: string }).title ?? searchTerm}`,
  };
}

// ── Node: generateClarification ───────────────────────────────────────────────

async function generateClarificationNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const { question, options } = buildClarificationOptions(state.request);

  const response: AgentResponse = {
    answer: question,
    answerMode: state.questionDecision.answerMode,
    responseLanguage: state.lang,
    needsClarification: true,
    clarificationQuestion: question,
    clarificationOptions: options,
    confidence: "low",
    metadata: {
      selectedClass: state.request.selectedClass,
      selectedSubject: state.request.selectedSubject,
      selectedChapter: state.request.selectedChapter,
    },
  };

  return { agentResponse: response };
}

// ── Node: generateAnswer (with confidence/verify/escalate policy) ─────────────

async function generateAnswerNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const { request, lang, questionDecision, evidenceDocs, evidenceLabel, modelTier, imageAnalysis } = state;

  const relevantHistory = selectRelevantRecentMessages(request.recentMessages);
  const memoryBlock = relevantHistory.length > 0 ? formatMemoryContext(relevantHistory) : "";

  const imageEvidenceText = imageAnalysis?.extractedText ?? null;

  const promptInput = buildAnswerPromptInput({
    request,
    lang,
    questionDecision,
    evidenceDocs,
    evidenceLabel,
    memoryBlock,
    imageEvidenceText,
    imageReadability: imageAnalysis?.readability ?? null,
    imagePartialReason: imageAnalysis?.partialReason ?? null,
    imageContentType: imageAnalysis?.contentType ?? null,
  });

  const sources = evidenceDocs.length > 0
    ? evidenceDocs.map((d) => ({
        title:
          (d.metadata as { title?: string; sectionHeading?: string }).title ??
          (d.metadata as { sectionHeading?: string }).sectionHeading ??
          evidenceLabel,
        url: (d.metadata as { url?: string }).url,
      }))
    : undefined;

  const buildResponse = (output: ModelOutput, overrideConfidence?: Confidence): AgentResponse => {
    // Include image info when an image was analyzed — partial status is surfaced to the UI
    const imgInfo = imageAnalysis ? {
      readable: imageAnalysis.readability !== "unreadable",
      status: imageAnalysis.readability,
      message: imageAnalysis.partialReason ?? undefined,
      extractedTextSummary: imageAnalysis.extractedText
        ? (imageAnalysis.extractedText.length > 150
            ? imageAnalysis.extractedText.slice(0, 150).trimEnd() + "…"
            : imageAnalysis.extractedText)
        : undefined,
    } : undefined;

    return {
      answer: output.answer,
      answerMode: output.answerMode ?? questionDecision.answerMode,
      responseLanguage: output.responseLanguage ?? lang,
      needsClarification: output.needsClarification ?? false,
      clarificationQuestion: output.clarificationQuestion,
      clarificationOptions: output.clarificationOptions,
      confidence: overrideConfidence ?? output.confidence ?? "medium",
      renderMode: output.renderMode,
      tableData: output.tableData,
      stepData: output.stepData,
      statementChecks: output.statementChecks,
      finalOption: output.finalOption,
      finalAnswerText: output.finalAnswerText,
      visualHint: output.visualHint,
      sourcesUsed: sources,
      imageInfo: imgInfo,
      metadata: {
        selectedClass: request.selectedClass,
        selectedSubject: request.selectedSubject,
        selectedChapter: request.selectedChapter,
      },
    };
  };

  // ── First attempt — use vision chain when image is present ─────────────────
  const policy = getModelConfig(modelTier);
  const hasImage = !!request.image && serverConfig.enableVision && !serverConfig.debugDisableVision;
  const useVision = hasImage && imageAnalysis?.readability !== "unreadable";
  console.log(`[graph:generateAnswer] pipeline=${useVision ? "vision" : "text-only"} modelTier="${modelTier}" model="${policy.modelName}" hasImage=${hasImage} imageReadability="${imageAnalysis?.readability ?? "none"}" effectiveMsg="${String(promptInput["message"]).slice(0, 120)}"`);

  // Always use "high" detail in the answer chain — the extraction step already
  // saw the image at high detail; the answer model should too. Missing a label
  // or Bengali character in the answer model's view would cause wrong answers.
  const imageDetail: "high" = "high";

  let parsed = useVision
    ? await runAnswerChainVision(policy, promptInput, request.image!, imageDetail)
    : await runAnswerChain(policy, promptInput);

  // Vision chain fallback: if the vision call failed (API error or parse failure) but
  // OCR extraction succeeded, retry using text-only chain with the extracted text already
  // in the prompt — avoids re-sending the large image and often succeeds where vision fails.
  if (!parsed && useVision && imageAnalysis?.extractedText && imageAnalysis.extractionQuality === "verified_good") {
    console.log(`[graph:visionFallback] vision chain returned null but OCR succeeded — retrying text-only with extracted question`);
    parsed = await runAnswerChain(policy, promptInput);
    if (parsed) {
      console.log(`[graph:visionFallback] text-only fallback succeeded answerLen=${parsed.answer.length}`);
    } else {
      console.log(`[graph:visionFallback] text-only fallback also returned null`);
    }
  }

  if (!parsed) {
    // Explain the real failure reason — not a lazy generic message.
    const hasImageIssue = !!imageAnalysis && imageAnalysis.extractionQuality !== "verified_good";
    const failAnswer = hasImageIssue
      ? lang === "bn"
        ? `ছবি থেকে প্রশ্নটি সঠিকভাবে নিষ্কাশন করা যায়নি${imageAnalysis?.partialReason ? ` (${imageAnalysis.partialReason})` : ""}। আরও স্পষ্ট ছবি পাঠান বা প্রশ্নটি টাইপ করুন।`
        : `Could not extract the question from the image reliably${imageAnalysis?.partialReason ? ` (${imageAnalysis.partialReason})` : ""}. Please send a clearer image or type out the question.`
      : lang === "bn"
        ? `দুঃখিত, "${request.selectedSubject}" বিষয়ে এই প্রশ্নের উত্তর তৈরি করতে সমস্যা হয়েছে। প্রশ্নটি আবার বা ভিন্নভাবে লিখুন।`
        : `Could not generate an answer for this ${request.selectedSubject} question. Please try rephrasing or ask again.`;

    return {
      agentResponse: {
        answer: failAnswer,
        answerMode: questionDecision.answerMode,
        responseLanguage: lang,
        needsClarification: false,
        confidence: "low",
        sourcesUsed: sources,
        metadata: {
          selectedClass: request.selectedClass,
          selectedSubject: request.selectedSubject,
          selectedChapter: request.selectedChapter,
        },
      },
    };
  }

  // ── Confidence evaluation ──────────────────────────────────────────────────
  const action = resolveConfidenceAction(
    parsed.confidence ?? "medium",
    questionDecision.answerMode,
    modelTier,
    request.selectedSubject,
  );
  console.log(`[graph:confidence] modelConf="${parsed.confidence}" answerMode="${questionDecision.answerMode}" tier="${modelTier}" → action="${action}"`);

  // ── Direct: high confidence — return immediately ───────────────────────────
  if (action === "direct") {
    const resp = buildResponse(parsed);
    console.log(`[graph:finalResponse] action=direct confidence="${resp.confidence}" answerLen=${resp.answer.length} renderMode="${resp.renderMode ?? "none"}" hasStepData=${!!resp.stepData?.length}`);
    return { agentResponse: resp };
  }

  // ── Verify: red-flag context — cheap lightweight cross-check ─────────────
  if (action === "verify") {
    const questionText = request.message || imageAnalysis?.extractedText || "[image question]";
    const { correctedAnswer } = await runVerification(questionText, parsed.answer, lang);
    parsed = { ...parsed, answer: correctedAnswer };
    const resp = buildResponse(parsed);
    console.log(`[graph:finalResponse] action=verify confidence="${resp.confidence}" answerLen=${resp.answer.length}`);
    return { agentResponse: resp };
  }

  // ── Escalate: low confidence on complex mode ─────────────────────────────
  if (isEscalationWorthIt(questionDecision.answerMode) && modelTier !== "strong") {
    const strongPolicy = getModelConfig("strong");
    const escalatedOutput = useVision
      ? await runAnswerChainVision(strongPolicy, promptInput, request.image!, imageDetail)
      : await runAnswerChain(strongPolicy, promptInput);
    if (escalatedOutput) {
      const resp = buildResponse(escalatedOutput);
      console.log(`[graph:finalResponse] action=escalate confidence="${resp.confidence}" answerLen=${resp.answer.length}`);
      return { agentResponse: resp, escalated: true };
    }
    console.log(`[graph:escalate] escalated model returned null — falling back to original parsed with disclaimer`);
  }

  // ── Low-confidence fallback: append disclaimer, show answer (never discard) ─
  // The disclaimer is appended but the answer itself is preserved and shown.
  const disclaimer = buildUncertaintyDisclaimer(lang);
  parsed = { ...parsed, answer: parsed.answer + disclaimer };
  const resp = buildResponse(parsed, "low");
  console.log(`[graph:finalResponse] action=disclaim confidence=low answerLen=${resp.answer.length}`);
  return { agentResponse: resp };
}

// ── Conditional routing ───────────────────────────────────────────────────────

function resolveStrategyRoute(strategy: Strategy): string {
  if (serverConfig.debugDisableRetrieval && (strategy === "chapter" || strategy === "public")) {
    return "generateAnswer";
  }
  switch (strategy) {
    case "clarify": return "generateClarification";
    case "chapter": return "loadChapterEvidence";
    case "public":  return "fetchPublicEvidence";
    default:        return "generateAnswer";
  }
}

function routeAfterClassify(state: AgentState): string {
  const visionEnabled = serverConfig.enableVision && !serverConfig.debugDisableVision;
  if (state.request.image && visionEnabled) return "analyzeImage";
  return resolveStrategyRoute(state.strategy);
}

function routeAfterImageAnalysis(state: AgentState): string {
  if (state.agentResponse) return END;
  return resolveStrategyRoute(state.strategy);
}

function routeAfterEvidence(_state: AgentState): string {
  return "generateAnswer";
}

// ── Graph compilation ─────────────────────────────────────────────────────────

let _compiledGraph: ReturnType<typeof buildGraph> | null = null;

function buildGraph() {
  return new StateGraph(AgentStateAnnotation)
    .addNode("classifyAndRoute", classifyAndRouteNode)
    .addNode("analyzeImage", analyzeImageNode)
    .addNode("loadChapterEvidence", loadChapterEvidenceNode)
    .addNode("fetchPublicEvidence", fetchPublicEvidenceNode)
    .addNode("generateClarification", generateClarificationNode)
    .addNode("generateAnswer", generateAnswerNode)
    .addEdge(START, "classifyAndRoute")
    .addConditionalEdges("classifyAndRoute", routeAfterClassify, {
      analyzeImage: "analyzeImage",
      loadChapterEvidence: "loadChapterEvidence",
      fetchPublicEvidence: "fetchPublicEvidence",
      generateClarification: "generateClarification",
      generateAnswer: "generateAnswer",
    })
    .addConditionalEdges("analyzeImage", routeAfterImageAnalysis, {
      loadChapterEvidence: "loadChapterEvidence",
      fetchPublicEvidence: "fetchPublicEvidence",
      generateClarification: "generateClarification",
      generateAnswer: "generateAnswer",
      [END]: END,
    })
    .addConditionalEdges("loadChapterEvidence", routeAfterEvidence, {
      generateAnswer: "generateAnswer",
    })
    .addConditionalEdges("fetchPublicEvidence", routeAfterEvidence, {
      generateAnswer: "generateAnswer",
    })
    .addEdge("generateClarification", END)
    .addEdge("generateAnswer", END)
    .compile();
}

export function getCompiledGraph() {
  if (!_compiledGraph) _compiledGraph = buildGraph();
  return _compiledGraph;
}

export async function runGraph(request: AskRequest): Promise<AgentResponse> {
  const graph = getCompiledGraph();
  const startMs = Date.now();

  let finalState: Awaited<ReturnType<typeof graph.invoke>>;
  try {
    finalState = await graph.invoke({ request });
  } catch (err) {
    logError("graph/invoke", err instanceof Error ? err.constructor.name : "UnknownError");
    return {
      answer: `"${request.selectedSubject}" বিষয়ে উত্তর তৈরি করতে একটি অপ্রত্যাশিত সমস্যা হয়েছে। প্রশ্নটি আবার পাঠান।`,
      answerMode: "short_answer",
      responseLanguage: "bn",
      needsClarification: false,
      confidence: "low",
      metadata: {
        selectedClass: request.selectedClass,
        selectedSubject: request.selectedSubject,
        selectedChapter: request.selectedChapter,
      },
    };
  }

  const durationMs = Date.now() - startMs;
  const res = finalState.agentResponse;

  if (!res) {
    return {
      answer: `"${request.selectedSubject}" বিষয়ে উত্তর পাওয়া যায়নি। প্রশ্নটি আবার পাঠান।`,
      answerMode: "short_answer",
      responseLanguage: "bn",
      needsClarification: false,
      confidence: "low",
      metadata: {
        selectedClass: request.selectedClass,
        selectedSubject: request.selectedSubject,
        selectedChapter: request.selectedChapter,
      },
    };
  }

  // ── Structured request log ────────────────────────────────────────────────
  // Derive retrieval type from state — chapter evidence takes priority in naming
  const retrievalRan = finalState.evidenceDocs.length > 0;
  const retrievalType = retrievalRan
    ? (finalState.evidenceDocs[0]?.metadata as { source?: string })?.source === "wikipedia"
      ? "public"
      : "chapter"
    : "none";

  logRequest({
    chatId: request.chatId,
    answerMode: res.answerMode,
    renderMode: res.renderMode,
    tier: finalState.modelTier,
    lang: res.responseLanguage,
    confidence: res.confidence,
    retrieval: retrievalType as "chapter" | "public" | "none",
    vision: finalState.imageAnalysis !== null,
    escalated: finalState.escalated,
    durationMs,
  });

  return res;
}
