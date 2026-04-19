// Provides the completeness-check instruction injected into every answer prompt.
// Ensures the LLM extracts and uses ALL given values before finalizing answers.

/**
 * Returns the completeness check instruction to include in every answer prompt.
 * Instructs the LLM to verify all givens are used before producing the answer.
 */
export function buildCompletenessInstruction(): string {
  return `== Completeness Check (apply BEFORE writing your answer) ==
Step 1 — Extract ALL key information from the student's question:
- Every numerical value with its unit (e.g., 40 cm, 9.8 m/s², 2 kg, 60°)
- Every angle, length, mass, temperature, concentration, or measurable quantity
- Every condition or constraint (e.g., "at rest", "uniformly accelerated", "right angle", "both sides equal 40 cm")
- Every sub-question part (1., 2., 3. or a., b., c. or Part i, ii, iii)
- Every MCQ option and every Roman-numeral statement (i., ii., iii.)

Step 2 — Verify BEFORE finalizing:
- Is EVERY sub-question answered? (Never answer only the first part and stop.)
- Is EVERY important numerical value or condition actually used in the solution?
- Is the solution specific to the EXACT given values — not a generic template?
- If the question says "both length and width are 40 cm", did the solution use 40 cm for BOTH?

If any important given value or sub-question was skipped — revise your answer before outputting.
Do NOT output a partial or incomplete answer.`;
}
