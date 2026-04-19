/**
 * Parser unit fixtures for multi-question splitting.
 *
 * These are pure parser tests — no LLM calls, no network, zero cost.
 * Run with: npx ts-node tests/parser-fixtures.ts
 *
 * Each fixture verifies that:
 *   - isMultiQuestion() correctly identifies the message
 *   - splitIntoSubQuestions() returns the expected number of sub-questions in order
 *   - detectedKindHint is correct for each sub-question
 */

import {
  isMultiQuestion,
  splitIntoSubQuestions,
  type SubQuestion,
} from "../src/server/lib/multi-question";

// ── Fixture type ──────────────────────────────────────────────────────────────

type ParserFixture = {
  id: string;
  description: string;
  message: string;
  expectedCount: number;
  expectedNumbers?: string[];
  expectedKindHints?: Array<"roman_mcq" | "mcq" | "simple">;
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

export const parserFixtures: ParserFixture[] = [
  // ── 1. Normal multi-MCQ block (Arabic digits, paren format) ─────────────────
  {
    id: "multi-mcq-arabic-01",
    description: "6 normal MCQs numbered 1)–6) — the exact reported failure mode",
    message: [
      "1) Which organ pumps blood?",
      "A) Liver",
      "B) Heart",
      "C) Kidney",
      "D) Lung",
      "",
      "2) নিচের তথ্যগুলো লক্ষ্য কর:",
      "i. মাইটোকন্ড্রিয়া কোষের শক্তি উৎপাদন করে",
      "ii. ক্লোরোপ্লাস্ট সালোকসংশ্লেষণ করে",
      "iii. নিউক্লিয়াস প্রোটিন সংশ্লেষণ করে",
      "নিচের কোনটি সঠিক?",
      "ক) i ও ii",
      "খ) i ও iii",
      "গ) ii ও iii",
      "ঘ) i, ii ও iii",
      "",
      "3) What is the powerhouse of the cell?",
      "A) Nucleus",
      "B) Ribosome",
      "C) Mitochondria",
      "D) Golgi body",
      "",
      "4) Which gas do plants absorb during photosynthesis?",
      "A) Oxygen",
      "B) Nitrogen",
      "C) Carbon dioxide",
      "D) Hydrogen",
      "",
      "5) নিচের তথ্যগুলো লক্ষ্য কর:",
      "i. DNA দ্বি-সূত্রক",
      "ii. RNA একক-সূত্রক",
      "iii. DNA শুধুমাত্র নিউক্লিয়াসে থাকে",
      "নিচের কোনটি সঠিক?",
      "ক) i ও ii",
      "খ) ii ও iii",
      "গ) i ও iii",
      "ঘ) i, ii ও iii",
      "",
      "6) What is the unit of heredity?",
      "A) Cell",
      "B) Chromosome",
      "C) Gene",
      "D) Nucleus",
    ].join("\n"),
    expectedCount: 6,
    expectedNumbers: ["1", "2", "3", "4", "5", "6"],
    expectedKindHints: ["mcq", "roman_mcq", "mcq", "mcq", "roman_mcq", "mcq"],
  },

  // ── 2. Roman MCQ inside a multi-question block ───────────────────────────────
  {
    id: "multi-roman-inside-01",
    description: "Q1 normal MCQ + Q2 Roman MCQ — Roman statements must stay with Q2",
    message: [
      "1. Which is the largest organ?",
      "A) Heart",
      "B) Liver",
      "C) Skin",
      "D) Lungs",
      "",
      "2. নিচের তথ্যগুলো লক্ষ্য কর:",
      "i. হৃদপিণ্ড রক্ত পাম্প করে",
      "ii. ফুসফুস গ্যাস বিনিময় করে",
      "iii. বৃক্ক রক্ত পরিশোধন করে",
      "নিচের কোনটি সঠিক?",
      "ক) i ও ii",
      "খ) i ও iii",
      "গ) ii ও iii",
      "ঘ) i, ii ও iii",
    ].join("\n"),
    expectedCount: 2,
    expectedNumbers: ["1", "2"],
    expectedKindHints: ["mcq", "roman_mcq"],
  },

  // ── 3. Bangla numbered questions (Bengali digits) ────────────────────────────
  {
    id: "multi-bangla-digits-01",
    description: "3 questions with Bangla digits ১) ২) ৩)",
    message: [
      "১) DNA কী?",
      "২) RNA কী?",
      "৩) প্রতিলিপি ও অনুবাদের মধ্যে পার্থক্য কী?",
    ].join("\n"),
    expectedCount: 3,
    expectedNumbers: ["১", "২", "৩"],
    expectedKindHints: ["simple", "simple", "simple"],
  },

  // ── 4. Mixed normal MCQ + Roman MCQ in one message ───────────────────────────
  {
    id: "multi-mixed-mcq-roman-01",
    description: "Q1 MCQ + Q2 Roman MCQ + Q3 MCQ — all three must survive",
    message: [
      "Q1) Which element has atomic number 6?",
      "A) Oxygen",
      "B) Carbon",
      "C) Nitrogen",
      "D) Hydrogen",
      "",
      "Q2) Which of the following is/are correct about mitosis?",
      "i. It produces 2 daughter cells",
      "ii. Chromosome number is halved",
      "iii. It occurs in somatic cells",
      "A) i and ii",
      "B) i and iii",
      "C) ii and iii",
      "D) i, ii and iii",
      "",
      "Q3) What is the pH of pure water?",
      "A) 5",
      "B) 7",
      "C) 9",
      "D) 14",
    ].join("\n"),
    expectedCount: 3,
    expectedNumbers: ["Q1", "Q2", "Q3"],
    expectedKindHints: ["mcq", "roman_mcq", "mcq"],
  },

  // ── 5. Q-prefix format (Q1/Q2) ───────────────────────────────────────────────
  {
    id: "multi-q-prefix-01",
    description: "Q1/Q2/Q3 format — must be detected as multi-question",
    message: [
      "Q1 What is osmosis?",
      "Q2 Define diffusion.",
      "Q3 How does active transport differ from passive transport?",
    ].join("\n"),
    expectedCount: 3,
    expectedNumbers: ["Q1", "Q2", "Q3"],
    expectedKindHints: ["simple", "simple", "simple"],
  },

  // ── 6. Bangla word prefix প্রশ্ন ────────────────────────────────────────────
  {
    id: "multi-bn-word-prefix-01",
    description: "প্রশ্ন ১ / প্রশ্ন ২ format",
    message: [
      "প্রশ্ন ১: মাইটোসিস কী?",
      "প্রশ্ন ২: মিয়োসিস কী?",
      "প্রশ্ন ৩: দুটির মধ্যে পার্থক্য কী?",
    ].join("\n"),
    expectedCount: 3,
    expectedNumbers: ["১", "২", "৩"],
    expectedKindHints: ["simple", "simple", "simple"],
  },

  // ── 7. Single Roman MCQ — must NOT be split ──────────────────────────────────
  {
    id: "single-roman-no-split-01",
    description: "A single Roman MCQ must not be split (Roman statements are NOT boundaries)",
    message: [
      "নিচের তথ্যগুলো লক্ষ্য কর:",
      "i. মাইটোকন্ড্রিয়া শক্তি উৎপাদন করে",
      "ii. ক্লোরোপ্লাস্ট সালোকসংশ্লেষণ করে",
      "iii. নিউক্লিয়াস প্রোটিন সংশ্লেষণ নিয়ন্ত্রণ করে",
      "নিচের কোনটি সঠিক?",
      "ক) i ও ii",
      "খ) i ও iii",
      "গ) ii ও iii",
      "ঘ) i, ii ও iii",
    ].join("\n"),
    expectedCount: 1,
    expectedKindHints: ["roman_mcq"],
  },

  // ── 8. Dot format — 1. 2. 3. ────────────────────────────────────────────────
  {
    id: "multi-dot-format-01",
    description: "1. 2. 3. dot format",
    message: [
      "1. What is DNA?",
      "2. What is RNA?",
      "3. How does transcription differ from translation?",
    ].join("\n"),
    expectedCount: 3,
    expectedNumbers: ["1", "2", "3"],
    expectedKindHints: ["simple", "simple", "simple"],
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

function runFixtures() {
  let passed = 0;
  let failed = 0;

  for (const fx of parserFixtures) {
    const isMulti = isMultiQuestion(fx.message);
    const subs: SubQuestion[] = splitIntoSubQuestions(fx.message);

    const countOk = subs.length === fx.expectedCount;
    const multiOk = fx.expectedCount >= 2 ? isMulti : !isMulti;

    const numbersOk =
      !fx.expectedNumbers ||
      fx.expectedNumbers.every((n, i) => subs[i]?.questionNumber === n);

    const hintsOk =
      !fx.expectedKindHints ||
      fx.expectedKindHints.every((h, i) => subs[i]?.detectedKindHint === h);

    const ok = countOk && multiOk && numbersOk && hintsOk;

    if (ok) {
      console.log(`  ✓  ${fx.id}`);
      passed++;
    } else {
      console.log(`  ✗  ${fx.id}  —  ${fx.description}`);
      if (!multiOk)
        console.log(`       isMultiQuestion: got ${isMulti}, expected ${fx.expectedCount >= 2}`);
      if (!countOk)
        console.log(`       sub-question count: got ${subs.length}, expected ${fx.expectedCount}`);
      if (!numbersOk) {
        const got = subs.map((s) => s.questionNumber).join(", ");
        console.log(`       numbers: got [${got}], expected [${fx.expectedNumbers!.join(", ")}]`);
      }
      if (!hintsOk) {
        const got = subs.map((s) => s.detectedKindHint).join(", ");
        console.log(`       hints: got [${got}], expected [${fx.expectedKindHints!.join(", ")}]`);
      }
      subs.forEach((s, i) => {
        console.log(`       sub[${i}] number="${s.questionNumber}" hint="${s.detectedKindHint}"`);
        console.log(`              rawText: ${s.rawText.split("\n")[0]?.slice(0, 60)}`);
      });
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed out of ${parserFixtures.length} fixtures.\n`);
  if (failed > 0) process.exit(1);
}

if (
  process.argv[1]?.endsWith("parser-fixtures.ts") ||
  process.argv[1]?.endsWith("parser-fixtures.js")
) {
  console.log("\nNeuroCrack — Parser Fixtures\n");
  runFixtures();
}
