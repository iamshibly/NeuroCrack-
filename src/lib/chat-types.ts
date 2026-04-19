// Structured answer block types for rich AI response rendering.
// The backend should return a StructuredAnswer object; the content field
// on Message holds plain text as a fallback / display-safe copy.

export type PlainBlock = {
  type: "plain";
  text: string;
};

export type BulletBlock = {
  type: "bullets";
  heading?: string;
  items: string[];
};

export type MCQOption = {
  label: string; // "A", "B", "C", "D"
  text: string;
  isCorrect?: boolean;
};

export type MCQBlock = {
  type: "mcq";
  question?: string;
  options: MCQOption[];
  explanation?: string;
};

export type FillBlock = {
  type: "fill";
  // Alternating text and blank parts, e.g. ["The heart has ", "___", " chambers."]
  parts: string[];
  // Answers aligned to blanks in parts, in order
  answers: string[];
  explanation?: string;
};

export type ShortAnswerBlock = {
  type: "short";
  question?: string;
  answer: string;
};

export type Step = {
  label?: string;
  text?: string;
  math?: string; // LaTeX expression for this step
};

export type StepsBlock = {
  type: "steps";
  title?: string;
  steps: Step[];
};

export type MathBlock = {
  type: "math";
  expression: string; // LaTeX expression
  display?: boolean;  // true = block, false = inline
  caption?: string;
};

export type ClarificationBlock = {
  type: "clarification";
  prompt: string;
  options: string[];
};

export type TableBlock = {
  type: "table";
  columns: string[];
  rows: string[][];
  caption?: string;
};

export type RomanStatement = {
  label: string;    // "i", "ii", "iii"
  correct: boolean;
  reason?: string;
};

export type RomanMCQBlock = {
  type: "roman_mcq";
  statements: RomanStatement[];
  finalOption?: string;
  explanation?: string;
};

export type VisualHintBlock = {
  type: "visual_hint";
  hintType: "diagram" | "flowchart" | "table" | "equation_layout" | "chart";
  description: string;
};

export type ImageStatusBlock = {
  type: "image_status";
  /** "partial" = image was readable but incomplete; always shown when present */
  status: "partial";
  message?: string;
  extractedSummary?: string;
};

export type SourcesBlock = {
  type: "sources";
  items: Array<{ title: string; url?: string }>;
};

export type FinalAnswerBlock = {
  type: "final_answer";
  /** Correct option letter, e.g. "A", "B", "ক", "খ" */
  option: string;
  /** Brief explanation of why this option is correct */
  explanation?: string;
};

export type SubAnswerBlock = {
  type: "sub_answer";
  /** Original question number from the student's message, e.g. "1", "২" */
  questionNumber: string;
  /** Rendered blocks for this sub-question (roman_mcq, table, steps, plain, etc.) */
  blocks: AnswerBlock[];
};

export type HighlightChip = {
  type: "highlight_chip";
  /** The exact answer word, phrase, or numerical result to highlight prominently. */
  text: string;
  /** True when text contains $...$ LaTeX that should be rendered with KaTeX. */
  hasMath?: boolean;
};

export type AnswerBlock =
  | PlainBlock
  | BulletBlock
  | MCQBlock
  | FillBlock
  | ShortAnswerBlock
  | StepsBlock
  | MathBlock
  | ClarificationBlock
  | TableBlock
  | RomanMCQBlock
  | VisualHintBlock
  | ImageStatusBlock
  | SourcesBlock
  | FinalAnswerBlock
  | SubAnswerBlock
  | HighlightChip;

export type StructuredAnswer = {
  blocks: AnswerBlock[];
  confidence?: number; // 0–1
  source?: string;
  footer?: string;
};

// Payload shape sent to the backend on each user message
export type SendPayload = {
  chatId: string;
  message: string;
  selectedClass: string;
  selectedSubject: string;
  selectedChapter: string | null;
  history: { role: "user" | "assistant"; content: string }[];
  imageDataUrl?: string;
};
