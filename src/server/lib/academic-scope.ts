import type { AskRequest } from "./types";

/**
 * Builds a concise academic scope block injected into the system prompt.
 * Tells the model exactly what context it is operating within.
 */
export function buildAcademicScope(req: AskRequest): string {
  return [
    `Class: ${req.selectedClass}`,
    `Subject: ${req.selectedSubject}`,
    `Chapter: ${req.selectedChapter ?? "N/A"}`,
    `Instruction: Stay within this academic scope. Do not go beyond the curriculum unless the student explicitly asks for broader context.`,
  ].join("\n");
}

/**
 * Builds a scoped query string for optional future retrieval/search steps.
 * Not used in the current no-retrieval path, but kept for later integration.
 */
export function buildScopedQuery(req: AskRequest): string {
  return [
    req.selectedClass,
    req.selectedSubject,
    req.selectedChapter ?? "",
    req.message,
  ]
    .filter(Boolean)
    .join(" | ");
}
