import type { AnswerMode, ModelTier, ImageContentType } from "./types";
import { serverConfig } from "../config";

// ── Debug tier override ───────────────────────────────────────────────────────
let _tierOverrideWarned = false;
function getDebugTierOverride(): ModelTier | null {
  const tier = serverConfig.debugForceTier as ModelTier | undefined;
  if (!tier) return null;
  if (!_tierOverrideWarned) {
    console.warn(`[model-policy] DEBUG_FORCE_TIER="${tier}" — all requests will use this tier`);
    _tierOverrideWarned = true;
  }
  return tier;
}

// ── Model policy configuration ────────────────────────────────────────────────

export type ModelPolicy = {
  tier: ModelTier;
  modelName: string;
  maxTokens: number;
  temperature: number;
};

export function getModelConfig(tier: ModelTier): ModelPolicy {
  if (tier === "strong") {
    return {
      tier,
      modelName: serverConfig.strongModel,
      maxTokens: serverConfig.strongMaxTokens,
      temperature: 0,
    };
  }
  return {
    tier: "lightweight",
    modelName: serverConfig.lightweightModel,
    maxTokens: serverConfig.lightweightMaxTokens,
    temperature: 0,
  };
}

// ── Subjects that always use GPT-5.4 (strong), regardless of question type ───
//
// Mathematics and all hard sciences: MCQ, short answer, long answer, image,
// diagram, equation — every mode goes to the strong model.
// Add both English display names (from academic-data.ts) and Bengali names
// so the check works regardless of how the subject arrives.

const ALWAYS_STRONG_SUBJECTS = new Set([
  // Mathematics — SSC
  "General math", "Higher math",
  // Mathematics — aliases and legacy names
  "Mathematics", "Higher Mathematics", "Math", "Algebra", "Calculus",
  "গণিত", "উচ্চতর গণিত",
  // HSC Mathematics (Bengali display names from academic-data.ts)
  "উচ্চতর গণিত ১ম পত্র", "উচ্চতর গণিত ২য় পত্র",
  // Physics — SSC and HSC
  "Physics", "পদার্থবিজ্ঞান",
  "পদার্থবিজ্ঞান ১ম পত্র", "পদার্থবিজ্ঞান ২য় পত্র",
  // Chemistry — SSC and HSC
  "Chemistry", "রসায়ন",
  "রসায়ন ১ম পত্র", "রসায়ন ২য় পত্র",
  // Biology — SSC (single subject)
  "Biology", "জীববিজ্ঞান",
  // Botany — HSC (জীববিজ্ঞান ১ম পত্র)
  "Botany", "জীববিজ্ঞান ১ম পত্র",
  // Zoology — HSC (জীববিজ্ঞান ২য় পত্র)
  "Zoology", "জীববিজ্ঞান ২য় পত্র",
]);

// ── Modes that always use GPT-5.4 regardless of subject ──────────────────────
//
// Roman MCQ (statement-by-statement logic), multi-part (many sub-questions),
// math/equation solutions, long/deep reasoning, and structured comparisons.

const ALWAYS_STRONG_MODES = new Set<AnswerMode>([
  "roman_mcq",         // Statement-by-statement logical evaluation
  "math_solution",     // Multi-step calculation — correctness is critical
  "multi_part",        // Multiple sub-questions — weak model loses track
  "long_explanation",  // Deep reasoning required
  "conceptual_science", // Complex science mechanisms
  "comparison",        // Structured multi-attribute analysis
]);

// Image content types that require the strong model for reliable visual parsing.
// - "mcq" included: MCQ images often contain Roman-numeral MCQs requiring multi-step logic
// - "table" included: table reconstruction + data reasoning requires strong model
// - "diagram", "equation", "mixed": always complex → strong model
const STRONG_IMAGE_TYPES = new Set<ImageContentType>([
  "diagram", "equation", "mixed", "mcq", "table",
]);

// ── Tier selection ────────────────────────────────────────────────────────────
//
// Two-tier policy: strong (GPT-5.4 / gpt-4.1) vs lightweight (GPT-5.4-mini / gpt-4.1-mini).
//
// Priority order:
//   1. Debug override
//   2. Subject is in ALWAYS_STRONG_SUBJECTS → strong (ALL question types and modes)
//   3. Mode is in ALWAYS_STRONG_MODES → strong
//   4. Image has diagram / equation / mixed content → strong
//   5. Everything else → lightweight

export function selectModelTier(
  answerMode: AnswerMode,
  subject?: string,
  imageContentType?: ImageContentType,
  isComplexImage?: boolean,
): ModelTier {
  const override = getDebugTierOverride();
  if (override) return override;

  // Rule 1: Hard STEM subjects → always strong, no exceptions
  if (subject && ALWAYS_STRONG_SUBJECTS.has(subject)) return "strong";

  // Rule 2: Complex reasoning / multi-step modes → always strong
  if (ALWAYS_STRONG_MODES.has(answerMode)) return "strong";

  // Rule 3: Complex image content → strong (diagrams, equations, tables, multi-question)
  if (imageContentType && STRONG_IMAGE_TYPES.has(imageContentType)) return "strong";

  // Rule 4: OCR pipeline flagged as complex (multiple questions, formulas, geometry labels)
  if (isComplexImage) return "strong";

  // Default: simple, short, single-question → lightweight mini
  return "lightweight";
}
