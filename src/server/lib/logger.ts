// Structured request logger for the NeuroCrack agent.
// Emits one JSON line per request to stdout.
//
// Rules:
//  - Never log user message content, API keys, or image data
//  - Never log raw error messages that might contain upstream API details
//  - Keep each line parseable by log aggregation tools (one JSON object)
//  - Production: only info-level lines; development: also debug lines

import type { AnswerMode, Confidence, ModelTier, ResponseLanguage, RenderMode } from "./types";

// ── Log shape ─────────────────────────────────────────────────────────────────

export type RequestLogEntry = {
  chatId: string;
  answerMode: AnswerMode;
  renderMode?: RenderMode;
  tier: ModelTier;
  lang: ResponseLanguage;
  confidence: Confidence;
  retrieval: "chapter" | "public" | "none";
  vision: boolean;
  escalated: boolean;
  durationMs: number;
  /** Token counts — populated when available from the model response. */
  tokens?: { prompt: number; completion: number; total: number };
};

// ── Formatters ────────────────────────────────────────────────────────────────

function confidenceBucket(c: Confidence): string {
  // Explicit bucket labels make log scanning easier than raw high/medium/low
  return c === "high" ? "high(≥95)" : c === "medium" ? "medium(78–94)" : "low(<78)";
}

// ── Public API ────────────────────────────────────────────────────────────────

const PREFIX = "[nc]"; // short prefix so lines are greppable

/**
 * Logs a single structured line for one agent request.
 * Safe to call in all environments — no secrets, no user content.
 */
export function logRequest(entry: RequestLogEntry): void {
  const { chatId, answerMode, renderMode, tier, lang, confidence, retrieval, vision, escalated, durationMs, tokens } = entry;

  const payload: Record<string, unknown> = {
    chatId: chatId.slice(0, 8), // truncated — enough for correlation, not full UUID
    mode: answerMode,
    ...(renderMode && renderMode !== "text" ? { render: renderMode } : {}),
    tier,
    lang,
    confidence: confidenceBucket(confidence),
    retrieval,
    vision,
    escalated,
    ms: durationMs,
    ...(tokens ? { tokens } : {}),
  };

  // Use process.stdout.write to avoid interleaving with other console calls
  process.stdout.write(`${PREFIX} ${JSON.stringify(payload)}\n`);
}

/**
 * Logs a warning — used for debug overrides that are active so they're never silent.
 * Safe: only logs the override name and value, never user data.
 */
export function logDebugOverride(name: string, value: string): void {
  process.stdout.write(`${PREFIX} {"level":"warn","debugOverride":{"${name}":"${value}"}}\n`);
}

/**
 * Logs a non-fatal operational error at a safe level of detail.
 * @param context  Short label for where the error occurred (e.g. "graph/generateAnswer")
 * @param errType  err.constructor.name — never the message, which may contain API details
 */
export function logError(context: string, errType: string): void {
  process.stdout.write(`${PREFIX} ${JSON.stringify({ level: "error", context, errType })}\n`);
}
