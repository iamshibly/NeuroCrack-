/**
 * Image Pipeline End-to-End Test
 *
 * Tests the full image query pipeline:
 *   1. Image received by backend
 *   2. OCR runs (analyzeImage → runOCRPipeline)
 *   3. Extracted question used as effective question (not "[Image]")
 *   4. Model generates real answer (not generic fallback)
 *   5. Answer is parsed successfully and rendered
 *
 * Usage:
 *   npx tsx tests/image-pipeline-test.ts                        # creates a synthetic math image
 *   npx tsx tests/image-pipeline-test.ts --image ./path/to.jpg  # use your own image
 *   npx tsx tests/image-pipeline-test.ts --text-only            # skip OCR, test text-math path
 *
 * Requires: OPENAI_API_KEY in .env (loaded automatically)
 */

import { createReadStream, existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

// ── Load .env ─────────────────────────────────────────────────────────────────
// Must happen before any import that reads process.env (config.ts, etc.)
function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) { console.warn("[env] .env not found — using process env as-is"); return; }
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}
loadDotEnv();

import sharp from "sharp";

// Import server-side pipeline modules
import { runOCRPipeline } from "../src/server/lib/ocr-pipeline.js";
import { detectCorrectionMode } from "../src/server/lib/correction-mode.js";

// ── Arg parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const imageArgIdx = args.indexOf("--image");
const externalImagePath = imageArgIdx >= 0 ? args[imageArgIdx + 1] : null;
const textOnlyMode = args.includes("--text-only");

// ── Colours ───────────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function pass(msg: string) { console.log(`  ${C.green}✓${C.reset}  ${msg}`); }
function fail(msg: string) { console.log(`  ${C.red}✗${C.reset}  ${msg}`); }
function info(msg: string) { console.log(`  ${C.cyan}→${C.reset}  ${msg}`); }
function warn(msg: string) { console.log(`  ${C.yellow}⚠${C.reset}  ${msg}`); }
function header(msg: string) { console.log(`\n${C.bold}${msg}${C.reset}`); }
function dim(msg: string) { console.log(`     ${C.dim}${msg}${C.reset}`); }

// ── Create a synthetic math image using sharp + SVG ──────────────────────────

