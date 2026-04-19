import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";
import type { ImageAnalysisResult, ImageReadability, ImageContentType, ResponseLanguage } from "./types";
import { serverConfig } from "../config";

// ── Vision extraction prompt ──────────────────────────────────────────────────

function buildAnalysisPrompt(context?: { subject?: string; chapter?: string }): string {
  const ctxLine = context?.subject
    ? `Academic context: Subject = ${context.subject}${context.chapter ? `, Chapter = ${context.chapter}` : ""}.`
    : "";

  return `You are a precise image extractor for an academic tutoring system for Bangladeshi SSC/HSC students.
Your ONLY job is to extract content EXACTLY as written — do NOT interpret, solve, or answer.
Return ONLY valid JSON — no markdown, no prose, no code fences.

Schema:
{
  "readability": "readable" | "partial" | "unreadable",
  "contentType": "text" | "mcq" | "diagram" | "table" | "equation" | "mixed" | "photo",
  "extractedText": "<complete, precisely extracted content — see rules below>",
  "description": "<one sentence describing image content>",
  "imageLanguage": "bn" | "en" | "mixed" | null,
  "partialReason": "<brief reason why partially readable, or null>"
}

== Readability rules ==
- "readable":   all text/content is clear and fully extractable
- "partial":    some text visible but parts are blurry, cut off, or obscured — extract ONLY reliably readable parts; partialReason must explain what is missing
- "unreadable": too dark/blurry/rotated beyond recovery, or image contains NO academic content

== Content type rules ==
- "mcq":      question with lettered/numbered options (A/B/C/D or ক/খ/গ/ঘ)
- "diagram":  biology diagram, labeled geometry figure, circuit, or scientific illustration
- "table":    data organized in rows and columns
- "equation": math, physics, or chemistry equations/formulas (standalone, no MCQ options)
- "mixed":    ANY combination — text + diagram, exam sheet with multiple questions, figure + MCQ, equation + text
- "photo":    real-world photograph with no academic text or content

== Language detection ==
- "bn":    predominantly Bangla (Unicode U+0980–U+09FF)
- "en":    predominantly English/Latin
- "mixed": both scripts meaningfully present
- null:    no text at all

== EXTRACTION RULES — read every section carefully ==

─── GENERAL ────────────────────────────────────────────────────────────────
- Extract ALL visible text for "readable"; ONLY confidently readable parts for "partial"
- Preserve Bengali script character-by-character — do NOT transliterate or romanize
- Do NOT paraphrase, summarize, rearrange, or answer — extract only
- Preserve the original numbering of every question (1., 2., ১., ২., etc.)

─── MCQ QUESTIONS ──────────────────────────────────────────────────────────
- Extract the full question stem first (including any stem paragraph above it)
- Each option on its own line: "A) [text]", "B) [text]" or "ক) [text]", "খ) [text]"
- If multiple MCQs, keep each question's options attached to that question
- Preserve option text EXACTLY — do NOT round numbers, combine options, or reword

─── ROMAN-NUMERAL MCQ (i/ii/iii statements + নিচের কোনটি সঠিক?) ──────────
- Extract the stem/scenario paragraph first
- Then each Roman statement on its own line: "i. [statement]", "ii. [statement]", "iii. [statement]"
- Then the question line ("নিচের কোনটি সঠিক?" or "Which is correct?")
- Then the options: "ক) i ও ii", "খ) i ও iii", etc.

─── MULTI-QUESTION IMAGES (exam sheets, multiple numbered questions) ────────
- If the image contains multiple numbered questions, extract EACH one separately
- Preserve original numbering: "1.", "2.", "3." or "১.", "২.", "৩."
- For each question, include its sub-parts, options, or statements
- Do NOT merge questions; keep each question as a distinct block separated by a blank line

─── MATH AND GEOMETRY — most critical ──────────────────────────────────────
- Extract ALL labeled points EXACTLY: A, B, C, D, P, Q, R, O, M, N, etc.
- Extract ALL numerical values with FULL precision — do NOT round or approximate
  - Angles: ∠BAC = 30°, ∠PQR = 45.5° — copy exactly
  - Side lengths: AB = 5 cm, PQ = 2.5 m — copy exactly with units
  - Coordinates: (3, 4), (-2, 1) — copy exactly
  - Option values: 0.125, √3/2, 2π/3 — never simplify
- For geometry figures: describe the shape AND list every labeled point, side, and angle
- POWERS AND EXPONENTS — write in standard notation, NOT in words:
  - Write x² or x^2 — NOT "x square" or "x squared"
  - Write x³ or x^3 — NOT "x cube" or "x cubed"
  - Write tan²θ or tan^2(θ) — NOT "tan square theta"
  - Write (a+b)² or (a+b)^2 — NOT "(a+b) whole square"
  - Write √x or sqrt(x) — NOT "root x" or "under root x"
  - These forms are required for correct symbolic math processing
- For equations: preserve using LaTeX-compatible symbols where possible
  - Use: ², ³, √, ∫, π, ∞, ∂, ≥, ≤, ≠, ±, ×, ÷, ∑, ∏
  - Use: ^2, ^3, ^n for exponents when Unicode superscript not available
  - Use: frac(a,b) or a/b for fractions
- Preserve units exactly: cm, m, km, °, rad, kg, N, J, W, mol, L, etc.

─── PHYSICS / CHEMISTRY DIAGRAMS ────────────────────────────────────────────
- Extract every labeled component and its name/value
- Extract arrows and what they point to (e.g., "arrow from A to B labeled F = 10 N")
- Extract any legend or key values visible in the image
- For circuits: list all components (resistor, battery, switch) and their values
- For reaction diagrams: extract reactants, products, and any labeled conditions
- Chemical formulas: write as subscript where possible (H₂O, CO₂) or as H2O, CO2

─── BIOLOGY DIAGRAMS ────────────────────────────────────────────────────────
- Extract every labeled part (e.g., "nucleus", "cell wall", "mitochondria")
- Preserve Bengali labels exactly (e.g., "নিউক্লিয়াস", "কোষ প্রাচীর")
- Note any arrows or lines connecting labeled parts
- If the diagram has a title or scale, extract it

─── TABLES ──────────────────────────────────────────────────────────────────
- Reconstruct the table in plain text with | separators
- First row = headers, subsequent rows = data
- Preserve all cell values exactly, including units and Bengali text
- Example: "| বৈশিষ্ট্য | উদ্ভিদ কোষ | প্রাণী কোষ |\n| কোষ প্রাচীর | আছে | নেই |"

─── SCREENSHOTS / DIGITAL TEXT ──────────────────────────────────────────────
- Treat exactly like printed text — extract all visible content
- If the screenshot shows a question from a textbook or app, extract the full question

─── WHAT NEVER TO DO ────────────────────────────────────────────────────────
- Do NOT guess blurry, obscured, or cut-off parts
- Do NOT add interpretation or your own explanation
- Do NOT answer the question
- Do NOT omit any option from an MCQ
- Do NOT combine or reorder questions
- Do NOT write powers as words (not "tan square", write "tan²" or "tan^2")
${ctxLine}`;
}

