import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import type { AnswerMode, QuestionTypeDecision, AskRequest } from "./types";
import { detectQuestionStructure, DEFAULT_STRUCTURE } from "./question-structure";
import { serverConfig } from "../config";

// ── Regex-based classifier (primary — free, instant) ─────────────────────────

type Rule = { pattern: RegExp; mode: AnswerMode; needsSteps?: boolean };

const RULES: Rule[] = [
  // ── Bangla keyword rules (checked first for Bangla input) ──────────────────

  // Bangla MCQ
  { pattern: /কোনটি সঠিক|সঠিক উত্তর কোনটি|উত্তরটি বেছে নাও|সঠিক বিকল্পটি/, mode: "mcq" },
  // Bangla fill-in-the-gap
  { pattern: /শূন্যস্থান পূরণ কর|শূন্যস্থান পূরণ করো|ফাঁকা জায়গা পূরণ|শূন্যস্থান পূর/, mode: "fill_in_the_gap" },
  // Bangla math
  { pattern: /সমাধান কর|সমাধান করো|হিসাব কর|হিসাব করো|প্রমাণ কর|প্রমাণ করো|গণনা কর|গণনা করো|মান নির্ণয় কর|সমীকরণ সমাধান/, mode: "math_solution", needsSteps: true },
  // Bangla conceptual / mechanism
  { pattern: /কীভাবে কাজ করে|কিভাবে কাজ করে|প্রক্রিয়া কী|প্রক্রিয়া বর্ণনা|ধাপে ধাপে|ধাপগুলো লেখো/, mode: "conceptual_science", needsSteps: true },
  // Bangla comparison
  { pattern: /পার্থক্য লেখো|পার্থক্য লিখ|পার্থক্য দেখাও|পার্থক্য নির্ণয়|তুলনা করো|তুলনামূলক আলোচনা/, mode: "comparison" },
  // Bangla definition
  { pattern: /সংজ্ঞা দাও|সংজ্ঞা লেখো|কাকে বলে|কী বলে|সংজ্ঞা দিন|সংজ্ঞা বলো/, mode: "definition" },
  // Bangla long explanation
  { pattern: /বিস্তারিত আলোচনা কর|বিস্তারিত বর্ণনা কর|বিস্তারিত ব্যাখ্যা কর|দীর্ঘ উত্তর দাও/, mode: "long_explanation" },
  // Bangla medium answer
  { pattern: /ব্যাখ্যা কর|ব্যাখ্যা করো|বর্ণনা কর|বর্ণনা করো|বিশ্লেষণ কর|বিশ্লেষণ করো|আলোচনা কর|টীকা লেখো/, mode: "medium_answer" },

  // ── English keyword rules ──────────────────────────────────────────────────

  { pattern: /\b(mcq|multiple.?choice|options?|pick the (correct|right|best)|which (option|answer))\b/i, mode: "mcq" },
  { pattern: /\b(fill in|fill the|blank|complete the sentence|missing word)\b/i,                         mode: "fill_in_the_gap" },
  { pattern: /\b(prove|solve|calculate|evaluate|integrate|differentiate|simplify|equation|formula)\b/i,  mode: "math_solution", needsSteps: true },
  { pattern: /[∫∑∏√±÷×≤≥≠∞∂]/,                                                                           mode: "math_solution", needsSteps: true },
  { pattern: /\b(mechanism of|process of|how does|how do|step.?by.?step|explain how)\b/i,               mode: "conceptual_science", needsSteps: true },
  { pattern: /\b(compare|difference between|distinguish|versus|vs\.?|similarities and differences)\b/i,  mode: "comparison" },
  { pattern: /\b(define|definition of|what is meant by|meaning of)\b/i,                                  mode: "definition" },
  { pattern: /\b(explain in detail|describe in detail|describe at length|long answer|discuss in full)\b/i, mode: "long_explanation" },
  { pattern: /\b(explain|describe|discuss|elaborate|write a note)\b/i,                                   mode: "medium_answer" },
  { pattern: /\b(what is|what are|who is|who was|when did|where is|which is)\b/i,                        mode: "very_short_answer" },
];

function modeToTargetLength(mode: AnswerMode): QuestionTypeDecision["targetLength"] {
  switch (mode) {
    case "very_short_answer": return "1_line";
    case "fill_in_the_gap":   return "1_line";
    case "mcq":               return "3_lines";
    case "roman_mcq":         return "5_lines";
    case "definition":        return "3_lines";
    case "short_answer":      return "3_lines";
    case "comparison":        return "5_lines";
    case "conceptual_science":return "5_lines";
    case "medium_answer":     return "5_lines";
    case "multi_part":        return "detailed";
    case "math_solution":     return "detailed";
    case "long_explanation":  return "detailed";
    default:                  return "3_lines";
  }
}

