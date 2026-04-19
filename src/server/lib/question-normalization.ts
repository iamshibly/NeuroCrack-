// Normalizes imperfect student math/science input before classification and answer generation.
// Conservative: only normalizes when intent is unambiguous. Preserves ambiguous text.

export type NormalizationResult = {
  normalized: string;
  wasNormalized: boolean;
};

// Supported trig functions for power normalization
const TRIG_FNS = ["sin", "cos", "tan", "sec", "cosec", "cot", "sinh", "cosh", "tanh"];

// Angle variable alternatives students write
const ANGLE_PATTERN = "(?:theta|θ|Θ|α|β|φ|ψ)";

function normalizeTrigPowers(text: string): string {
  let result = text;

  for (const fn of TRIG_FNS) {
    // fn^2 θ  /  fn^2theta  /  fn^2 theta
    // Capture (\s*) as its own group so the space is preserved in the output
    // even when the angle group doesn't match (avoids "sin^2 x" → "sin²x").
    result = result.replace(
      new RegExp(`\\b(${fn})\\s*\\^\\s*2(\\s*)(${ANGLE_PATTERN})?`, "gi"),
      (_, f: string, space: string, angle?: string) =>
        `${f.toLowerCase()}²${space}${angle ?? ""}`,
    );

    // fn^3 θ  /  fn^3theta
    result = result.replace(
      new RegExp(`\\b(${fn})\\s*\\^\\s*3(\\s*)(${ANGLE_PATTERN})?`, "gi"),
      (_, f: string, space: string, angle?: string) =>
        `${f.toLowerCase()}³${space}${angle ?? ""}`,
    );

    // fn2 theta / fn2θ (digit immediately after function name, before angle)
    result = result.replace(
      new RegExp(`\\b(${fn})2(${ANGLE_PATTERN}|\\s+${ANGLE_PATTERN})?\\b`, "gi"),
      (_, f: string, angleRaw?: string) =>
        `${f.toLowerCase()}²${angleRaw ? angleRaw : ""}`,
    );

    // fn square theta / fn square θ  /  fn squared theta
    result = result.replace(
      new RegExp(`\\b(${fn})\\s+squared?\\s+(${ANGLE_PATTERN})`, "gi"),
      (_, f: string, angle: string) => `${f.toLowerCase()}²${angle}`,
    );

    // fn square  (no angle given — keep angle-less form)
    result = result.replace(
      new RegExp(`\\b(${fn})\\s+squared?\\b`, "gi"),
      (_, f: string) => `${f.toLowerCase()}²`,
    );
  }

  return result;
}

function normalizeAlgebraicPowers(text: string): string {
  let result = text;

  // x^2  /  x ^2
  result = result.replace(/\bx\s*\^\s*2\b/g, "x²");
  // x^3
  result = result.replace(/\bx\s*\^\s*3\b/g, "x³");

  // x square / x squared  /  x cube / x cubed
  result = result.replace(/\bx\s+squared?\b/gi, "x²");
  result = result.replace(/\bx\s+cubed?\b/gi, "x³");

  // x2 / x3 as standalone power (not part of a larger word like H2O or x2y)
  // Match x2 or x3 when not preceded/followed by alphanumeric chars
  result = result.replace(/(?<![A-Za-z0-9])x2(?![A-Za-z0-9])/g, "x²");
  result = result.replace(/(?<![A-Za-z0-9])x3(?![A-Za-z0-9])/g, "x³");

  // (expr) whole square / (expr) whole squared
  result = result.replace(/\)\s+whole\s+squared?\b/gi, ")²");
  // (expr) whole cube / (expr) whole cubed
  result = result.replace(/\)\s+whole\s+cubed?\b/gi, ")³");

  return result;
}

/**
 * Normalizes imperfect student math input to standard notation.
 * Only applies safe, unambiguous transformations.
 * Chemical formulas (H2O, CO2, NH4+) are NOT touched — LLM understands them.
 */
export function normalizeQuestion(message: string): NormalizationResult {
  const original = message;

  let text = normalizeTrigPowers(message);
  text = normalizeAlgebraicPowers(text);

  const wasNormalized = text !== original;
  if (wasNormalized) {
    console.log(`[normalize] original="${original.slice(0, 200)}" → normalized="${text.slice(0, 200)}"`);
  }

  return { normalized: text, wasNormalized };
}
