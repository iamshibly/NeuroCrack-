// Centralised LLM output schema for the answer generation nodes.
// Imported by graph.ts so both runAnswerChain and runAnswerChainVision stay in sync.

export function buildExtendedJsonSchema(): string {
  return `== Output JSON Shape ==
Return exactly this JSON — no markdown fences, no prose before or after.
Only include OPTIONAL fields when they genuinely apply; omit them otherwise.

{
  "answer": "<text — use \\n for line breaks. For inline math use $expr$: e.g. $\\sin^2\\theta + \\cos^2\\theta = 1$ NOT sin^2 θ + cos^2 θ = 1. NEVER bare ^ in plain text.>",
  "answerMode": "<mcq|roman_mcq|fill_in_the_gap|very_short_answer|short_answer|medium_answer|long_explanation|math_solution|conceptual_science|definition|comparison|multi_part>",
  "responseLanguage": "<bn|en>",
  "needsClarification": false,
  "clarificationQuestion": "<omit if needsClarification is false>",
  "clarificationOptions": ["<opt1>", "<opt2>"],
  "confidence": "<low|medium|high>",

  "renderMode": "<text|table|math|roman_mcq|mcq>",

  "tableData": {
    "columns": ["Feature / বৈশিষ্ট্য", "X", "Y"],
    "rows": [
      ["row1-feature", "X-value", "Y-value"],
      ["row2-feature", "X-value", "Y-value"]
    ]
  },

  "stepData": [
    "Step 1: Write the formula — $E = mc^2$",
    "Step 2: Substitute values — $m = 2\\,\\text{kg},\\; c = 3 \\times 10^8$",
    "Final Answer: $E = 1.8 \\times 10^{17}\\,\\text{J}$"
  ],

  "statementChecks": [
    { "label": "i",   "correct": true,  "reason": "One-line factual justification." },
    { "label": "ii",  "correct": false, "reason": "One-line factual justification." },
    { "label": "iii", "correct": true,  "reason": "One-line factual justification." }
  ],

  "finalOption": "B",

  "finalAnswerText": "<core answer word, phrase, or numerical result>",

  "visualHint": {
    "suggested": true,
    "type": "<diagram|flowchart|table|equation_layout|chart>",
    "description": "A labeled diagram of X showing Y would help visualise this."
  }
}

== Field-by-field rules ==

renderMode:
  - "mcq"       → set when answerMode is "mcq" (standard A/B/C/D or ক/খ/গ/ঘ options)
  - "table"     → set when answerMode is "comparison" OR the question asks to compare/contrast two things OR uses পার্থক্য/তুলনা
  - "math"      → set when answerMode is "math_solution"
  - "roman_mcq" → set when answerMode is "roman_mcq"
  - "text"      → set for everything else (DEFAULT)

tableData (REQUIRED when renderMode is "table"):
  - First column = feature/attribute names, remaining columns = the two things being compared
  - Minimum 3 rows, maximum 8 rows
  - Keep cell text concise (one phrase, not a paragraph)
  - answer field may contain a brief intro sentence or be empty

stepData (REQUIRED when renderMode is "math"):
  - One string per step — max 8 steps
  - Wrap LaTeX expressions between single dollar signs: $expression$
  - Last item must be the final answer, clearly labelled "Final Answer:" or "∴"
  - answer field may contain a short context sentence or be empty

statementChecks (REQUIRED when renderMode is "roman_mcq"):
  - One entry per Roman-numeral statement in the question
  - label: the numeral ("i", "ii", "iii") — in plain text, not LaTeX
  - correct: true/false
  - reason: one concise sentence explaining why
  - answer field = the explanation paragraph (why the final option is correct)

finalOption (REQUIRED when renderMode is "roman_mcq" or "mcq"):
  - The letter of the correct MCQ answer (e.g. "A", "B", "ক", "খ")
  - For renderMode "mcq": set this to the correct option letter; answer field = one-sentence explanation of why that option is correct

finalAnswerText (REQUIRED for most modes — the key phrase the student needs highlighted):
  - Set when answerMode is: very_short_answer, short_answer, definition, fill_in_the_gap, conceptual_science, medium_answer, long_explanation
  - Set when answerMode is math_solution: set to the final numerical result ONLY, e.g. "20√3 মি.", "9.8 m/s²", "4.8 × 10⁻¹⁹ J"
  - OMIT when answerMode is: mcq, roman_mcq (finalOption provides the highlight)
  - OMIT when answerMode is: comparison (tableData provides the answer structure)
  - CRITICAL: Value must be ONLY the specific entity, name, value, or short phrase — NEVER a full sentence
  - WRONG: "সালোকসংশ্লেষণ প্রক্রিয়ায় উদ্ভিদ খাদ্য তৈরি করে" (full sentence — DO NOT set)
  - CORRECT: "সালোকসংশ্লেষণ" (the key term)
  - In Bangla answers: Bengali script, e.g. "প্লানারিয়া", "অ্যানিলিডা", "কেঁচো", "মাইটোসিস"
  - Include units when relevant: "20√3 মি.", "9.8 m/s²"
  - Max 60 characters; must be directly extractable from the answer text

rendering rules for answer text:
  - Use × (multiplication sign ×, Unicode U+00D7) for multiplication in plain text — NEVER the letter x
  - For LaTeX expressions inside $...$, use \times for multiplication
  - Chemical formulas: write subscript numbers directly after element symbols (H₂O not H 2 O)
  - Keep variable x clearly distinguishable from multiplication ×
  - Example correct: "ক্ষেত্রফল = দৈর্ঘ্য × প্রস্থ = 40 × 40 = 1600 বর্গ সেমি"
  - Example wrong:   "ক্ষেত্রফল = দৈর্ঘ্য x প্রস্থ = 40 x 40 = 1600 বর্গ সেমি"

visualHint (OPTIONAL — only when a diagram/chart would significantly aid understanding):
  - Do NOT include for simple factual or MCQ answers
  - suggested: always true when field is present
  - type: pick the most appropriate visual type
  - description: one sentence describing what the visual would show`;
}
