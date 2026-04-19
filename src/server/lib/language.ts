import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import type { ResponseLanguage, LanguageDecision } from "./types";
import { serverConfig } from "../config";

// ── JS-based detection (primary — free, instant) ──────────────────────────────

// Bengali Unicode block: U+0980–U+09FF
const BENGALI_RE = /[\u0980-\u09FF]/;
const ENGLISH_RE = /[a-zA-Z]/;

export function hasBengali(text: string): boolean {
  return BENGALI_RE.test(text);
}

export function hasEnglish(text: string): boolean {
  return ENGLISH_RE.test(text);
}

function countScripts(text: string): { bengali: number; latin: number } {
  let bengali = 0;
  let latin = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x0980 && cp <= 0x09ff) bengali++;
    else if ((cp >= 0x0041 && cp <= 0x005a) || (cp >= 0x0061 && cp <= 0x007a)) latin++;
  }
  return { bengali, latin };
}

/**
 * Detects the dominant language by counting Bengali vs Latin characters.
 * Primary path — zero token cost.
 *
 * - Empty string (image-only) → "en" (safe default; model will infer from image)
 * - Bengali majority or tie → "bn"
 * - Latin majority → "en"
 */
export function detectDominantLanguage(text: string): ResponseLanguage {
  const { bengali, latin } = countScripts(text);
  if (bengali === 0 && latin === 0) return "en"; // no script chars — image-only or symbols
  return bengali > latin ? "bn" : "en";           // strict > so Latin wins ties
}

/**
 * Full language decision using JS detection.
 * responseLanguage is ALWAYS "bn" — policy requires Bangla output for all answers.
 * inputLanguage reflects the detected input script (used internally for retrieval decisions).
 * shouldTranslateForRetrieval is true for mixed-script input.
 */
export function detectLanguageDecision(text: string, hasImage = false): LanguageDecision {
  const msg = text.trim();

  // Image-only: no text at all
  if (!msg && hasImage) {
    return {
      inputLanguage: "en",
      responseLanguage: "bn",   // always Bangla
      shouldTranslateForRetrieval: false,
      isImageOnly: true,
    };
  }

  const { bengali, latin } = countScripts(msg);
  const noScript = bengali === 0 && latin === 0;
  const inputLanguage: ResponseLanguage = noScript || latin >= bengali ? "en" : "bn";
  const isMixed = bengali > 0 && latin > 0;

  return {
    inputLanguage,
    responseLanguage: "bn",    // always Bangla regardless of input language
    shouldTranslateForRetrieval: isMixed,
    isImageOnly: false,
  };
}

// ── Language instruction strings injected into prompts ────────────────────────

export function languageInstruction(lang: ResponseLanguage): string {
  return lang === "bn"
    ? "Respond in Bangla (Bengali script). Use clear, simple Bangla suitable for students."
    : "Respond in English. Use clear, simple English suitable for students.";
}

/**
 * Strict language rule injected into the final answer system prompt.
 * Policy: ALWAYS respond in Bangla, regardless of the input language.
 * Internal English normalization or retrieval is allowed, but the final answer must be Bangla.
 */
export function buildLanguageRule(
  _lang: ResponseLanguage,
  _isImageOnly = false,
): string {
  return "Write the ENTIRE answer in Bangla (Bengali script). Always respond in Bangla even if the question is written in English. Do not switch to English mid-answer. A technical term with no Bangla equivalent may be written in English once, in parentheses.";
}

// ── LLM-based language classifier (opt-in — use when JS detection is uncertain) ──
// Invoke only for very short or ambiguous messages. Costs ~50 tokens per call.

export const LANGUAGE_POLICY_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Classify the language of a student message. Return ONLY valid JSON — no text before or after.
Schema: {"inputLanguage":"bn"|"en","responseLanguage":"bn"|"en","shouldTranslateForRetrieval":boolean,"isImageOnly":boolean}
Policy: responseLanguage is ALWAYS "bn" (Bangla) — the system always responds in Bangla.
Rules:
- Predominant Bengali script (Unicode U+0980–U+09FF) → inputLanguage:bn, responseLanguage:bn, shouldTranslateForRetrieval:false, isImageOnly:false
- Predominant English letters → inputLanguage:en, responseLanguage:bn, shouldTranslateForRetrieval:false, isImageOnly:false
- Mixed (more Bengali) → inputLanguage:bn, responseLanguage:bn, shouldTranslateForRetrieval:true, isImageOnly:false
- Mixed (more English) → inputLanguage:en, responseLanguage:bn, shouldTranslateForRetrieval:false, isImageOnly:false
- Empty or no text (image-only) → inputLanguage:en, responseLanguage:bn, shouldTranslateForRetrieval:false, isImageOnly:true
- If genuinely unclear → default to inputLanguage:en, responseLanguage:bn, shouldTranslateForRetrieval:false, isImageOnly:false`,
  ],
  ["human", "Student message: {message}"],
]);

export function parseLanguageDecision(raw: string): LanguageDecision | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as LanguageDecision;
    if (parsed.inputLanguage !== "bn" && parsed.inputLanguage !== "en") return null;
    return {
      inputLanguage: parsed.inputLanguage,
      responseLanguage: parsed.responseLanguage ?? parsed.inputLanguage,
      shouldTranslateForRetrieval: parsed.shouldTranslateForRetrieval ?? false,
      isImageOnly: parsed.isImageOnly ?? false,
    };
  } catch {
    return null;
  }
}

const EN_FALLBACK: LanguageDecision = {
  inputLanguage: "en",
  responseLanguage: "en",
  shouldTranslateForRetrieval: false,
  isImageOnly: false,
};

/**
 * LCEL chain for LLM-based language detection.
 * Only use for messages where JS detection is unreliable (very short, transliterated).
 */
export function buildLanguagePolicyChain() {
  const model = new ChatOpenAI({
    model: serverConfig.lightweightModel,
    maxTokens: 60,
    temperature: 0,
    apiKey: serverConfig.openaiApiKey,
    modelKwargs: { response_format: { type: "json_object" } },
  });
  return LANGUAGE_POLICY_PROMPT
    .pipe(model)
    .pipe(new StringOutputParser())
    .pipe({
      invoke: (raw: string) => parseLanguageDecision(raw) ?? EN_FALLBACK,
    });
}
