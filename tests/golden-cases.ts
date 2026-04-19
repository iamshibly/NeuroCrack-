// Golden test cases for the NeuroCrack academic agent.
//
// Usage: Run manually against a live dev server to verify routing, model tier
// selection, render mode, and language detection are working as expected.
// Each case describes what the backend SHOULD produce — not a strict assertion,
// but a reference for manual spot-checking and future automated testing.
//
// To test a case:
//   POST /api/ask  with the fields from `input` + a real chatId
//
// How to read `expected`:
//   - answerStyle    → AgentResponse.answerMode
//   - renderMode     → AgentResponse.renderMode (if set)
//   - language       → AgentResponse.responseLanguage
//   - shouldUseRetrieval  → evidenceDocs.length > 0 (check the [nc] log line)
//   - shouldUseStrongModel → tier field in the [nc] log line

import type { AnswerMode, ResponseLanguage, RenderMode, ModelTier } from "../src/server/lib/types";

export type GoldenInput = {
  message: string;
  selectedClass: string;
  selectedSubject: string;
  selectedChapter?: string | null;
  /** Use the literal string "[placeholder]" for image-dependent cases. */
  image?: "[placeholder]";
};

export type GoldenExpected = {
  answerStyle: AnswerMode;
  renderMode?: RenderMode;
  language: ResponseLanguage;
  shouldUseRetrieval: boolean;
  shouldUseStrongModel: boolean;
  /** Minimum model tier that must be selected (strong > medium > lightweight). */
  minTier?: ModelTier;
};

export type GoldenCase = {
  id: string;
  input: GoldenInput;
  expected: GoldenExpected;
  notes?: string;
};

// ── Cases ─────────────────────────────────────────────────────────────────────

