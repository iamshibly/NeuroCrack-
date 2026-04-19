import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import type { ResponseLanguage } from "./types";
import { serverConfig } from "../config";

// ── Verification prompt ───────────────────────────────────────────────────────
// Lightweight call (~150 output tokens). Invoked for medium/red-flag confidence.

const VERIFICATION_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a fact-checker for an academic tutoring system for Bangladeshi students.
Given a student question and a proposed answer, check for factual or logical errors.
Return ONLY valid JSON — no text before or after.

Schema: {"hasError": boolean, "correction": "<one sentence factual correction, or null>"}

Rules:
- Only flag FACTUAL errors (wrong fact, wrong formula, wrong number, wrong conclusion).
- Do NOT flag style, tone, length, or language preference issues.
- Be conservative — only flag when you are certain an error exists.
- If no error: {"hasError": false, "correction": null}
- If error: {"hasError": true, "correction": "<concise correction>"}`,
  ],
  [
    "human",
    `Student question: {question}

Proposed answer: {answer}`,
  ],
]);

type VerificationResult = {
  hasError: boolean;
  correction: string | null;
};

function parseVerificationResult(raw: string): VerificationResult | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as VerificationResult;
    if (typeof parsed.hasError !== "boolean") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Runs a lightweight factual verification pass on a proposed answer.
 * Invoked for medium confidence (all modes) and high confidence in red-flag modes.
 *
 * Cost: ~150 output tokens from lightweightModel ≈ $0.000022 per call.
 * Fails open: if the call fails or parse fails, returns the original answer.
 *
 * @param question The student's original question text.
 * @param answer   The proposed answer from the first generation pass.
 * @param lang     Response language — correction note is written in the same language.
 */
export async function runVerification(
  question: string,
  answer: string,
  lang: ResponseLanguage,
): Promise<{ verified: boolean; correctedAnswer: string }> {
  const model = new ChatOpenAI({
    model: serverConfig.lightweightModel,
    maxTokens: 150,
    temperature: 0,
    apiKey: serverConfig.openaiApiKey,
    modelKwargs: { response_format: { type: "json_object" } },
  });

  try {
    const chain = VERIFICATION_PROMPT.pipe(model).pipe(new StringOutputParser());
    const raw = await chain.invoke({ question, answer });
    const result = parseVerificationResult(raw);

    if (!result || !result.hasError || !result.correction) {
      return { verified: true, correctedAnswer: answer };
    }

    // Append the correction in the user's language
    const correctionNote = lang === "bn"
      ? `\n\n📝 সংশোধন: ${result.correction}`
      : `\n\n📝 Correction: ${result.correction}`;

    return { verified: false, correctedAnswer: answer + correctionNote };
  } catch {
    // Fail open — return the original answer rather than blocking the response
    return { verified: true, correctedAnswer: answer };
  }
}