/**
 * Keyword + structure based question classifier — primary path, zero token cost.
 * Returns a full QuestionTypeDecision with all routing signals.
 *
 * @param message  The raw student message text.
 * @param hasImage Whether an image was attached (affects structure detection).
 */
export function classifyQuestion(message: string, hasImage = false): QuestionTypeDecision {
  const msg = message.trim();
  const isTooShort = msg.length < 8 && !hasImage;

  // Run structural analysis first — it has highest priority
  const structure = detectQuestionStructure(msg, hasImage);

  // Roman MCQ: override all other rules — this has a specific answering policy
  if (structure.isRomanMCQ) {
    return {
      answerMode: "roman_mcq",
      needsSteps: true,
      needsRetrieval: false,
      needsClarification: false,
      targetLength: "5_lines",
      confidence: "high",
      structure,
    };
  }

  // Multi-part or multi-question: override to multi_part mode
  if (structure.kind === "part" || structure.kind === "multi") {
    return {
      answerMode: "multi_part",
      needsSteps: false,
      needsRetrieval: false,
      needsClarification: isTooShort,
      targetLength: "detailed",
      confidence: "high",
      structure,
    };
  }

  // Run keyword rules
  for (const rule of RULES) {
    if (rule.pattern.test(msg)) {
      const mode = rule.mode;
      return {
        answerMode: mode,
        needsSteps: rule.needsSteps ?? false,
        needsRetrieval: mode === "long_explanation" || mode === "comparison",
        needsClarification: isTooShort,
        targetLength: modeToTargetLength(mode),
        confidence: "high",
        structure,
      };
    }
  }

  // Default: short_answer
  return {
    answerMode: "short_answer",
    needsSteps: false,
    needsRetrieval: false,
    needsClarification: isTooShort,
    targetLength: "3_lines",
    confidence: msg.length > 15 ? "medium" : "low",
    structure,
  };
}

// ── Format instructions per mode ──────────────────────────────────────────────

/** Returns the exact format instruction injected into the final answer prompt. */
export function buildFormatInstruction(mode: AnswerMode): string {
  switch (mode) {
    case "mcq":
      return `Format exactly:
Line 1: "The correct answer is [Letter]: [option text]."
Line 2–3: One to two sentences explaining why this answer is correct and why the others are wrong.
Max 80 words total.`;

    case "roman_mcq":
      return `This is a Roman-numeral MCQ. Follow this exact solving policy:
Step 1 — List each Roman numeral statement (i, ii, iii, ...) from the question.
Step 2 — Evaluate statement i: state TRUE or FALSE, then give a one-sentence reason.
Step 3 — Evaluate statement ii: state TRUE or FALSE, then give a one-sentence reason.
Step 4 — Evaluate statement iii (if present): state TRUE or FALSE, one-sentence reason.
Step 5 — Identify which statements are correct (e.g., "i and iii are correct").
Step 6 — Map the correct set to the matching option letter (A/B/C/D or ক/খ/গ/ঘ).
Step 7 — State: "The correct answer is [Letter]: [option text]."
Step 8 — One sentence overall justification.
Keep each step on its own line. Be concise.`;

    case "fill_in_the_gap":
      return `Format exactly:
"Answer: [the missing word or phrase]"
If useful, add: "Explanation: [one brief sentence]"
Max 25 words total.`;

    case "very_short_answer":
      return "1 to 2 sentences. State the fact directly. No preamble or restating the question.";

    case "short_answer":
      return "3 to 5 sentences. Be direct. No headers unless listing distinct items.";

    case "medium_answer":
      return "4 to 8 sentences, or a bullet list of 4 to 6 points. Bullets only when listing distinct items. No lengthy introductions.";

    case "long_explanation":
      return `Use clear structure: headings or numbered sections if helpful.
Cover: core concept → explanation → key details → example if useful.
Be thorough but not repetitive.`;

    case "math_solution":
      return `Format exactly:
Given: [what is known]
Step 1: [action → result]
Step 2: [action → result]
(continue steps as needed)
∴ Answer: [final result, include units if applicable]
One step per line. Show all working.`;

    case "conceptual_science":
      return `Format in three parts:
Concept: [what it is — 1 sentence]
Explanation: [how/why it works — 3 to 5 sentences]
Example: [one concrete, curriculum-relevant example]`;

    case "definition":
      return `Format exactly:
"[Term] is [concise, accurate definition]."
Optionally add 1 sentence of context or significance.
Max 3 sentences total.`;

    case "comparison":
      return `Format as a structured list:
[Attribute]: [Item A] | [Item B]
Use 4 to 6 comparison points. One point per line. No lengthy paragraphs.`;

    case "multi_part":
      return `This message contains multiple sub-questions or lettered parts.
Answer EACH part separately. Do NOT merge all answers into one paragraph.
Label each answer clearly:

Part (a): [answer to part a]
Part (b): [answer to part b]
(and so on, matching the original labels)

Keep each part's answer self-contained and appropriately brief.`;

    default:
      return "3 to 5 sentences. Be clear and student-friendly.";
  }
}

