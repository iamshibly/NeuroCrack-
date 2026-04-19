import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import type { AskRequest, ClarificationDecision, ResponseLanguage } from "./types";
import { serverConfig } from "../config";

// ── Rule-based clarification builder (primary — free, instant) ────────────────

const ZOOLOGY_CHAPTERS = [
  "Chapter 01: Diversity and Classification of Animals",
  "Chapter 02: Introduction to Animals",
  "Chapter 03: Digestion and Absorption",
  "Chapter 04: Blood Circulation",
];

const MIN_MEANINGFUL_LENGTH = 6;
const VAGUE_PATTERNS = [
  /^(help|hi|hello|okay|ok|yes|no|thanks|good|what|explain)\s*\.?$/i,
  /^\?+$/,
  /^(huh|hmm|why|how)\s*\.?$/i,
];

/**
 * Returns a clarification question + quick-pick options for the student.
 * Zero token cost — purely rule-based.
 */
export function buildClarificationOptions(req: AskRequest): {
  question: string;
  options: string[];
} {
  const isZoology = req.selectedSubject === "Zoology";
  const msg = req.message.trim().toLowerCase();

  if (isZoology && !req.selectedChapter) {
    return {
      question: "Which chapter is your question from?",
      options: [
        ...ZOOLOGY_CHAPTERS,
        "General Zoology question (no specific chapter)",
      ],
    };
  }

  if (msg.length < MIN_MEANINGFUL_LENGTH || VAGUE_PATTERNS.some((p) => p.test(msg))) {
    return {
      question: `What kind of help do you need for ${req.selectedSubject}?`,
      options: [
        "I have a specific question to ask",
        "I need a definition or meaning",
        "I need an MCQ answer",
        "I need a step-by-step explanation",
        "I need a short note",
      ],
    };
  }

  return {
    question: "Could you be more specific? I want to give you the right type of answer.",
    options: [
      "Short answer (2–3 lines)",
      "Detailed explanation",
      "MCQ style answer",
      "Step-by-step solution",
      "Definition only",
    ],
  };
}

// ── LLM-based clarification prompt (opt-in) ───────────────────────────────────
// Use only when rule-based options don't cover the question context well.

export const CLARIFICATION_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are NeuroCrack, an academic tutor for Bangladeshi students.
The student asked something vague or unclear. Generate a single clarifying question and 3–5 answer options.
Return ONLY valid JSON — no text before or after.

Schema:
{
  "needsClarification": true,
  "clarificationQuestion": "<one clear question for the student>",
  "clarificationOptions": ["<option1>", "<option2>", "<option3>"]
}

Rules:
- Question must be brief and student-friendly (≤ 15 words).
- Options must be concrete and mutually exclusive.
- 3 options minimum, 5 maximum.
- Match the language of the student's message (Bangla or English).`,
  ],
  [
    "human",
    `Class: {selectedClass}
Subject: {selectedSubject}
Chapter: {selectedChapter}
Student message: {message}`,
  ],
]);

export function parseClarificationDecision(raw: string): ClarificationDecision | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as ClarificationDecision;
    if (!parsed.clarificationQuestion || !Array.isArray(parsed.clarificationOptions)) return null;
    return {
      needsClarification: true,
      clarificationQuestion: parsed.clarificationQuestion,
      clarificationOptions: parsed.clarificationOptions,
    };
  } catch {
    return null;
  }
}

export function buildClarificationChain() {
  const model = new ChatOpenAI({
    model: serverConfig.lightweightModel,
    maxTokens: 120,
    temperature: 0,
    apiKey: serverConfig.openaiApiKey,
    modelKwargs: { response_format: { type: "json_object" } },
  });

  const fallback = (req: AskRequest): ClarificationDecision => {
    const { question, options } = buildClarificationOptions(req);
    return { needsClarification: true, clarificationQuestion: question, clarificationOptions: options };
  };

  return {
    invoke: async (input: {
      req: AskRequest;
      selectedClass: string;
      selectedSubject: string;
      selectedChapter: string;
      message: string;
      responseLanguage: ResponseLanguage;
    }): Promise<ClarificationDecision> => {
      try {
        const chain = CLARIFICATION_PROMPT.pipe(model).pipe(new StringOutputParser());
        const raw = await chain.invoke(input);
        return parseClarificationDecision(raw) ?? fallback(input.req);
      } catch {
        return fallback(input.req);
      }
    },
  };
}
