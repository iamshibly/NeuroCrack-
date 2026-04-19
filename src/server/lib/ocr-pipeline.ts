// Image-first OCR pipeline: extract → verify → normalize → route.
//
// Architecture note:
// - Pix2Text (https://github.com/breezedeus/pix2text) would provide superior
//   multilingual OCR with formula extraction in a Python environment.
//   Install: pip install pix2text[multilingual]  (Bangla+English mixed support)
//   Optional: pip install pix2text[vlm]          (vision-language model enhanced)
//   This Node.js environment uses GPT-4.1 vision as the extraction layer instead.
//
// - SymPy (https://docs.sympy.org/) would handle symbolic math verification and
//   simplification after extraction in a Python environment.
//   Install: pip install sympy
//   Flow: extract expression → normalize notation → pass to SymPy
//   This environment passes normalized LaTeX directly to the reasoning model.
//
// Core rule: extract first → verify second → solve third.

import type { ImageAnalysisResult, ExtractionQuality, ResponseLanguage } from "./types";
import { analyzeImage } from "./image-analysis";
import { normalizeQuestion } from "./question-normalization";

// ── Complexity detection ──────────────────────────────────────────────────────
// Patterns in extracted text that indicate a complex image requiring the strong model.

const COMPLEXITY_PATTERNS: RegExp[] = [
  // Roman numeral statements (MCQ)
  /(?:^|\n)\s*(?:ii{0,2}|[ⅱⅲ])\s*[.)]/m,
  // Multiple numbered questions
  /(?:^|\n)\s*[2-9]\s*[.)]/m,
  // Complex math symbols
  /[∫∑∏∂∧∨⟹⟺]/,
  // LaTeX-style notation
  /\\(?:frac|sqrt|int|sum|prod|partial|infty|alpha|beta|theta|lambda|times|cdot)/i,
  // Trig powers (already normalized but catch originals too)
  /(?:tan[²^]|sin[²^]|cos[²^]|sec[²^])/i,
  // Chemistry formulas
  /(?:NH[₄4]|SO[₄4]|CO[₂2]|H[₂2]O|NaCl|HCl|NaOH|KMnO)/,
  // Physics/circuit components
  /\b(?:resistor|capacitor|inductor|circuit|current|voltage)\b/i,
  // Geometry notation (labeled points/sides)
  /∠[A-Z]|△[A-Z]{3}|[A-Z]{2}\s*=\s*\d+(?:\.\d+)?\s*(?:cm|m|km)?/,
  // Diagram with arrows/labels
  /→|←|↑|↓|⟶|labeled|arrow from/i,
];

/** Complex content types that always require the strong model. */
const COMPLEX_CONTENT_TYPES = new Set(["diagram", "equation", "mixed", "table"]);

export function isComplexImage(
  contentType: string,
  extractedText: string | null,
): boolean {
  if (COMPLEX_CONTENT_TYPES.has(contentType)) return true;
  if (!extractedText) return false;
  return COMPLEXITY_PATTERNS.some((p) => p.test(extractedText));
}

// ── Extraction quality classification ────────────────────────────────────────

/**
 * Rule-based quality classification — more reliable than asking the model to
 * self-rate confidence.
 *
 * verified_good:      readable + meaningful extracted text (≥ 20 chars)
 * partially_verified: partial readability but some extractable content
 * not_verified:       unreadable OR extracted text too sparse to solve from
 */
export function classifyExtractionQuality(
  analysis: ImageAnalysisResult,
): ExtractionQuality {
  if (analysis.readability === "unreadable") return "not_verified";

  const textLen = analysis.extractedText?.trim().length ?? 0;

  if (textLen < 10) return "not_verified";

  if (analysis.readability === "partial") {
    return textLen >= 25 ? "partially_verified" : "not_verified";
  }

  // readability === "readable"
  return textLen >= 10 ? "verified_good" : "not_verified";
}

// ── Specific failure messages ─────────────────────────────────────────────────
// Explains the REAL reason extraction failed — no lazy generic messages.

function buildNotVerifiedMessage(
  analysis: ImageAnalysisResult,
  lang: ResponseLanguage,
): string {
  const reason = analysis.partialReason ? ` (${analysis.partialReason})` : "";

  if (lang === "bn") {
    if (analysis.readability === "unreadable") {
      return "ছবিটি পড়া সম্ভব হচ্ছে না — ছবিটি অস্পষ্ট, অন্ধকার, বা ঘোলা। ভালো আলোতে তোলা একটি স্পষ্ট ছবি পাঠান, অথবা প্রশ্নটি টাইপ করুন।";
    }
    const hints: Record<string, string> = {
      equation: "ছবির সমীকরণ বা গণিত সূত্র নিশ্চিতভাবে পড়া যাচ্ছে না। সমীকরণটি টাইপ করে পাঠান অথবা আরও স্পষ্ট ছবি দিন।",
      diagram: `ছবির চিত্রের লেবেল ও মান${reason} অস্পষ্ট। ক্রপ করা বা উন্নত রেজোলিউশনের ছবি পাঠান।`,
      table: "ছবির টেবিলের ঘরগুলো স্পষ্টভাবে পড়া যাচ্ছে না। আরও স্পষ্ট ছবি দিন অথবা টেবিলটি টাইপ করুন।",
      mcq: `MCQ বিকল্পগুলো${reason} সম্পূর্ণ পড়া যাচ্ছে না। স্পষ্ট ছবি বা টাইপ করা প্রশ্ন পাঠান।`,
      mixed: `ছবির কিছু অংশ${reason} স্পষ্ট নয়। ক্রপ করা বা পরিষ্কার ছবি পাঠান, অথবা প্রশ্নটি টাইপ করুন।`,
    };
    return hints[analysis.contentType] ?? `ছবি থেকে প্রশ্ন নিশ্চিতভাবে বের করা যাচ্ছে না${reason}। আরও স্পষ্ট ছবি পাঠান বা প্রশ্নটি টাইপ করুন।`;
  }

  // English fallback
  if (analysis.readability === "unreadable") {
    return "The image is not readable — it appears too blurry, dark, or rotated. Please send a clearer photo or type out the question.";
  }
  const hints: Record<string, string> = {
    equation: `The math equations in the image could not be read with confidence${reason}. Please type the equation or send a clearer image.`,
    diagram: `The diagram labels and values are unclear${reason}. Please send a cropped or higher-resolution image.`,
    table: `Some table cells could not be read${reason}. Please send a clearer image or type the table.`,
    mcq: `The MCQ options could not be fully extracted${reason}. Please send a clearer image or type the question.`,
    mixed: `Part of the image is not readable${reason}. Please send a clearer or cropped version, or type the question.`,
  };
  return hints[analysis.contentType] ?? `Could not extract the question from the image${reason}. Please send a clearer photo or type out the question.`;
}