// ── Specific failure messages ─────────────────────────────────────────────────
// These replace generic "Sorry, I could not generate an answer" messages.
// Each message explains the REAL failure reason and asks for specific action.

export function buildUnreadableImageResponse(lang: ResponseLanguage): string {
  return lang === "bn"
    ? "ছবিটি পড়া সম্ভব হচ্ছে না — ছবিটি অস্পষ্ট, অন্ধকার, বা ঘোলা। অনুগ্রহ করে ভালো আলোতে তোলা একটি স্পষ্ট ছবি পাঠান, অথবা প্রশ্নটি টাইপ করে লিখুন।"
    : "The image is not readable — it appears too blurry, dark, or rotated. Please send a clearer photo taken in good lighting, or type out the question.";
}

export function buildPhotoRejectionResponse(lang: ResponseLanguage): string {
  return lang === "bn"
    ? "এই ছবিতে কোনো পাঠ্যক্রম-সম্পর্কিত প্রশ্ন বা বিষয়বস্তু দেখা যাচ্ছে না। পাঠ্যপুস্তক বা পরীক্ষার প্রশ্নের ছবি পাঠান।"
    : "This image doesn't appear to contain any academic question or curriculum content. Please send a photo of a textbook question or exam problem.";
}

export function buildPartialImageResponse(lang: ResponseLanguage, partialReason?: string | null): string {
  if (lang === "bn") {
    const reason = partialReason ? ` (${partialReason})` : "";
    return `ছবির কিছু অংশ স্পষ্ট নয়${reason}। যতটুকু পড়া গেছে তার ভিত্তিতে উত্তর সম্ভব নয়। অনুগ্রহ করে আরও স্পষ্ট বা ক্রপ করা ছবি পাঠান, অথবা প্রশ্নটি টাইপ করুন।`;
  }
  const reason = partialReason ? ` (${partialReason})` : "";
  return `Part of the image is not clearly readable${reason}. The readable portion is not enough to answer reliably. Please send a clearer or cropped photo, or type out the question.`;
}

export function buildEquationUnverifiedResponse(lang: ResponseLanguage): string {
  return lang === "bn"
    ? "ছবির গণিত বা পদার্থবিজ্ঞানের সমীকরণগুলো নিশ্চিতভাবে পড়া যাচ্ছে না। সমীকরণটি টাইপ করে পাঠান অথবা আরও স্পষ্ট ছবি পাঠান।"
    : "The math or physics equations in the image could not be read with confidence. Please type out the equation or send a clearer image.";
}

