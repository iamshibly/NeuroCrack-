// Detects when the student is challenging or correcting a previous answer,
// and builds a strong correction instruction for the prompt.

import type { IncomingMessage } from "./types";

const CORRECTION_PATTERNS: RegExp[] = [
  // Bangla correction phrases
  /তুমি ভুল|তুমি ভুল করেছ|এটা ভুল|এটি ভুল|ভুল উত্তর|ভুল হয়েছে/,
  /আবার ভাবো|আবার চিন্তা করো|আবার সমাধান করো|আবার চেষ্টা করো|আবার দেখো/,
  /সব প্রশ্নের উত্তর দাও|সব অংশের উত্তর দাও|সব প্রশ্ন সমাধান করো|১.* থেকে .* সব/,
  /ব্যবহার করোনি|ব্যবহার করনি|উপেক্ষা করেছ|ব্যবহার করোনাই|ব্যবহার করনাই/,
  /ঠিক করো|সংশোধন করো|সঠিক উত্তর দাও|ঠিকমতো সমাধান করো/,
  /সব অংশ সমাধান করো|সব অংশ|সব পার্ট/,
  // English correction phrases
  /\b(you are wrong|this is wrong|that is wrong|wrong answer|your answer is wrong)\b/i,
  /\b(this is incorrect|that is incorrect|incorrect answer|your answer is incorrect)\b/i,
  /\b(think again|rethink|check again|re-?check|reconsider|try again)\b/i,
  /\b(solve all|answer all|all parts|complete all|answer (1|2|3|4|5))\b/i,
  /\b(you did not use|you didn't use|you ignored|you missed|you forgot|didn't (use|apply|include))\b/i,
  /\b(not (using|used)|didn't (use|apply))\b/i,
  /\b(properly|correctly) (use|apply|include)\b/i,
];

/**
 * Returns true if the student's message indicates they are challenging or correcting
 * a previous answer from the assistant.
 */
export function detectCorrectionMode(message: string): boolean {
  return CORRECTION_PATTERNS.some((p) => p.test(message));
}

/**
 * Builds the correction mode instruction block to inject into the prompt.
 * Includes the ORIGINAL question (with all givens) and the most recent answer,
 * so the LLM can re-examine the full problem rather than just the correction message.
 */
export function buildCorrectionModeInstruction(recentMessages: IncomingMessage[]): string {
  // Most recent assistant answer — the one being challenged.
  const reversed = [...recentMessages].reverse();
  const lastAssistant = reversed.find((m) => m.role === "assistant");

  // Original question: the FIRST user message that is NOT itself a correction.
  // In multi-turn scenarios recentMessages may contain several user messages,
  // some of which are prior corrections ("you missed part 2"). We want the earliest
  // message that contains the actual givens (like "40 cm", sub-questions a, b, c…).
  const originalQuestion =
    recentMessages.find(
      (m) => m.role === "user" && !CORRECTION_PATTERNS.some((p) => p.test(m.content)),
    ) ?? recentMessages.find((m) => m.role === "user");

  // Raise truncation to 1200 chars so multi-part questions are not cut off.
  const prevQuestion = originalQuestion?.content?.trim().slice(0, 1200) ?? "";
  const prevAnswer = lastAssistant?.content?.trim().slice(0, 1200) ?? "";

  console.log(`[correction] originalQuestion len=${prevQuestion.length} preview="${prevQuestion.slice(0, 100)}"`);

  const contextBlock = [
    prevQuestion ? `Previous student question:\n${prevQuestion}` : "",
    prevAnswer ? `Your previous answer:\n${prevAnswer}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return `== Correction Mode (student says previous answer was wrong) ==
Do NOT give a shallow or fast reply. Follow these steps:
1. Re-read the original question (shown below) and re-extract ALL given values, units, angles, and conditions.
2. List every sub-question (1., 2., a., b., etc.) and verify each is answered.
3. Verify every important numerical value or condition was actually used — not just mentioned.
4. If you find an error in your previous answer, correct it with full working.
5. If still uncertain after careful reasoning, admit the uncertainty honestly. Do NOT bluff.
${contextBlock ? `\n${contextBlock}` : ""}`;
}
