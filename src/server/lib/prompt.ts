import { ChatPromptTemplate } from "@langchain/core/prompts";
import type { Document } from "@langchain/core/documents";
import type { AskRequest, AnswerMode, ResponseLanguage, QuestionTypeDecision, ImageContentType } from "./types";
import { buildFormatInstruction } from "./question-type";
import { buildLanguageRule } from "./language";
import { buildCompletenessInstruction } from "./answer-completeness";
import { buildCorrectionModeInstruction } from "./correction-mode";

// ── Core persona + rules (shared across all prompts) ─────────────────────────

export const ACADEMIC_SYSTEM_PROMPT = `You are NeuroCrack, a focused and careful academic tutor for Bangladeshi students studying for SSC and HSC examinations.

== Core Rules ==
1. Stay strictly within the specified class, subject, and chapter. Do not introduce unrelated topics.
2. If evidence is provided above, base your answer on it and cite key facts from it.
3. If no evidence is provided, use your internal curriculum knowledge for the specified level.
4. NEVER fabricate chapter-specific claims. If uncertain, say so honestly.
5. Match your answer length and format exactly to the answer mode and format instruction.
6. Do not over-explain simple questions. Do not pad answers with filler sentences.
7. If the question is outside the academic scope or too vague to answer, set needsClarification to true.
8. Answer in the language specified by the language rule — do not switch mid-answer.
9. A technical term with no equivalent in the response language may appear once in English in parentheses.
10. Return ONLY valid JSON — no markdown fences, no commentary, no extra text before or after.
11. MULTIPLICATION vs VARIABLE: In plain-text answer output, NEVER use the letter "x" for multiplication. Use "×" (the multiplication sign ×). When writing algebra, distinguish clearly: use "×" between numbers (e.g., 2 × 3), and reserve "x" for the variable. Inside LaTeX ($...$), use \\times for multiplication.
12. COMPLETENESS: Before finalizing any answer, extract ALL numerical values, units, conditions, and sub-questions from the student's question. Ensure EVERY sub-question (1., 2., a., b., etc.) is answered and EVERY given value is actually used.
13. CORRECTION: If the student's message says your previous answer was wrong (e.g., "ভুল", "think again", "check again", "you ignored"), re-read the full original question carefully, re-extract all givens, and provide a corrected thorough answer. Do not give a shallow reply.
14. KEY ANSWER HIGHLIGHT: Set finalAnswerText to ONLY the specific key word, name, numerical result, or short phrase that IS the answer — never a full sentence. Max 60 characters. Examples: "প্লানারিয়া", "20√3 মি.", "H₂O", "মাইটোসিস".
15. MATH IN ANSWER FIELD: Any expression containing ^, _, /, fractions, Greek letters (θ α β φ), or multi-character identifiers MUST be wrapped in $...$. NEVER write bare caret notation. WRONG: "sin^2 θ + cos^2 θ = 1". CORRECT: "$\\sin^2\\theta + \\cos^2\\theta = 1$". For standalone numerical results you may use Unicode (e.g., "tan²θ = √3"), but prefer $...$ for anything with ^ or _.`;

// ── Final answer prompt ───────────────────────────────────────────────────────

const FINAL_ANSWER_SYSTEM = `${ACADEMIC_SYSTEM_PROMPT}

== Academic Scope ==
Class: {selectedClass}
Subject: {selectedSubject}
Chapter: {selectedChapter}

== Language Rule ==
{langInstruction}

== Answer Format ==
Answer mode: {answerMode}
{formatInstruction}

== Evidence ==
{evidenceBlock}

== Output JSON Shape ==
Return exactly this JSON shape — no markdown, no prose, no code fences:
{{
  "answer": "<answer text — use \\n for line breaks>",
  "answerMode": "<mcq|fill_in_the_gap|very_short_answer|short_answer|medium_answer|long_explanation|math_solution|conceptual_science|definition|comparison>",
  "responseLanguage": "<bn|en>",
  "needsClarification": <true|false>,
  "clarificationQuestion": "<string — omit if needsClarification is false>",
  "clarificationOptions": ["<opt1>", "<opt2>"],
  "confidence": "<low|medium|high>"
}}`;

const FINAL_ANSWER_HUMAN = `{memoryBlock}Student question: {message}`;