// ── LLM-based classifier (opt-in — use when regex confidence is low) ──────────
// ~120 input tokens + 60 output tokens per call with gpt-4o-mini ≈ $0.00003

export const QUESTION_TYPE_CLASSIFIER_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a question-type classifier for an academic tutoring system.
Classify the student's question. Return ONLY valid JSON — no text before or after.

Schema:
{
  "answerMode": "mcq"|"roman_mcq"|"fill_in_the_gap"|"very_short_answer"|"short_answer"|"medium_answer"|"long_explanation"|"math_solution"|"conceptual_science"|"definition"|"comparison"|"multi_part",
  "needsSteps": boolean,
  "needsRetrieval": boolean,
  "needsClarification": boolean,
  "targetLength": "1_line"|"3_lines"|"5_lines"|"8_lines"|"detailed",
  "confidence": "low"|"medium"|"high"
}

Classification rules (apply the FIRST that matches):
- Roman numeral statements (i. ii. iii.) + "which of the following is correct" / "নিচের কোনটি সঠিক" → roman_mcq / 5_lines / needsSteps:true
- Multiple lettered parts (a)/(b)/(c) or ক)/খ)/গ) or numbered questions 1./2./3. → multi_part / detailed
- "mcq" / "multiple choice" / "which option" / "pick the correct" / "কোনটি সঠিক" → mcq / 3_lines
- "fill in" / "complete" / "blank" / "শূন্যস্থান পূরণ" → fill_in_the_gap / 1_line
- equation present / "solve" / "calculate" / "সমাধান করো" / "হিসাব করো" → math_solution / detailed / needsSteps:true
- "mechanism" / "how does X work" / "কীভাবে কাজ করে" / "step by step" → conceptual_science / 5_lines / needsSteps:true
- "compare" / "difference between" / "পার্থক্য লেখো" / "তুলনা করো" → comparison / 5_lines
- "define" / "definition" / "কাকে বলে" / "সংজ্ঞা দাও" → definition / 3_lines
- "explain in detail" / "long answer" / "বিস্তারিত আলোচনা" → long_explanation / detailed
- "explain" / "describe" / "ব্যাখ্যা করো" / "বর্ণনা করো" → medium_answer / 5_lines
- "what is" / "who is" / "when" / simple factual → very_short_answer / 1_line
- unclear or too short → short_answer / needsClarification:true / confidence:low

needsRetrieval: true for long_explanation or comparison; true if question asks for historical facts/statistics
needsClarification: true if question length < 10 chars or intent is genuinely unclear`,
  ],
  [
    "human",
    `Class: {selectedClass}
Subject: {selectedSubject}
Chapter: {selectedChapter}
Question: {message}`,
  ],
]);

/** Builds the input object for QUESTION_TYPE_CLASSIFIER_PROMPT. */
export function buildClassifierInput(req: AskRequest): Record<string, string> {
  return {
    selectedClass: req.selectedClass,
    selectedSubject: req.selectedSubject,
    selectedChapter: req.selectedChapter ?? "N/A",
    message: req.message,
  };
}

export function parseQuestionTypeDecision(raw: string): QuestionTypeDecision | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as QuestionTypeDecision;
    if (!parsed.answerMode) return null;
    return {
      answerMode: parsed.answerMode,
      needsSteps: parsed.needsSteps ?? false,
      needsRetrieval: parsed.needsRetrieval ?? false,
      needsClarification: parsed.needsClarification ?? false,
      targetLength: parsed.targetLength ?? "3_lines",
      confidence: parsed.confidence ?? "medium",
      structure: DEFAULT_STRUCTURE,
    };
  } catch {
    return null;
  }
}

/**
 * LCEL chain for LLM-based question type classification.
 * Only invoke when the regex classifier returns low confidence.
 */
export function buildClassifierChain() {
  const model = new ChatOpenAI({
    model: serverConfig.lightweightModel,
    maxTokens: serverConfig.lightweightMaxTokens,
    temperature: 0,
    apiKey: serverConfig.openaiApiKey,
    modelKwargs: { response_format: { type: "json_object" } },
  });
  const fallback: QuestionTypeDecision = {
    answerMode: "short_answer",
    needsSteps: false,
    needsRetrieval: false,
    needsClarification: false,
    targetLength: "3_lines",
    confidence: "low",
    structure: DEFAULT_STRUCTURE,
  };
  return QUESTION_TYPE_CLASSIFIER_PROMPT
    .pipe(model)
    .pipe(new StringOutputParser())
    .pipe({
      invoke: (raw: string) => parseQuestionTypeDecision(raw) ?? fallback,
    });
}
