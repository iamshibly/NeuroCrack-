// Server-side config — reads env vars at call time, never exported to client bundles.
// Fields that are required throw immediately so failures surface on first request.
// IMPORTANT: This module must never be imported from client-side code.

import type { ModelTier } from "./lib/types";

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

const VALID_TIERS = new Set<string>(["lightweight", "strong"]);

export const serverConfig = {
  // ── Auth ────────────────────────────────────────────────────────────────────
  // Key is read at request time — never cached in module scope.
  get openaiApiKey() {
    return requireEnv("OPENAI_API_KEY");
  },

  // ── Model tiers ─────────────────────────────────────────────────────────────
  // Two models: GPT-5.4-mini (fast, easy/non-STEM) and GPT-5.4 (math, science, complex).
  // Override via env vars; defaults map to gpt-4.1-mini and gpt-4.1.
  get lightweightModel() {
    return process.env["OPENAI_MODEL_LIGHTWEIGHT"] ?? "gpt-4.1-mini";
  },
  get strongModel() {
    return process.env["OPENAI_MODEL_STRONG"] ?? "gpt-4.1";
  },

  // ── Token limits per tier ────────────────────────────────────────────────────
  get lightweightMaxTokens() {
    return envInt("OPENAI_MAX_TOKENS_LIGHTWEIGHT", 1200);
  },
  get strongMaxTokens() {
    // 2500 is needed for complex Higher Math / Physics solutions in Bangla with LaTeX steps.
    // 1200 caused truncated JSON for multi-step proofs, making safeParseOutput fail silently.
    return envInt("OPENAI_MAX_TOKENS_STRONG", 2500);
  },

  // ── Embeddings ───────────────────────────────────────────────────────────────
  get openaiEmbeddingsModel() {
    return process.env["OPENAI_EMBEDDINGS_MODEL"] ?? "text-embedding-3-small";
  },

  // ── Feature flags ─────────────────────────────────────────────────────────────
  get enableVision() {
    const raw = process.env["ENABLE_VISION"];
    return raw === undefined ? true : raw === "true";
  },
  get enablePublicRetrieval() {
    return process.env["ENABLE_PUBLIC_RETRIEVAL"] === "true";
  },

  // ── Debug overrides (dev/testing only — safe to leave unset in production) ────
  // DEBUG_FORCE_TIER=lightweight|strong  — bypass model-tier selection
  get debugForceTier(): ModelTier | null {
    const raw = process.env["DEBUG_FORCE_TIER"]?.trim().toLowerCase();
    if (!raw || !VALID_TIERS.has(raw)) return null;
    return raw as ModelTier;
  },
  // DEBUG_DISABLE_RETRIEVAL=true  — skip chapter + Wikipedia retrieval
  get debugDisableRetrieval() {
    return process.env["DEBUG_DISABLE_RETRIEVAL"] === "true";
  },
  // DEBUG_DISABLE_VISION=true  — treat every request as if no image was attached
  get debugDisableVision() {
    return process.env["DEBUG_DISABLE_VISION"] === "true";
  },
} as const;