export const FINAL_ANSWER_PROMPT = ChatPromptTemplate.fromMessages([
  ["system", FINAL_ANSWER_SYSTEM],
  ["human", FINAL_ANSWER_HUMAN],
]);

/** Alias kept for backward compatibility with graph.ts. */
export function buildAnswerPrompt(): ChatPromptTemplate {
  return FINAL_ANSWER_PROMPT;
}

// Generic image-pointer phrases that contain no real question content.
// When the student types one of these + attaches an image, treat as image-only
// and substitute the extracted image text as the effective question.
const GENERIC_IMAGE_POINTERS = [
  /^\[image\]$/i,
  // "solve" / "solve this" / "solve it" / "solve the problem"
  /^solve(\s+(this|it|the\s+problem|the\s+question))?\.?$/i,
  // Single-word gestures with no content
  /^(find|calculate|answer|help|look|check|see)\.?$/i,
  // Two-word gestures: "find this", "check this" etc.
  /^(find|calculate|answer|check|see|look\s+at)\s+(this|it|here)\.?$/i,
  // Bangla gestures
  /^(এটা|এটি|এই)\s+(সমাধান|সমাধান করো|সমাধান কর|দেখো|দেখ|বলো|বল)\.?$/i,
  /^(see|check|look at)?\s*(this|the)?\s*(image|picture|photo|diagram|question)$/i,
  /^(ছবি|ছবিটি|প্রশ্ন|প্রশ্নটি)\s*(দেখ|দেখো|সমাধান কর|সমাধান করো)?\.?$/i,
];

function isGenericPointer(msg: string): boolean {
  const trimmed = msg.trim();
  return !trimmed || GENERIC_IMAGE_POINTERS.some((p) => p.test(trimmed));
}

// ── Prompt input builder ──────────────────────────────────────────────────────

export function buildAnswerPromptInput({
  request,
  lang,
  questionDecision,
  evidenceDocs,
  evidenceLabel,
  memoryBlock,
  imageEvidenceText,
  imageReadability,
  imagePartialReason,
  imageContentType,
}: {
  request: AskRequest;
  lang: ResponseLanguage;
  questionDecision: QuestionTypeDecision;
  evidenceDocs: Document[];
  evidenceLabel: string;
  memoryBlock: string;
  imageEvidenceText?: string | null;
  imageReadability?: "readable" | "partial" | "unreadable" | null;
  imagePartialReason?: string | null;
  imageContentType?: ImageContentType | null;
}): Record<string, string> {
  const isImageOnly = questionDecision.structure?.isImageDependent && !request.message.trim();
  const baseEvidence = formatEvidenceBlock(evidenceDocs, evidenceLabel);
  const evidenceBlock = imageEvidenceText
    ? `[Text extracted from uploaded image]\n${imageEvidenceText}\n\n---\n\n${baseEvidence}`
    : baseEvidence;

  const imageInstruction = buildImageInstruction(
    imageReadability,
    imagePartialReason,
    !!request.image,
    imageContentType,
  );

  const correctionInstruction = request.isCorrectionMode
    ? buildCorrectionModeInstruction(request.recentMessages)
    : "";

  // Determine the effective question text passed to the model in the human turn.
  //
  // Decision tree:
  //   1. Empty / generic pointer ("solve this", "[Image]", bare "solve", etc.)
  //      → use full extracted image text (primary question source)
  //   2. Short typed instruction (≤ 100 chars) alongside an image with extracted text
  //      → combine: typed instruction + extracted text so the model has complete context
  //        (avoids "find the area" with no numbers because the numbers are only in evidence)
  //   3. Substantive typed question (> 100 chars)
  //      → use typed question as-is; extracted text is already in the evidence block
  //   4. No image text anywhere
  //      → use typed message, or a fallback placeholder
  const typedMsg = request.message.trim();
  let effectiveQuestion: string;

  if (isGenericPointer(typedMsg)) {
    // Case 1: typed text has no content — image text IS the question
    effectiveQuestion = imageEvidenceText
      ? imageEvidenceText.slice(0, 1500)
      : "[Image question — no text could be extracted]";
  } else if (imageEvidenceText && typedMsg.length <= 100) {
    // Case 2: short typed instruction alongside image — combine for full context
    effectiveQuestion = `${typedMsg}\n\n[Extracted from image:]\n${imageEvidenceText.slice(0, 1200)}`;
  } else {
    // Case 3 / 4: substantive typed question, or no image text
    effectiveQuestion = typedMsg || (imageEvidenceText ? imageEvidenceText.slice(0, 1500) : "[Image question]");
  }

  console.log(`[prompt:effectiveQ] typed="${typedMsg.slice(0, 80)}" isGeneric=${isGenericPointer(typedMsg)} imgTextLen=${imageEvidenceText?.length ?? 0} → effective="${effectiveQuestion.slice(0, 150).replace(/\n/g, "\\n")}"`);

  return {
    selectedClass: request.selectedClass,
    selectedSubject: request.selectedSubject,
    selectedChapter: request.selectedChapter ?? "N/A",
    langInstruction: buildLanguageRule(lang, isImageOnly),
    answerMode: questionDecision.answerMode,
    formatInstruction: buildFormatInstruction(questionDecision.answerMode),
    evidenceBlock,
    memoryBlock: memoryBlock ? memoryBlock + "\n\n" : "",
    message: effectiveQuestion,
    imageInstruction,
    completenessInstruction: buildCompletenessInstruction(),
    correctionInstruction,
  };
}

