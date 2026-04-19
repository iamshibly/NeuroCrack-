// Server-side types for the NeuroCrack academic agent.

export type AnswerMode =
  | "mcq"
  | "roman_mcq"         // Roman-numeral statement analysis MCQ (i/ii/iii)
  | "fill_in_the_gap"
  | "very_short_answer"
  | "short_answer"
  | "medium_answer"
  | "long_explanation"
  | "math_solution"
  | "conceptual_science"
  | "definition"
  | "comparison"
  | "multi_part";        // Multiple sub-questions or (a)/(b)/(c) parts

export type ResponseLanguage = "bn" | "en";

export type Confidence = "low" | "medium" | "high";

export type ModelTier = "lightweight" | "strong";

// ── Image analysis ────────────────────────────────────────────────────────────

export type ImageReadability = "readable" | "partial" | "unreadable";

export type ImageContentType =
  | "text"       // printed/handwritten text only
  | "mcq"        // MCQ question with options
  | "diagram"    // biology diagram / chart / geometry figure
  | "table"      // data table
  | "equation"   // math / physics / chemistry equations (standalone)
  | "mixed"      // combination of text + diagram/table/equation
  | "photo";     // real-world photograph with no academic content

/** Quality classification for extracted image content — set by the OCR pipeline. */
export type ExtractionQuality =
  | "verified_good"       // Readable, sufficient extracted text, safe to solve
  | "partially_verified"  // Some text extracted but incomplete — proceed with caution
  | "not_verified";       // Cannot extract reliably — do NOT attempt to solve

export type ImageAnalysisResult = {
  readability: ImageReadability;
  contentType: ImageContentType;
  /** All reliably readable text extracted from the image; null when unreadable. */
  extractedText: string | null;
  /** Short description of image content for diagnostic / prompt use. */
  description: string;
  /** Dominant script detected in the image text. */
  imageLanguage?: "bn" | "en" | "mixed" | null;
  /** For partial readability: brief reason why some content is unclear. */
  partialReason?: string | null;
  /** Quality classification assigned by the OCR pipeline (rule-based, not model-reported). */
  extractionQuality?: ExtractionQuality;
  /** True when image requires the strong model (complex diagrams, equations, multi-question). */
  isComplexImage?: boolean;
};

export type TargetLength =
  | "1_line"
  | "3_lines"
  | "5_lines"
  | "8_lines"
  | "detailed";

// ── Question structure ────────────────────────────────────────────────────────

export type QuestionKind =
  | "single"   // one question
  | "multi"    // numbered multi-question (1. 2. 3.)
  | "part";    // lettered parts ((a)/(b) or ক)/খ))

export type QuestionStructure = {
  kind: QuestionKind;
  isRomanMCQ: boolean;
  isImageDependent: boolean;
  /** Number of sub-questions / parts (1 for single). */
  partCount: number;
  /** Split sub-question strings — populated for multi/part, empty for single. */
  questionParts: string[];
};

// ── Prompt-layer decision types ───────────────────────────────────────────────

/** Output of the language detection step (JS or LLM-based). */
export type LanguageDecision = {
  inputLanguage: ResponseLanguage;
  responseLanguage: ResponseLanguage;
  /** True when input is mixed/transliterated — backend may translate query for retrieval. */
  shouldTranslateForRetrieval: boolean;
  /** True when the message has no text at all (image-only send). */
  isImageOnly: boolean;
};

/** Output of the question-type classifier step. */
export type QuestionTypeDecision = {
  answerMode: AnswerMode;
  /** Whether the answer should include numbered steps (math, conceptual). */
  needsSteps: boolean;
  /** Whether external/local retrieval is likely needed for accuracy. */
  needsRetrieval: boolean;
  /** Whether the question is too vague to answer without more context. */
  needsClarification: boolean;
  targetLength: TargetLength;
  confidence: Confidence;
  /** Structural analysis result — optional so legacy code compiles without it. */
  structure?: QuestionStructure;
};

/** Output of the clarification-generation step. */
export type ClarificationDecision = {
  needsClarification: true;
  clarificationQuestion: string;
  clarificationOptions: string[];
};

/**
 * The final student-facing response type returned by the agent.
 * `AgentResponse` extends this with source/metadata fields added by the orchestrator.
 */
export type FinalAgentResponse = {
  answer: string;
  answerMode: AnswerMode;
  responseLanguage: ResponseLanguage;
  needsClarification: boolean;
  clarificationQuestion?: string;
  clarificationOptions?: string[];
  confidence: Confidence;
};

// ── Rich rendering types ──────────────────────────────────────────────────────

export type RenderMode = "text" | "table" | "math" | "roman_mcq" | "mcq";

export type TableData = {
  columns: string[];
  rows: string[][];
};

export type StatementCheck = {
  label: string;   // "i", "ii", "iii"
  correct: boolean;
  reason?: string;
};

export type VisualHint = {
  suggested: boolean;
  type: "diagram" | "flowchart" | "table" | "equation_layout" | "chart";
  description: string;
};

// ── Core types ────────────────────────────────────────────────────────────────

// ── Per-question result (multi-question responses) ────────────────────────────

/**
 * Structured result for a single sub-question within a multi-question message.
 * Mirrors the render-critical fields of AgentResponse so the frontend can
 * apply the same roman_mcq / table / math rendering per sub-question.
 */
export type SubAnswer = {
  questionNumber: string;
  answerMode: AnswerMode;
  answer: string;
  confidence: Confidence;
  renderMode?: RenderMode;
  tableData?: TableData;
  stepData?: string[];
  statementChecks?: StatementCheck[];
  finalOption?: string;
  finalAnswerText?: string;
  visualHint?: VisualHint;
};

export type AgentResponse = FinalAgentResponse & {
  renderMode?: RenderMode;
  tableData?: TableData;
  stepData?: string[];
  statementChecks?: StatementCheck[];
  finalOption?: string;
  /** The exact key word, phrase, or numerical result that IS the answer — used for highlight chip rendering. */
  finalAnswerText?: string;
  visualHint?: VisualHint;
  sourcesUsed?: Array<{ title: string; url?: string }>;
  /** Present when the message contained multiple numbered questions. */
  subAnswers?: SubAnswer[];
  metadata?: {
    selectedClass: string;
    selectedSubject: string;
    selectedChapter?: string | null;
  };
  imageInfo?: {
    readable: boolean;
    status: "readable" | "partial" | "unreadable";
    message?: string;
    /** Brief excerpt of text extracted from the image — max ~150 chars. */
    extractedTextSummary?: string;
  };
};

export type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AskRequest = {
  message: string;
  selectedClass: string;
  selectedSubject: string;
  selectedChapter?: string | null;
  chatId: string;
  recentMessages: IncomingMessage[];
  /** Base64 data URL of an attached image, e.g. "data:image/png;base64,..." */
  image?: string;
  /** Set by agent.ts when the student's message challenges a previous answer. */
  isCorrectionMode?: boolean;
  /** Normalized version of message (math notation cleaned up by question-normalization.ts). */
  normalizedMessage?: string;
};