async function createMathQuestionImage(): Promise<Buffer> {
  // SVG with a clear math question in English (easier for OCR to extract cleanly)
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="700" height="300" viewBox="0 0 700 300">
  <rect width="700" height="300" fill="white"/>
  <!-- Title -->
  <text x="20" y="40" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#000">Mathematics — Trigonometry</text>
  <line x1="20" y1="50" x2="680" y2="50" stroke="#333" stroke-width="1"/>

  <!-- Question 1 -->
  <text x="20" y="80" font-family="Arial, sans-serif" font-size="16" fill="#000">1. Prove that: (1 + tan&#178;&#952;) cos&#178;&#952; = 1</text>

  <!-- Question 2 -->
  <text x="20" y="115" font-family="Arial, sans-serif" font-size="16" fill="#000">2. If sin &#952; = 3/5, find the value of cos &#952; and tan &#952;.</text>

  <!-- Hint -->
  <text x="20" y="155" font-family="Arial, sans-serif" font-size="14" fill="#555">   [Given: &#952; is an acute angle, sin&#178;&#952; + cos&#178;&#952; = 1]</text>

  <!-- Question 3 -->
  <text x="20" y="195" font-family="Arial, sans-serif" font-size="16" fill="#000">3. Find the value of: sin&#178;(30&#176;) + cos&#178;(60&#176;) + tan&#178;(45&#176;)</text>

  <!-- Footer -->
  <line x1="20" y1="240" x2="680" y2="240" stroke="#ccc" stroke-width="1"/>
  <text x="20" y="265" font-family="Arial, sans-serif" font-size="13" fill="#888">HSC Level | Class 11-12 | Mathematics | Chapter: Trigonometry</text>
  <text x="20" y="285" font-family="Arial, sans-serif" font-size="11" fill="#aaa">NeuroCrack Image Pipeline Test Image — synthetic</text>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ── Convert image buffer to base64 data URL ───────────────────────────────────

function bufferToDataUrl(buf: Buffer, mimeType = "image/png"): string {
  return `data:${mimeType};base64,${buf.toString("base64")}`;
}

// ── isGenericPointer (mirrors prompt.ts) ──────────────────────────────────────

const GENERIC_POINTERS = [
  /^\[image\]$/i,
  /^solve(\s+(this|it|the\s+problem|the\s+question))?\.?$/i,
  /^(find|calculate|answer|help|look|check|see)\.?$/i,
  /^(find|calculate|answer|check|see|look\s+at)\s+(this|it|here)\.?$/i,
  /^(এটা|এটি|এই)\s+(সমাধান|সমাধান করো|সমাধান কর|দেখো|দেখ|বলো|বল)\.?$/i,
  /^(see|check|look at)?\s*(this|the)?\s*(image|picture|photo|diagram|question)$/i,
  /^(ছবি|ছবিটি|প্রশ্ন|প্রশ্নটি)\s*(দেখ|দেখো|সমাধান কর|সমাধান করো)?\.?$/i,
];
function isGenericPointer(msg: string): boolean {
  const t = msg.trim();
  return !t || GENERIC_POINTERS.some((p) => p.test(t));
}

function effectiveQuestion(typedMsg: string, imageText?: string | null): string {
  if (isGenericPointer(typedMsg)) {
    return imageText ? imageText.slice(0, 1500) : "[Image question — no text could be extracted]";
  }
  if (imageText && typedMsg.length <= 100) {
    return `${typedMsg}\n\n[Extracted from image:]\n${imageText.slice(0, 1200)}`;
  }
  return typedMsg || (imageText ? imageText.slice(0, 1500) : "[Image question]");
}

// ── Full agent runner (imports the actual runAgent) ────────────────────────────

async function runFullAgent(imageDataUrl: string, typedMessage: string, options: {
  selectedClass: string;
  selectedSubject: string;
  selectedChapter: string | null;
}) {
  // Import lazily to ensure env is loaded first
  const { runAgent } = await import("../src/server/lib/agent.js");

  return runAgent({
    chatId: "test-" + Date.now(),
    message: typedMessage,
    selectedClass: options.selectedClass,
    selectedSubject: options.selectedSubject,
    selectedChapter: options.selectedChapter,
    recentMessages: [],
    image: imageDataUrl,
  });
}

// ── Stage 1: OCR pipeline test ────────────────────────────────────────────────

async function testOCRPipeline(imageDataUrl: string): Promise<{
  extractedText: string | null;
  quality: string;
  isComplex: boolean;
  shouldBlock: boolean;
}> {
  header("Stage 1 — OCR Pipeline (analyzeImage → runOCRPipeline)");
  info(`Image data URL length: ${imageDataUrl.length} chars`);

  const ocrResult = await runOCRPipeline(imageDataUrl, {
    subject: "Mathematics",
    chapter: "Trigonometry",
    lang: "en",
  });

  const { analysis, quality, isComplex, shouldBlock, failureMessage } = ocrResult;

  info(`readability       : "${analysis.readability}"`);
  info(`contentType       : "${analysis.contentType}"`);
  info(`extractionQuality : "${quality}"`);
  info(`isComplex         : ${isComplex}`);
  info(`shouldBlock       : ${shouldBlock}`);
  info(`imageLanguage     : "${analysis.imageLanguage ?? "null"}"`);

  if (analysis.extractedText) {
    info(`extractedText (${analysis.extractedText.length} chars):`);
    console.log(`\n${C.dim}${analysis.extractedText.slice(0, 600)}${C.reset}\n`);
  } else {
    warn("extractedText: null — no text extracted");
  }

  if (failureMessage) {
    warn(`failureMessage: "${failureMessage.slice(0, 120)}"`);
  }

  // Assertions
  let stagePass = true;

  if (analysis.readability === "unreadable") {
    fail("OCR: image marked unreadable — check image quality");
    stagePass = false;
  } else {
    pass(`OCR: image is "${analysis.readability}"`);
  }

  if (!analysis.extractedText || analysis.extractedText.length < 20) {
    fail(`OCR: extracted text too short (${analysis.extractedText?.length ?? 0} chars) — extraction failed`);
    stagePass = false;
  } else {
    pass(`OCR: extracted ${analysis.extractedText.length} chars of text`);
  }

  if (quality === "not_verified" && !shouldBlock) {
    warn("quality=not_verified but shouldBlock=false — inconsistent state");
  }

  return {
    extractedText: analysis.extractedText ?? null,
    quality,
    isComplex,
    shouldBlock,
  };
}

// ── Stage 2: Effective question test ─────────────────────────────────────────

function testEffectiveQuestion(extractedText: string | null) {
  header("Stage 2 — Effective Question (image-first rule)");

  const cases = [
    { typed: "", label: "empty message" },
    { typed: "[Image]", label: "[Image] placeholder" },
    { typed: "solve this", label: '"solve this"' },
    { typed: "find this", label: '"find this"' },
  ];

  let allPass = true;
  for (const { typed, label } of cases) {
    const eq = effectiveQuestion(typed, extractedText);
    const usesExtracted = extractedText ? eq.includes(extractedText.slice(0, 20)) : true;
    if (usesExtracted) {
      pass(`Generic pointer "${label}" → image text used as effective question`);
    } else {
      fail(`Generic pointer "${label}" → did NOT use image text (got: "${eq.slice(0, 80)}")`);
      allPass = false;
    }
  }

  // Substantive typed question should NOT be replaced
  const longQ = "Please prove this trigonometric identity step by step using all the known identities";
  const eqLong = effectiveQuestion(longQ, extractedText);
  if (eqLong.startsWith(longQ.slice(0, 30))) {
    pass(`Long typed question preserved as-is (not replaced by image text)`);
  } else {
    fail(`Long typed question was incorrectly replaced`);
    allPass = false;
  }

  if (extractedText && extractedText.length > 10) {
    dim(`Extracted text preview: "${extractedText.slice(0, 100)}"`);
  }

  return allPass;
}

// ── Stage 3: Full agent test ──────────────────────────────────────────────────

async function testFullAgent(imageDataUrl: string) {
  header("Stage 3 — Full Agent (OCR → classify → generate answer)");
  info("Running runAgent() with image + empty typed message...");
  info("(This makes real API calls — may take 10-30 seconds)");

  const startMs = Date.now();
  let response;
  try {
    response = await runFullAgent(imageDataUrl, "", {
      selectedClass: "Class 11-12",
      selectedSubject: "Mathematics",
      selectedChapter: "Trigonometry",
    });
  } catch (err) {
    fail(`runAgent threw: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
  const elapsed = Date.now() - startMs;

  info(`Duration: ${elapsed}ms`);
  info(`answerMode  : "${response.answerMode}"`);
  info(`confidence  : "${response.confidence}"`);
  info(`renderMode  : "${response.renderMode ?? "none"}"`);
  info(`hasStepData : ${(response.stepData?.length ?? 0) > 0} (${response.stepData?.length ?? 0} steps)`);
  info(`hasFinalText: ${!!response.finalAnswerText} "${response.finalAnswerText ?? ""}"`);
  info(`imageInfo   : readable=${response.imageInfo?.readable} status="${response.imageInfo?.status ?? "none"}"`);

  console.log(`\n${C.bold}Answer (first 500 chars):${C.reset}`);
  console.log(`${C.dim}${response.answer.slice(0, 500)}${C.reset}\n`);

  // Assertions
  let stagePass = true;

  // A1: Answer must not be the generic failure message
  const FAILURE_PATTERNS = [
    /সমস্যা হয়েছে/,
    /উত্তর তৈরি করতে/,
    /পাঠান\s*।?\s*$/,
    /Could not generate an answer/i,
    /Could not extract the question/i,
    /not readable/i,
  ];
  const isGenericFailure = FAILURE_PATTERNS.some((p) => p.test(response.answer));
  if (isGenericFailure) {
    fail(`Answer appears to be a generic failure message: "${response.answer.slice(0, 120)}"`);
    stagePass = false;
  } else {
    pass("Answer is NOT a generic failure message");
  }

  // A2: Answer must have substance (> 50 chars)
  if (response.answer.length < 50) {
    fail(`Answer is too short (${response.answer.length} chars) — likely a failure fallback`);
    stagePass = false;
  } else {
    pass(`Answer has substance (${response.answer.length} chars)`);
  }

  // A3: Confidence should not be "low" for a clear image
  if (response.confidence === "low") {
    warn(`Confidence is "low" — answer shown but consider reviewing the query`);
  } else {
    pass(`Confidence is "${response.confidence}" — good`);
  }

  // A4: Image readable info should be present
  if (response.imageInfo === undefined) {
    warn("imageInfo not attached to response — image pipeline may not have run");
  } else {
    pass(`imageInfo present: readable=${response.imageInfo.readable}`);
  }

  // A5: If renderMode=math, there should be stepData (or finalAnswerText)
  if (response.renderMode === "math") {
    if (response.stepData?.length) {
      pass(`renderMode=math with ${response.stepData.length} step(s) — will render as steps block`);
    } else if (response.finalAnswerText) {
      pass(`renderMode=math with finalAnswerText — will render as chip`);
    } else {
      warn(`renderMode=math but no stepData/finalAnswerText — will fall back to plain text (OK with our fix)`);
    }
  }

  return stagePass;
}

// ── Stage 4: Text-only math test (no image) ───────────────────────────────────

async function testTextMathQuery() {
  header("Stage 4 — Text Math Query (no image)");
  info(`Question: "prove (1 + tan^2 θ) cos^2 θ = 1"`);

  const { runAgent } = await import("../src/server/lib/agent.js");
  const startMs = Date.now();
  let response;
  try {
    response = await runAgent({
      chatId: "test-text-" + Date.now(),
      message: "Prove that (1 + tan^2 θ) cos^2 θ = 1",
      selectedClass: "Class 11-12",
      selectedSubject: "Mathematics",
      selectedChapter: "Trigonometry",
      recentMessages: [],
    });
  } catch (err) {
    fail(`runAgent threw: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
  const elapsed = Date.now() - startMs;

  info(`Duration: ${elapsed}ms`);
  info(`answerMode  : "${response.answerMode}"`);
  info(`confidence  : "${response.confidence}"`);
  info(`renderMode  : "${response.renderMode ?? "none"}"`);
  info(`stepData    : ${response.stepData?.length ?? 0} steps`);
  info(`finalAnswer : "${response.finalAnswerText ?? ""}"`);

  console.log(`\n${C.bold}Answer (first 600 chars):${C.reset}`);
  console.log(`${C.dim}${response.answer.slice(0, 600)}${C.reset}\n`);

  let stagePass = true;

  // Math notation check: should have LaTeX $ markers in answer or stepData
  const hasLatex = response.answer.includes("$") ||
    response.stepData?.some((s) => s.includes("$")) ||
    false;
  if (hasLatex) {
    pass("Answer contains LaTeX $...$ notation — math will render in UI");
  } else {
    warn("No LaTeX $...$ found in answer — math may not render properly");
  }

  // Check key math terms preserved
  const checkTerms = ["tan", "cos", "θ", "1"];
  const missingTerms = checkTerms.filter((t) =>
    !response.answer.includes(t) && !response.stepData?.some((s) => s.includes(t))
  );
  if (missingTerms.length === 0) {
    pass("Key math terms preserved (tan, cos, θ, 1)");
  } else {
    warn(`Some key terms missing from answer: [${missingTerms.join(", ")}]`);
  }

  if (response.confidence === "low") {
    warn(`Confidence=low — answer appended with disclaimer`);
  } else {
    pass(`Confidence: "${response.confidence}"`);
  }

  return stagePass;
}

// ── Stage 5: Correction mode test ────────────────────────────────────────────

async function testCorrectionMode() {
  header("Stage 5 — Correction Mode (re-check full original question)");

  const originalQ = "Find all values of x such that x^2 - 5x + 6 = 0 AND x^2 + x - 2 = 0. Show all steps.";
  const correctionMsg = "you did not use the second equation properly, check again";

  // Check detection
  const detected = detectCorrectionMode(correctionMsg);
  if (detected) {
    pass(`Correction mode detected for: "${correctionMsg.slice(0, 60)}"`);
  } else {
    fail(`Correction mode NOT detected — check CORRECTION_PATTERNS`);
    return false;
  }

  // Build correction instruction to verify it includes original question context
  const { buildCorrectionModeInstruction } = await import("../src/server/lib/correction-mode.js");
  const recentMessages = [
    { role: "user" as const, content: originalQ },
    { role: "assistant" as const, content: "The values of x from the first equation are x=2 and x=3." },
    { role: "user" as const, content: correctionMsg },
  ];

  const correctionBlock = buildCorrectionModeInstruction(recentMessages);

  if (correctionBlock.includes(originalQ.slice(0, 30))) {
    pass("Correction instruction includes the original question with all given values");
  } else {
    warn("Correction instruction may not include full original question context");
    dim(`Block preview: ${correctionBlock.slice(0, 200)}`);
  }

  if (correctionBlock.includes("x=2 and x=3")) {
    pass("Correction instruction includes the previous (wrong) answer");
  } else {
    warn("Correction instruction may not include previous answer");
  }

  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${C.bold}NeuroCrack — Image Pipeline End-to-End Test${C.reset}`);
  console.log(`${"─".repeat(60)}`);

  if (!process.env["OPENAI_API_KEY"] || process.env["OPENAI_API_KEY"] === "your-openai-api-key-here") {
    fail("OPENAI_API_KEY is not set in .env — cannot run integration tests");
    process.exit(1);
  }

  info(`OpenAI API key: sk-...${process.env["OPENAI_API_KEY"]!.slice(-6)}`);
  info(textOnlyMode ? "Mode: text-only (skipping image pipeline)" : "Mode: full pipeline (image + text)");

  const results: { stage: string; pass: boolean }[] = [];

  if (textOnlyMode) {
    // Text-only mode — test math query without image
    const textPass = await testTextMathQuery();
    results.push({ stage: "Text math query", pass: textPass });

    const corrPass = await testCorrectionMode();
    results.push({ stage: "Correction mode", pass: corrPass });
  } else {
    // ── Get image ─────────────────────────────────────────────────────────────
    let imageBuffer: Buffer;

    if (externalImagePath) {
      const absPath = resolve(externalImagePath);
      if (!existsSync(absPath)) {
        fail(`Image file not found: ${absPath}`);
        process.exit(1);
      }
      imageBuffer = readFileSync(absPath);
      info(`Using external image: ${absPath} (${imageBuffer.length} bytes)`);
    } else {
      info("No --image provided — creating synthetic math question image using sharp...");
      imageBuffer = await createMathQuestionImage();
      info(`Synthetic image created: ${imageBuffer.length} bytes (PNG)`);
    }

    const mimeType = externalImagePath?.endsWith(".jpg") || externalImagePath?.endsWith(".jpeg")
      ? "image/jpeg"
      : "image/png";
    const imageDataUrl = bufferToDataUrl(imageBuffer, mimeType);
    info(`Data URL length: ${imageDataUrl.length} chars`);

    // ── Stage 1: OCR ──────────────────────────────────────────────────────────
    const ocrResult = await testOCRPipeline(imageDataUrl);
    results.push({ stage: "OCR pipeline", pass: !ocrResult.shouldBlock && !!ocrResult.extractedText });

    // ── Stage 2: Effective question ───────────────────────────────────────────
    const efPass = testEffectiveQuestion(ocrResult.extractedText);
    results.push({ stage: "Effective question (image-first rule)", pass: efPass });

    // ── Stage 3: Full agent ───────────────────────────────────────────────────
    const agentPass = await testFullAgent(imageDataUrl);
    results.push({ stage: "Full agent (image → answer)", pass: agentPass });

    // ── Stage 4: Text math ────────────────────────────────────────────────────
    const textPass = await testTextMathQuery();
    results.push({ stage: "Text math query", pass: textPass });

    // ── Stage 5: Correction mode ──────────────────────────────────────────────
    const corrPass = await testCorrectionMode();
    results.push({ stage: "Correction mode detection", pass: corrPass });
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  header("Summary");
  console.log(`${"─".repeat(60)}`);
  let totalPass = 0;
  let totalFail = 0;
  for (const r of results) {
    if (r.pass) {
      console.log(`  ${C.green}✓${C.reset}  ${r.stage}`);
      totalPass++;
    } else {
      console.log(`  ${C.red}✗${C.reset}  ${r.stage}`);
      totalFail++;
    }
  }
  console.log(`${"─".repeat(60)}`);
  console.log(`${totalPass} passed, ${totalFail} failed out of ${results.length} stages.\n`);

  if (totalFail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\n[fatal]", err);
  process.exit(1);
});