/**
 * Builds the image instruction injected into the vision system prompt.
 * Adapts based on both readability and content type so the model knows
 * exactly what was found and how to use the image + extracted text together.
 */
function buildImageInstruction(
  readability: "readable" | "partial" | "unreadable" | null | undefined,
  partialReason: string | null | undefined,
  hasImage: boolean,
  contentType?: ImageContentType | null,
): string {
  if (!hasImage) return "";

  if (readability === "partial") {
    const reason = partialReason ? ` The unclear part: ${partialReason}.` : "";
    return `The student sent an image that is PARTIALLY readable.${reason} The pre-extracted text (in the Evidence block above) contains only the reliably readable parts. Use ONLY that content — do NOT guess or hallucinate the obscured parts. If a question cannot be fully answered from the readable portion, say so and ask for a clearer image.`;
  }

  // Readable (or unknown) — give content-type-specific guidance
  const base = "The student sent an image. The pre-extracted text is provided above in the Evidence block — use it as the primary source of the question content.";

  switch (contentType) {
    case "mcq":
      return `${base} The image contains an MCQ question with options. Identify the correct option (A/B/C/D or ক/খ/গ/ঘ) and explain why it is correct in one or two sentences.`;

    case "equation":
    case "mixed":
      return `${base} The image contains mathematical equations or a mix of text and figures. Use the extracted text for exact values, symbols, and labels. Show all solution steps clearly.`;

    case "diagram":
      return `${base} The image contains a labeled diagram. The extracted labels are in the Evidence block. Refer to specific labels and their relationships when answering — do not describe the diagram generically.`;

    case "table":
      return `${base} The image contains a data table. Use the extracted table data (rows and columns) to answer precisely. Do not rephrase or abbreviate table values.`;

    case "text":
      return `${base} The image contains printed or handwritten academic text. Treat the extracted text as the student's question and answer it directly.`;

    default:
      return `${base} Read the image carefully alongside the extracted text — together they form the complete question. Treat the extracted text as authoritative for exact values, labels, and options.`;
  }
}

// ── Evidence block formatter ──────────────────────────────────────────────────

export function formatEvidenceBlock(
  docs: { pageContent: string; metadata?: { title?: string; source?: string } }[],
  label: string,
): string {
  if (docs.length === 0) return "No additional evidence provided. Use your curriculum knowledge.";

  const formatted = docs
    .map((d, i) => {
      const title = d.metadata?.title ?? d.metadata?.source ?? `Source ${i + 1}`;
      return `[${title}]\n${d.pageContent.trim()}`;
    })
    .join("\n\n---\n\n");

  return `Evidence from ${label}:\n\n${formatted}`;
}

// ── Legacy helpers (kept so old call sites compile without changes) ────────────

/** @deprecated Use buildFormatInstruction() from question-type.ts */
export function answerModeLengthHint(mode: AnswerMode): string {
  return buildFormatInstruction(mode);
}

/** @deprecated Use buildLanguageRule() from language.ts */
export { buildLanguageRule };
