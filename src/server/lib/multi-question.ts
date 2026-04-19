/**
 * Multi-question splitting and aggregation.
 *
 * A "multi-question" message contains 2+ numbered sub-questions at line-start
 * boundaries. Supported question-start formats:
 *   1)  2.  3:         Arabic digit + separator
 *   ১)  ২.             Bangla digit + separator
 *   Q1  Q2  Q1)        Q/q prefix + digit
 *   প্রশ্ন ১  প্রশ্ন-২   Bangla word prefix
 *
 * Explicitly NOT boundaries (internal question structure):
 *   i.  ii.  iii.  ⅱ  ⅲ  → Roman numeral statements (kept with their question)
 *   A)  B)  ক)  খ)         → MCQ option lines (kept with their question)
 */

import type { AskRequest, AgentResponse, SubAnswer, Confidence } from "./types";
import { classifyQuestion } from "./question-type";
import { runGraph } from "./graph";

// ── Sub-question result type ──────────────────────────────────────────────────

export type SubQuestionKindHint = "roman_mcq" | "mcq" | "simple";

export type SubQuestion = {
  /** Original question number / label from the message, e.g. "1", "Q2", "১" */
  questionNumber: string;
  /** Full raw text of this sub-question including options — passed to the graph. */
  rawText: string;
  /** MCQ option lines extracted from rawText, if any (A)/B)/ক)/খ) lines). */
  optionsBlock?: string;
  /** Quick structural hint detected without an LLM call. */
  detectedKindHint: SubQuestionKindHint;
};

// ── Boundary detection ────────────────────────────────────────────────────────
//
// Returns the question number label when a line looks like a question start.
// Three pattern groups are tried in order; first match wins.
//
// NOT matched (safety exclusions):
//   - Roman numeral lines: i. ii. iii. ⅱ ⅲ  (letters, not digits)
//   - MCQ option lines: A) B) ক) খ)            (checked at call site)

function matchBoundary(line: string): string | null {
  // ── Pattern 1: Arabic or Bangla digit followed by ) or .
  // e.g. "1)" "2." "১)" "২."
  const numMatch = line.match(/^[ \t]*(\d+|[০-৯]+)\s*[).]/);
  if (numMatch) return numMatch[1]!;

  // ── Pattern 2: Q/q prefix + digit
  // e.g. "Q1" "Q2)" "q3."
  const qMatch = line.match(/^[ \t]*[Qq](\d+)\b/);
  if (qMatch) return `Q${qMatch[1]!}`;

  // ── Pattern 3: Bangla word প্রশ্ন (question) + digit
  // e.g. "প্রশ্ন ১" "প্রশ্ন-২" "প্রশ্ন২"
  const bnMatch = line.match(/^[ \t]*প্রশ্ন[\s-]*([০-৯\d]+)/);
  if (bnMatch) return bnMatch[1]!;

  return null;
}

// MCQ option line: capital/lowercase letter or Bangla letter followed by ) or .
// A)  B)  A.  ক)  খ)  ক.
// The `m` flag is required so ^ matches line-start when tested against multiline rawText.
const MCQ_OPTION_LINE_RE = /^[ \t]*[A-Da-dক-ঘ][).]\s+\S/m;

function findBoundaries(lines: string[]): Array<{ lineIdx: number; number: string }> {
  const result: Array<{ lineIdx: number; number: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip MCQ option lines — they belong to the preceding question
    if (MCQ_OPTION_LINE_RE.test(line)) continue;
    const num = matchBoundary(line);
    if (num !== null) result.push({ lineIdx: i, number: num });
  }
  return result;
}

/**
 * Returns true when the message contains ≥2 numbered question boundaries.
 */
export function isMultiQuestion(message: string): boolean {
  return findBoundaries(message.split("\n")).length >= 2;
}

// ── Kind-hint detector ────────────────────────────────────────────────────────
// Lightweight structural scan — no LLM cost.

// Matches "ii." "iii." "ⅱ" "ⅲ" type Roman numeral statement lines
const ROMAN_STMT_SCAN_RE = /(?:^|\n)\s*(?:ii{0,2}|[ⅱⅲ])\s*[.)]\s+\S/m;
// Strong lead phrase for Roman MCQ
const ROMAN_LEAD_SCAN_RE = /নিচের\s+কোনটি|উপরের\s+কোনগুলো|which\s+of\s+the\s+following|কোন\s+সমন্বয়টি/i;

function countRomanStmtLines(text: string): number {
  return (text.match(/(?:^|\n)\s*i{1,3}\s*[.)]\s+\S/gm) ?? []).length;
}

function detectKindHint(text: string): SubQuestionKindHint {
  const romanLineCount = countRomanStmtLines(text);
  const hasRomanLines = ROMAN_STMT_SCAN_RE.test(text) || romanLineCount >= 2;
  if (hasRomanLines && (ROMAN_LEAD_SCAN_RE.test(text) || romanLineCount >= 3)) {
    return "roman_mcq";
  }
  if (MCQ_OPTION_LINE_RE.test(text)) return "mcq";
  return "simple";
}

// ── Options-block extractor ───────────────────────────────────────────────────
// Identifies MCQ option lines within a sub-question's lines and returns them
// as a joined string. rawText still contains all lines — optionsBlock is a
// convenience reference for callers that want to inspect options separately.

function extractOptionsBlock(lines: string[]): string | undefined {
  const optionLines = lines.filter((l) => MCQ_OPTION_LINE_RE.test(l));
  return optionLines.length >= 2 ? optionLines.join("\n") : undefined;
}

// ── Splitter ──────────────────────────────────────────────────────────────────

