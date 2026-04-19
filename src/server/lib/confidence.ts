import type { AnswerMode, Confidence, ModelTier } from "./types";

// ── Red-flag modes ────────────────────────────────────────────────────────────
// These modes have higher rates of subtle errors — a verification pass runs
// automatically when confidence is not "high" in these modes.

const RED_FLAG_MODES = new Set<AnswerMode>([
  "roman_mcq",          // statement-by-statement logic — errors are trust-damaging
  "multi_part",         // many answers, higher chance of partial miss
  "math_solution",      // arithmetic / formula mistakes are hard to spot
  "conceptual_science", // mechanism descriptions can drift or hallucinate
]);

// Red-flag subjects: biology classification, chemistry/physics facts are
// easy to mis-state confidently. Treat fact-type answers in these subjects
// with the same care as structural red-flag modes.
const RED_FLAG_SUBJECTS = new Set([
  "Biology", "Zoology", "Botany", "Chemistry", "Physics",
]);
const FACT_MODES = new Set<AnswerMode>([
  "very_short_answer", "short_answer", "definition",
]);

export function isRedFlagMode(mode: AnswerMode): boolean {
  return RED_FLAG_MODES.has(mode);
}

/**
 * Returns true when extra care is warranted — covers both structural red-flag
 * modes (roman_mcq, math, multi_part) and subject-based red-flag contexts
 * (bio/chem/physics fact answers where confident-sounding errors are common).
 */
export function isRedFlagContext(mode: AnswerMode, subject?: string): boolean {
  if (RED_FLAG_MODES.has(mode)) return true;
  if (subject && RED_FLAG_SUBJECTS.has(subject) && FACT_MODES.has(mode)) return true;
  return false;
}

// ── Modes that benefit from re-running with a stronger model ──────────────────

const ESCALATION_MODES = new Set<AnswerMode>([
  "roman_mcq",
  "math_solution",
  "multi_part",
  "long_explanation",
  "conceptual_science",
]);

export function isEscalationWorthIt(mode: AnswerMode): boolean {
  return ESCALATION_MODES.has(mode);
}

// ── Confidence action ─────────────────────────────────────────────────────────

export type ConfidenceAction = "direct" | "verify" | "escalate" | "disclaim";

/**
 * Maps model confidence + answer mode + tier to a concrete policy action.
 *
 * ┌──────────────┬─────────────────────┬─────────────────────────────────────────┐
 * │  confidence  │  context            │  action                                 │
 * ├──────────────┼─────────────────────┼─────────────────────────────────────────┤
 * │  high        │  normal             │  direct   — trust the answer            │
 * │  high        │  red-flag           │  verify   — cheap cross-check           │
 * │  medium      │  any                │  verify   — brief check before returning│
 * │  low         │  escalatable mode   │  escalate — re-run with strong model    │
 * │  low         │  simple/other       │  disclaim — honest uncertainty note     │
 * │  any         │  already strong     │  direct   — at ceiling, never loop      │
 * └──────────────┴─────────────────────┴─────────────────────────────────────────┘
 *
 * Medium confidence always triggers a verification pass — prevents fluent-but-wrong
 * answers from reaching the student unchecked.
 */
export function resolveConfidenceAction(
  modelConf: Confidence,
  mode: AnswerMode,
  tier: ModelTier,
  subject?: string,
): ConfidenceAction {
  // Already at the strongest model — never loop
  if (tier === "strong") return "direct";

  const redFlag = isRedFlagContext(mode, subject);

  if (modelConf === "high") return redFlag ? "verify" : "direct";
  // Medium: always verify — fluent-but-wrong answers must be caught before delivery
  if (modelConf === "medium") return "verify";

  // Low confidence: escalate for complex modes, disclaim otherwise
  if (ESCALATION_MODES.has(mode)) return "escalate";
  return "disclaim";
}

// ── Uncertainty disclaimer ────────────────────────────────────────────────────

export function buildUncertaintyDisclaimer(lang: "bn" | "en"): string {
  return lang === "bn"
    ? "\n\n⚠️ এই উত্তরটি সম্পূর্ণ নিশ্চিত নয়। গুরুত্বপূর্ণ তথ্যের জন্য পাঠ্যপুস্তক বা শিক্ষকের সাথে যাচাই করুন।"
    : "\n\n⚠️ This answer may not be fully reliable. Please verify with your textbook or teacher for important topics.";
}