function buildPartiallyVerifiedMessage(
  analysis: ImageAnalysisResult,
  lang: ResponseLanguage,
): string {
  const reason = analysis.partialReason ? ` (${analysis.partialReason})` : "";
  return lang === "bn"
    ? `ছবির কিছু অংশ${reason} স্পষ্ট নয়, তবে পাঠযোগ্য অংশ থেকে উত্তর দেওয়ার চেষ্টা করছি। সম্পূর্ণ উত্তরের জন্য আরও স্পষ্ট ছবি পাঠান।`
    : `Part of the image is not clearly readable${reason}. Answering from the readable portion — send a clearer image for a complete answer.`;
}

// ── OCR Pipeline Result ───────────────────────────────────────────────────────

export type OCRPipelineResult = {
  /** Analysis result with extractedText replaced by normalized version. */
  analysis: ImageAnalysisResult;
  quality: ExtractionQuality;
  isComplex: boolean;
  /**
   * Specific failure/warning message to surface to the student.
   * null when quality is verified_good.
   */
  failureMessage: string | null;
  /** True when quality is not_verified — answer generation should be blocked. */
  shouldBlock: boolean;
};

/**
 * Runs the full image-first OCR pipeline:
 *
 * 1. Extract: vision model extracts all text, structure, and notation from image
 * 2. Verify:  classify extraction quality (verified_good / partially_verified / not_verified)
 * 3. Detect: flag complex images (equations, diagrams, multi-question) for strong model
 * 4. Normalize: apply math notation normalization to extracted text
 * 5. Route: return quality + failure message so graph can decide next step
 *
 * extract first → verify second → normalize third → solve last
 */
export async function runOCRPipeline(
  imageDataUrl: string,
  context: { subject?: string; chapter?: string; lang: ResponseLanguage },
): Promise<OCRPipelineResult> {
  const imageLen = imageDataUrl.length;
  console.log(`[ocr-pipeline] START imageLen=${imageLen} subject="${context.subject ?? ""}" chapter="${context.chapter ?? ""}"`);

  // Step 1: Extract via vision model (serves as OCR in this Node.js environment)
  const rawAnalysis = await analyzeImage(imageDataUrl, context.lang, {
    subject: context.subject,
    chapter: context.chapter,
  });

  console.log(`[ocr-pipeline] analyzeImage done readability="${rawAnalysis.readability}" contentType="${rawAnalysis.contentType}" extractedLen=${rawAnalysis.extractedText?.length ?? 0} preview="${rawAnalysis.extractedText?.slice(0, 200).replace(/\n/g, " ") ?? "(none)"}"`);

  // Step 2: Classify extraction quality (rule-based, not model-reported)
  const quality = classifyExtractionQuality(rawAnalysis);

  // Step 3: Detect complexity for model tier selection
  const complex = isComplexImage(rawAnalysis.contentType, rawAnalysis.extractedText);

  console.log(`[ocr-pipeline] quality="${quality}" isComplex=${complex}`);

  // Step 4: Normalize math notation in extracted text
  // This handles tan2 theta → tan²θ, x^2 → x², etc. before the model sees it.
  let normalizedExtracted = rawAnalysis.extractedText;
  if (normalizedExtracted) {
    const { normalized } = normalizeQuestion(normalizedExtracted);
    normalizedExtracted = normalized;
  }

  // Build analysis with normalized text and quality/complexity metadata
  const analysis: ImageAnalysisResult = {
    ...rawAnalysis,
    extractedText: normalizedExtracted,
    extractionQuality: quality,
    isComplexImage: complex,
  };

  // Step 5: Build failure message if extraction is not reliable
  let failureMessage: string | null = null;
  if (quality === "not_verified") {
    failureMessage = buildNotVerifiedMessage(rawAnalysis, context.lang);
  } else if (quality === "partially_verified") {
    failureMessage = buildPartiallyVerifiedMessage(rawAnalysis, context.lang);
  }

  console.log(`[ocr-pipeline] END quality="${quality}" shouldBlock=${quality === "not_verified"} failureMessage=${failureMessage ? '"' + failureMessage.slice(0, 80) + '"' : "null"}`);

  return {
    analysis,
    quality,
    isComplex: complex,
    failureMessage,
    shouldBlock: quality === "not_verified",
  };
}