export function buildDiagramUnverifiedResponse(lang: ResponseLanguage, partialReason?: string | null): string {
  const reason = partialReason ? ` (${partialReason})` : "";
  return lang === "bn"
    ? `ছবির চিত্রের লেবেলগুলো${reason ? ` ${reason}` : ""} অস্পষ্ট। একটি ক্রপ করা, উন্নত রেজোলিউশনের ছবি পাঠান।`
    : `The diagram labels in the image are unclear${reason}. Please send a cropped or higher-resolution image.`;
}

// ── Budget helper: which content types need fine-grained detail ───────────────

/**
 * Returns true for image types where fine visual detail matters —
 * diagrams with small labels, equations, and mixed layouts.
 * Simple text and MCQs are fine with "low" detail.
 */
export function needsHighDetail(contentType: ImageContentType | undefined): boolean {
  return (
    contentType === "diagram" ||
    contentType === "equation" ||
    contentType === "mixed" ||
    contentType === "table"
  );
}

// ── Core analyzer ─────────────────────────────────────────────────────────────

function parseAnalysisResult(raw: string): ImageAnalysisResult | null {
  try {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as ImageAnalysisResult;
    if (
      typeof parsed.readability !== "string" ||
      typeof parsed.contentType !== "string" ||
      typeof parsed.description !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

const VALID_READABILITY: ImageReadability[] = ["readable", "partial", "unreadable"];
const VALID_CONTENT_TYPES: ImageContentType[] = [
  "text", "mcq", "diagram", "table", "equation", "mixed", "photo",
];
const VALID_IMAGE_LANGUAGES = new Set(["bn", "en", "mixed"]);

function sanitizeResult(raw: ImageAnalysisResult): ImageAnalysisResult {
  const imageLanguage = raw.imageLanguage && VALID_IMAGE_LANGUAGES.has(raw.imageLanguage)
    ? raw.imageLanguage as "bn" | "en" | "mixed"
    : null;

  return {
    readability: VALID_READABILITY.includes(raw.readability) ? raw.readability : "partial",
    contentType: VALID_CONTENT_TYPES.includes(raw.contentType) ? raw.contentType : "mixed",
    extractedText: typeof raw.extractedText === "string" && raw.extractedText.trim().length > 0
      ? raw.extractedText.trim()
      : null,
    description: raw.description ?? "Academic image",
    imageLanguage,
    partialReason: typeof raw.partialReason === "string" && raw.partialReason.trim().length > 0
      ? raw.partialReason.trim()
      : null,
  };
}

const PARTIAL_FALLBACK: ImageAnalysisResult = {
  readability: "partial",
  contentType: "mixed",
  extractedText: null,
  description: "Image could not be fully analyzed",
  imageLanguage: null,
  partialReason: "Analysis failed — image may be unclear or the extraction service is temporarily unavailable",
};

/**
 * Analyzes an uploaded image using the strong vision model.
 *
 * Extraction pipeline note:
 * - In a Python environment, Pix2Text (pip install pix2text[multilingual]) would be used
 *   here for superior Bangla/English mixed OCR and formula extraction.
 *   See: https://github.com/breezedeus/pix2text
 * - In this Node.js/TypeScript environment, the vision model (GPT-4.1 with high detail)
 *   serves as the extraction layer.
 *
 * Uses "high" detail unconditionally — exam sheets with small Bengali text,
 * geometry labels, option values, and diagram arrows all require maximum
 * resolution. Accuracy here gates the entire answer pipeline.
 *
 * Max 1200 output tokens — enough for a full exam sheet with multiple
 * numbered questions, Roman MCQ statements, and option lists.
 * Fails open: parse/network failure → treat as "partial" with no extracted text.
 */
export async function analyzeImage(
  imageDataUrl: string,
  _lang: ResponseLanguage,
  context?: { subject?: string; chapter?: string },
): Promise<ImageAnalysisResult> {
  if (!serverConfig.enableVision) return PARTIAL_FALLBACK;

  const model = new ChatOpenAI({
    model: serverConfig.strongModel,
    maxTokens: 1200,
    temperature: 0,
    apiKey: serverConfig.openaiApiKey,
    modelKwargs: { response_format: { type: "json_object" } },
  });

  const message = new HumanMessage({
    content: [
      {
        type: "image_url",
        // Always "high" detail — small text, Bengali script, geometry labels,
        // equation symbols, and exam sheet structure all require maximum resolution.
        image_url: { url: imageDataUrl, detail: "high" },
      },
      {
        type: "text",
        text: buildAnalysisPrompt(context),
      },
    ],
  });

  try {
    const chain = model.pipe(new StringOutputParser());
    const raw = await chain.invoke([message]);
    const parsed = parseAnalysisResult(raw);
    if (!parsed) return PARTIAL_FALLBACK;
    return sanitizeResult(parsed);
  } catch {
    return PARTIAL_FALLBACK;
  }
}
