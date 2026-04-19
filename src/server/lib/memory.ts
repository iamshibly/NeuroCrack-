import type { IncomingMessage } from "./types";

// Messages shorter than this are likely chip taps / confirmations — low signal.
const MIN_CONTENT_CHARS = 8;

// Keep at most 3 user+assistant pairs (6 messages).
const MAX_PAIRS = 3;

// Patterns that indicate the student is asking for a preference or follow-up
// that the model needs to remember to honour in its next reply.
const PREFERENCE_PATTERNS = [
  /\b(shorter|shorter answer|brief|briefly|in short)\b/i,
  /\b(longer|more detail|in detail|elaborate|full answer)\b/i,
  /\b(in bangla|in bengali|banglay|বাংলায়)\b/i,
  /\b(in english|ইংরেজিতে)\b/i,
  /\b(again|redo|repeat|explain again|আবার)\b/i,
  /\b(part [a-z]|part \d|section [a-z]|section \d)\b/i,
  /\b(solve.*again|calculate.*again|show.*steps)\b/i,
];

/**
 * Returns a bounded, noise-filtered window of recent messages.
 * Always retains messages that carry preference or follow-up signals,
 * even if they are short.
 */
export function selectRelevantRecentMessages(
  messages: IncomingMessage[],
): IncomingMessage[] {
  const filtered = messages.filter((m) => {
    const text = m.content.trim();
    if (text.length >= MIN_CONTENT_CHARS) return true;
    // Short messages that carry a preference signal are still useful
    return PREFERENCE_PATTERNS.some((p) => p.test(text));
  });

  return filtered.slice(-(MAX_PAIRS * 2));
}

/**
 * Formats selected messages into a compact memory block for the system prompt.
 * Highlights preference/follow-up messages so the model notices them.
 */
export function formatMemoryContext(messages: IncomingMessage[]): string {
  if (messages.length === 0) return "";

  const lines = messages.map((m) => {
    const label = m.role === "user" ? "Student" : "Tutor";
    let content = m.content.trim();

    // Truncate long tutor responses to save tokens
    if (m.role === "assistant" && content.length > 300) {
      content = content.slice(0, 300) + "…";
    }

    // Flag preference/follow-up student messages so the model pays attention
    const isPreference =
      m.role === "user" && PREFERENCE_PATTERNS.some((p) => p.test(content));
    const prefix = isPreference ? "[preference] " : "";

    return `${label}: ${prefix}${content}`;
  });

  const header = lines.length === 1 ? "Previous message:" : "Previous conversation:";
  return `${header}\n${lines.join("\n")}`;
}
