import type { AskRequest, QuestionTypeDecision } from "./types";

export type Strategy = "direct" | "chapter" | "public" | "clarify";

const MIN_MEANINGFUL_LENGTH = 6;

const VAGUE_PATTERNS = [
  /^(help|hi|hello|okay|ok|yes|no|thanks|good|what|explain)\s*\.?$/i,
  /^\?+$/,
  /^(huh|hmm|why|how)\s*\.?$/i,
];

// Public retrieval signals — only used as a secondary gate, not the primary trigger
const PUBLIC_RETRIEVAL_SIGNALS = [
  /\b(discovered|invented|history of|year of|when was|who discovered|timeline)\b/i,
  /\b(current|latest|recent|modern)\b/i,
  /\b(statistics|percentage|rate|how many people)\b/i,
];

/**
 * Pure rule-based strategy router — no LLM call, zero token cost.
 *
 * Retrieval policy:
 *   1. Do NOT retrieve by default.
 *   2. If a chapter is selected → try local chapter docs first.
 *   3. Public retrieval only when the classifier flags needsRetrieval AND
 *      the message contains an explicit retrieval signal (double gate).
 *
 * Returns one of:
 *   "clarify"  → question is too vague
 *   "chapter"  → chapter selected; use local docs
 *   "public"   → classifier + message both flag retrieval need
 *   "direct"   → answer from model knowledge (default)
 */
export function decideStrategy(
  req: AskRequest,
  questionDecision?: QuestionTypeDecision,
): Strategy {
  const msg = req.message.trim();

  // Classifier says clarification needed
  if (questionDecision?.needsClarification) return "clarify";

  // Too short or vague
  if (msg.length < MIN_MEANINGFUL_LENGTH) return "clarify";
  if (VAGUE_PATTERNS.some((p) => p.test(msg))) return "clarify";

  // Any subject with a specific chapter selected → try local chapter evidence first
  if (req.selectedChapter && req.selectedChapter.trim().length > 0) {
    return "chapter";
  }

  // Public retrieval only when BOTH the classifier AND the message signal it
  // (double gate keeps public retrieval as a last resort, not a default)
  if (
    questionDecision?.needsRetrieval &&
    PUBLIC_RETRIEVAL_SIGNALS.some((p) => p.test(msg))
  ) {
    return "public";
  }

  return "direct";
}

// buildClarificationOptions has been moved to clarification.ts
export { buildClarificationOptions } from "./clarification";
