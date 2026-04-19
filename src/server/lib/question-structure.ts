import type { QuestionKind, QuestionStructure } from "./types";

// ── Roman MCQ patterns ────────────────────────────────────────────────────────
// Unambiguous: "ii" or "iii" at line start is always a Roman numeral statement,
// never a common English word. "i" alone is ambiguous (first-person pronoun).
// Also matches Unicode Roman numeral characters ⅱ (U+2171) and ⅲ (U+2172).

const ROMAN_LINE_RE = /(?:^|\n)\s*(?:ii{0,2}|[ⅱⅲ])\s*[.)]\s+\S/m;

// Bengali lead phrases: "নিচের কোনটি সঠিক", "উপরের কোনগুলো সঠিক", etc.
const ROMAN_LEAD_BN = /নিচের\s+কোনটি|উপরের\s+কোনগুলো|কোন\s+সমন্বয়টি\s+সঠিক|নিম্নের\s+কোনটি|কোনগুলো\s+সঠিক/;
// English lead phrase
const ROMAN_LEAD_EN = /which\s+of\s+the\s+following\s+(is|are)\s+(correct|true)|which\s+statement/i;

// Answer options referencing Roman numerals: "i and ii", "i ও ii", ক. i ও ii
const ROMAN_OPTION_REF = /[ক-ঘ]\.\s*i{1,3}|[A-Da-d]\.\s*i{1,3}|\bi\s+(and|ও|এবং)\s+ii\b/;

function countRomanLines(msg: string): number {
  return (msg.match(/(?:^|\n)\s*(?:i{1,3}|[ⅰⅱⅲ])\s*[.)]\s+\S/gm) ?? []).length;
}

function isRomanMCQ(msg: string): boolean {
  if (!ROMAN_LINE_RE.test(msg)) return false;
  // Strong signal: explicit "which of the following is correct" phrasing
  if (ROMAN_LEAD_BN.test(msg) || ROMAN_LEAD_EN.test(msg)) return true;
  // Moderate signal: answer options reference Roman numerals
  if (ROMAN_OPTION_REF.test(msg)) return true;
  // Fallback: 3+ Roman numeral lines is almost certainly a Roman MCQ block
  return countRomanLines(msg) >= 3;
}

// ── Part-based patterns ───────────────────────────────────────────────────────
// (a)/(b)/(c), a)/b)/c), [a]/[b], ক)/খ)/গ), Part a / Part b

const PART_EN_RE = /(?:^|\n)\s*[([]\s*[a-dA-D]\s*[)\]]\s*\S/m;
const PART_BN_RE = /(?:^|\n)\s*[কখগঘ]\s*[)।]\s*\S/m;
const PART_WORD_RE = /\bpart\s+[a-d]\b|\bpart[-\s]*[([]\s*[a-d]\s*[)\]]/i;

function hasParts(msg: string): boolean {
  return PART_EN_RE.test(msg) || PART_BN_RE.test(msg) || PART_WORD_RE.test(msg);
}

// ── Multi-question patterns ───────────────────────────────────────────────────
// Numbered lines starting at 2 or higher (1. alone is ambiguous — could be a list).
// Covers: Arabic 2-9, Bangla ২-৯, multi-digit numbers, Q-prefix, Bangla word প্রশ্ন.

const MULTI_NUMBERED_RE = /(?:^|\n)\s*(?:[Qq][2-9]|[Qq]\d{2,}|প্রশ্ন[\s-]*[২-৯০-৯\d]|[2-9]|[২-৯]|\d{2,}|[০-৯]{2,})\s*[.)]\s+\S/m;

// ── Image-reference patterns ──────────────────────────────────────────────────

const IMAGE_REF_EN = /\bin\s+the\s+(figure|diagram|image|picture|graph|chart)\b|shown\s+(in|above|below|here)\b|the\s+(above|following|given)\s+(figure|diagram|image)/i;
const IMAGE_REF_BN = /চিত্রে|চিত্র\s*অনুযায়ী|উপরের\s*চিত্র|নিচের\s*চিত্র|চিত্র\s*দেখ|ছবিতে|ছবি\s*অনুযায়ী/;

// ── Part splitters ────────────────────────────────────────────────────────────

/**
 * Splits a part-based message into individual part strings.
 * Handles (a)/(b)/(c), a)/b)/c), ক)/খ)/গ) patterns.
 */
export function splitIntoParts(msg: string): string[] {
  const parts = msg
    .split(/(?:^|\n)\s*(?:[([]\s*[a-dA-D]\s*[)\]]|[কখগঘ]\s*[)।])\s*/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
  return parts.length > 1 ? parts : [msg];
}

/**
 * Splits a multi-question message into numbered sub-questions.
 * Handles Arabic/Bangla digits, Q-prefix, and Bangla word prefix formats.
 */
export function splitIntoNumbered(msg: string): string[] {
  const parts = msg
    .split(/(?:^|\n)\s*(?:[Qq]\d+|প্রশ্ন[\s-]*[০-৯\d]+|\d+|[০-৯]+)\s*[.)]\s+/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
  return parts.length > 1 ? parts : [msg];
}

// ── Main detector ─────────────────────────────────────────────────────────────

const DEFAULT_STRUCTURE: QuestionStructure = {
  kind: "single",
  isRomanMCQ: false,
  isImageDependent: false,
  partCount: 1,
  questionParts: [],
};

/**
 * Pure rule-based structural analysis — zero token cost.
 *
 * Determines whether a student prompt is a single question, a multi-question
 * block, a part-based question, or a Roman-numeral MCQ.
 *
 * @param message  The raw student message text.
 * @param hasImage Whether an image was attached to this request.
 */
export function detectQuestionStructure(
  message: string,
  hasImage: boolean,
): QuestionStructure {
  const msg = message.trim();

  // Image-only: no text at all
  if (!msg && hasImage) {
    return {
      kind: "single",
      isRomanMCQ: false,
      isImageDependent: true,
      partCount: 1,
      questionParts: [],
    };
  }

  const isImageDependent =
    hasImage && (IMAGE_REF_EN.test(msg) || IMAGE_REF_BN.test(msg));

  // Multi-question: numbered list of distinct questions — check BEFORE Roman MCQ
  // so a message like "1) roman_mcq... 2) regular MCQ" is classified as multi,
  // not hijacked into kind:"single"/isRomanMCQ:true.
  if (MULTI_NUMBERED_RE.test(msg)) {
    const parts = splitIntoNumbered(msg);
    if (parts.length >= 2) {
      return {
        kind: "multi",
        isRomanMCQ: false,
        isImageDependent,
        partCount: parts.length,
        questionParts: parts,
      };
    }
  }

  // Roman MCQ (single question with i./ii./iii. statements)
  if (isRomanMCQ(msg)) {
    return {
      kind: "single",
      isRomanMCQ: true,
      isImageDependent,
      partCount: 1,
      questionParts: [],
    };
  }

  // Part-based: (a)/(b) or ক)/খ) lettered parts
  if (hasParts(msg)) {
    const parts = splitIntoParts(msg);
    return {
      kind: "part",
      isRomanMCQ: false,
      isImageDependent,
      partCount: parts.length,
      questionParts: parts,
    };
  }

  return { ...DEFAULT_STRUCTURE, isImageDependent };
}

export { DEFAULT_STRUCTURE };
export type { QuestionKind, QuestionStructure };