/**
 * Splits a multi-question message into individual sub-questions.
 *
 * - Preserves original order and numbering.
 * - Keeps Roman numeral statements (i./ii./iii.) attached to their question.
 * - Keeps MCQ option lines (A)/B)/ক)/খ)) attached to their question.
 * - Strips the leading boundary prefix from rawText but stores number separately.
 * - Populates optionsBlock and detectedKindHint for each sub-question.
 */
export function splitIntoSubQuestions(message: string): SubQuestion[] {
  const lines = message.split("\n");
  const boundaries = findBoundaries(lines);

  if (boundaries.length < 2) {
    const rawText = message.trim();
    return [{
      questionNumber: "1",
      rawText,
      optionsBlock: extractOptionsBlock(lines),
      detectedKindHint: detectKindHint(rawText),
    }];
  }

  const subs: SubQuestion[] = [];

  for (let b = 0; b < boundaries.length; b++) {
    const { lineIdx, number } = boundaries[b]!;
    const endLineIdx = b + 1 < boundaries.length ? boundaries[b + 1]!.lineIdx : lines.length;

    const chunk = lines.slice(lineIdx, endLineIdx);

    // Strip leading boundary prefix from the first line
    const firstLineStripped = chunk[0]!
      .replace(/^[ \t]*(?:[Qq]\d+|প্রশ্ন[\s-]*[০-৯\d]+|\d+|[০-৯]+)\s*[).\s]?\s*/, "")
      .trim();

    const bodyLines = chunk.slice(1);

    // Trim trailing blank lines
    while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1]!.trim() === "") {
      bodyLines.pop();
    }

    const allLines = firstLineStripped ? [firstLineStripped, ...bodyLines] : bodyLines;
    const rawText = allLines.join("\n").trim();

    if (rawText.length > 0) {
      subs.push({
        questionNumber: number,
        rawText,
        optionsBlock: extractOptionsBlock(allLines),
        detectedKindHint: detectKindHint(rawText),
      });
    }
  }

  return subs.length >= 2 ? subs : [{ questionNumber: "1", rawText: message.trim(), detectedKindHint: detectKindHint(message) }];
}

// ── Aggregation ───────────────────────────────────────────────────────────────

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };

function lowestConfidence(results: AgentResponse[]): Confidence {
  let lowest: Confidence = "high";
  for (const r of results) {
    if (CONFIDENCE_RANK[r.confidence] < CONFIDENCE_RANK[lowest]) {
      lowest = r.confidence;
    }
  }
  return lowest;
}

function toSubAnswer(sub: SubQuestion, res: AgentResponse): SubAnswer {
  return {
    questionNumber: sub.questionNumber,
    answerMode: res.answerMode,
    answer: res.answer,
    confidence: res.confidence,
    renderMode: res.renderMode,
    tableData: res.tableData,
    stepData: res.stepData,
    statementChecks: res.statementChecks,
    finalOption: res.finalOption,
    finalAnswerText: res.finalAnswerText,
    visualHint: res.visualHint,
  };
}

/**
 * Combines N individual AgentResponses into one multi-question AgentResponse.
 * The `subAnswers` field carries per-question structured data for the frontend.
 * `answer` is a plain-text fallback combining all answers with question labels.
 */
export function aggregateSubAnswers(
  req: AskRequest,
  subs: SubQuestion[],
  results: AgentResponse[],
): AgentResponse {
  const subAnswers = subs.map((sub, i) => toSubAnswer(sub, results[i]!));

  const combinedAnswer = subAnswers
    .map((sa) => `${sa.questionNumber})\n${sa.answer}`)
    .join("\n\n");

  const allSources = results.flatMap((r) => r.sourcesUsed ?? []);
  const deduped = allSources.filter(
    (s, i, arr) => arr.findIndex((x) => x.title === s.title) === i,
  );

  return {
    answer: combinedAnswer,
    answerMode: "multi_part",
    responseLanguage: results[0]?.responseLanguage ?? "en",
    needsClarification: false,
    confidence: lowestConfidence(results),
    subAnswers,
    sourcesUsed: deduped.length > 0 ? deduped : undefined,
    metadata: {
      selectedClass: req.selectedClass,
      selectedSubject: req.selectedSubject,
      selectedChapter: req.selectedChapter,
    },
  };
}

// ── Runner ────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 4;

/**
 * Runs each sub-question through the full academic graph independently,
 * then aggregates the results into a single AgentResponse.
 *
 * A Roman MCQ in Q1 does NOT affect Q2's classification or answer.
 * Each sub-question gets its own classifyQuestion → tier selection → answer chain.
 */
export async function runMultiQuestionAgent(
  req: AskRequest,
  subs: SubQuestion[],
): Promise<AgentResponse> {
  const results: AgentResponse[] = [];

  for (let i = 0; i < subs.length; i += BATCH_SIZE) {
    const batch = subs.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((sub) => runGraph({ ...req, message: sub.rawText })),
    );
    results.push(...batchResults);
  }

  return aggregateSubAnswers(req, subs, results);
}

// ── Tier hint (for logging / debugging) ──────────────────────────────────────

/**
 * Returns the highest tier required by any sub-question in the batch.
 * Used only for informational purposes — actual tier is selected per-sub in runGraph.
 */
export function batchTierHint(subs: SubQuestion[]): "lightweight" | "strong" {
  for (const sub of subs) {
    const qd = classifyQuestion(sub.rawText, false);
    if (
      qd.answerMode === "roman_mcq" ||
      qd.answerMode === "math_solution" ||
      qd.answerMode === "multi_part"
    ) {
      return "strong";
    }
  }
  return "lightweight";
}