export const goldenCases: GoldenCase[] = [
  // ── 1. Simple Bangla short answer ──────────────────────────────────────────
  {
    id: "bn-short-01",
    input: {
      message: "হৃদপিণ্ড কী?",
      selectedClass: "SSC",
      selectedSubject: "Biology",
      selectedChapter: null,
    },
    expected: {
      answerStyle: "short_answer",
      renderMode: "text",
      language: "bn",
      shouldUseRetrieval: false,
      shouldUseStrongModel: false,
    },
    notes: "Single Bengali factual question — should route direct, lightweight or medium tier.",
  },

  // ── 2. Simple English short answer ─────────────────────────────────────────
  {
    id: "en-short-01",
    input: {
      message: "What is osmosis?",
      selectedClass: "SSC",
      selectedSubject: "Biology",
      selectedChapter: null,
    },
    expected: {
      answerStyle: "short_answer",
      renderMode: "text",
      language: "en",
      shouldUseRetrieval: false,
      shouldUseStrongModel: false,
    },
    notes: "Expect very_short_answer or short_answer. Lightweight tier likely.",
  },

  // ── 3. Standard MCQ ────────────────────────────────────────────────────────
  {
    id: "en-mcq-01",
    input: {
      message: [
        "Which of the following is a function of the liver?",
        "A) Pumping blood",
        "B) Producing bile",
        "C) Filtering air",
        "D) Producing insulin",
      ].join("\n"),
      selectedClass: "HSC (Science)",
      selectedSubject: "Biology",
      selectedChapter: null,
    },
    expected: {
      answerStyle: "mcq",
      renderMode: "text",
      language: "en",
      shouldUseRetrieval: false,
      shouldUseStrongModel: false,
    },
    notes: "Standard A/B/C/D MCQ — should pick the correct option with explanation. Lightweight eligible.",
  },

  // ── 4. Roman-style MCQ ─────────────────────────────────────────────────────
  {
    id: "bn-roman-mcq-01",
    input: {
      message: [
        "নিচের তথ্যগুলো লক্ষ্য কর:",
        "i. মাইটোকন্ড্রিয়া কোষের শক্তি উৎপাদন করে",
        "ii. ক্লোরোপ্লাস্ট সালোকসংশ্লেষণ করে",
        "iii. নিউক্লিয়াস প্রোটিন সংশ্লেষণ করে",
        "নিচের কোনটি সঠিক?",
        "ক) i ও ii",
        "খ) i ও iii",
        "গ) ii ও iii",
        "ঘ) i, ii ও iii",
      ].join("\n"),
      selectedClass: "HSC (Science)",
      selectedSubject: "Biology",
      selectedChapter: null,
    },
    expected: {
      answerStyle: "roman_mcq",
      renderMode: "roman_mcq",
      language: "bn",
      shouldUseRetrieval: false,
      shouldUseStrongModel: true,
      minTier: "strong",
    },
    notes: "Roman numeral MCQ — must use strong model, return statementChecks + finalOption.",
  },

  // ── 5. Multi-question prompt ───────────────────────────────────────────────
  {
    id: "en-multi-01",
    input: {
      message: [
        "1. What is DNA?",
        "2. What is RNA?",
        "3. How does transcription differ from translation?",
      ].join("\n"),
      selectedClass: "HSC (Science)",
      selectedSubject: "Biology",
      selectedChapter: null,
    },
    expected: {
      answerStyle: "multi_part",
      renderMode: "text",
      language: "en",
      shouldUseRetrieval: false,
      shouldUseStrongModel: true,
      minTier: "strong",
    },
    notes: "3-part numbered question — partCount=3 triggers strong tier.",
  },

  // ── 6. Math step-by-step ───────────────────────────────────────────────────
  {
    id: "en-math-01",
    input: {
      message: "If F = ma, find the force when mass = 5 kg and acceleration = 10 m/s². Show all steps.",
      selectedClass: "HSC (Science)",
      selectedSubject: "Physics",
      selectedChapter: null,
    },
    expected: {
      answerStyle: "math_solution",
      renderMode: "math",
      language: "en",
      shouldUseRetrieval: false,
      shouldUseStrongModel: true,
      minTier: "strong",
    },
    notes: "Math solution — should return stepData[] with LaTeX. Strong model for detailed targetLength.",
  },

  // ── 7. HSC Zoology chapter question (retrieval) ───────────────────────────
  {
    id: "bn-chapter-01",
    input: {
      message: "গলজি বডির কাজ কী? বিস্তারিত লিখ।",
      selectedClass: "HSC (Science)",
      selectedSubject: "Zoology",
      selectedChapter: "Cell Biology and Cell Division",
    },
    expected: {
      answerStyle: "short_answer",
      renderMode: "text",
      language: "bn",
      shouldUseRetrieval: true,
      shouldUseStrongModel: false,
    },
    notes: "Zoology + chapter selected → strategy=chapter → evidenceDocs loaded. Check [nc] log: retrieval=chapter.",
  },

  // ── 8. Image-based question (vision path) ─────────────────────────────────
  {
    id: "en-image-01",
    input: {
      message: "",
      selectedClass: "HSC (Science)",
      selectedSubject: "Biology",
      selectedChapter: null,
      image: "[placeholder]",
    },
    expected: {
      answerStyle: "short_answer",
      renderMode: "text",
      language: "en",
      shouldUseRetrieval: false,
      shouldUseStrongModel: false,
    },
    notes: [
      "Image-only send — message is empty.",
      "Expect analyzeImage node to run (vision=true in [nc] log).",
      "Replace [placeholder] with a real base64 data URL before testing.",
      "If image is unreadable, agent returns a polite rejection in the same language.",
    ].join(" "),
  },

  // ── 9. Comparison table question ──────────────────────────────────────────
  {
    id: "bn-table-01",
    input: {
      message: "মাইটোসিস ও মিয়োসিসের মধ্যে পার্থক্য তুলনামূলক ছকে লিখ।",
      selectedClass: "HSC (Science)",
      selectedSubject: "Biology",
      selectedChapter: null,
    },
    expected: {
      answerStyle: "comparison",
      renderMode: "table",
      language: "bn",
      shouldUseRetrieval: false,
      shouldUseStrongModel: false,
    },
    notes: "Comparison question — should return renderMode=table + tableData with 3–8 rows.",
  },

  // ── 10. Clarification needed ───────────────────────────────────────────────
  {
    id: "en-clarify-01",
    input: {
      message: "explain everything",
      selectedClass: "HSC (Science)",
      selectedSubject: "Biology",
      selectedChapter: null,
    },
    expected: {
      answerStyle: "short_answer",
      renderMode: "text",
      language: "en",
      shouldUseRetrieval: false,
      shouldUseStrongModel: false,
    },
    notes: [
      "Vague message — strategy=clarify.",
      "Response should have needsClarification=true + clarificationOptions array.",
      "No LLM answer call should run (zero model cost for this path).",
    ].join(" "),
  },
];

// ── Quick reference ───────────────────────────────────────────────────────────
// Print a summary table to stdout when this file is run directly:
//   npx ts-node tests/golden-cases.ts

if (process.argv[1]?.endsWith("golden-cases.ts") || process.argv[1]?.endsWith("golden-cases.js")) {
  const col = (s: string, w: number) => s.padEnd(w).slice(0, w);
  console.log("\nNeuroCrack — Golden Cases\n");
  console.log(
    col("ID", 22) +
    col("LANG", 5) +
    col("EXPECT MODE", 18) +
    col("RENDER", 12) +
    col("RETRIEVAL", 10) +
    col("STRONG", 7) +
    "NOTES",
  );
  console.log("─".repeat(110));
  for (const c of goldenCases) {
    console.log(
      col(c.id, 22) +
      col(c.expected.language, 5) +
      col(c.expected.answerStyle, 18) +
      col(c.expected.renderMode ?? "text", 12) +
      col(c.expected.shouldUseRetrieval ? "yes" : "no", 10) +
      col(c.expected.shouldUseStrongModel ? "yes" : "no", 7) +
      (c.notes?.slice(0, 60) ?? ""),
    );
  }
  console.log();
}
