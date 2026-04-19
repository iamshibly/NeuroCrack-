import type { Document } from "@langchain/core/documents";
import type { QuestionTypeDecision, ImageAnalysisResult } from "./types";

// Wikipedia REST API — free, no key needed.
// We fetch only the summary (1-2 paragraphs), not the full article.
// This keeps token usage very low.
const WIKIPEDIA_API = "https://en.wikipedia.org/api/rest_v1/page/summary";

type WikiSummary = {
  title: string;
  description?: string;
  extract: string;
  content_urls?: { desktop?: { page?: string } };
};

/**
 * Fetches a Wikipedia article summary for a given search term.
 * Returns a Document if found, or null if not found / network error.
 * Limited to a single article per call — do not call in a loop.
 */
export async function fetchWikipediaSummary(
  searchTerm: string,
): Promise<Document | null> {
  try {
    const encoded = encodeURIComponent(searchTerm.trim());
    const res = await fetch(`${WIKIPEDIA_API}/${encoded}`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(5000), // 5 s timeout
    });

    if (!res.ok) return null;

    const data = (await res.json()) as WikiSummary;
    if (!data.extract) return null;

    const { Document } = await import("@langchain/core/documents");
    return new Document({
      pageContent: data.extract,
      metadata: {
        title: data.title,
        description: data.description ?? "",
        url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encoded}`,
        source: "wikipedia",
      },
    });
  } catch {
    return null;
  }
}

/**
 * Returns true when public Wikipedia retrieval should be attempted.
 * Skip retrieval when the image is unreadable (no question to retrieve for)
 * or when the question type is simple/factual (not worth the latency).
 */
export function shouldFetchPublic(
  decision: QuestionTypeDecision,
  imageAnalysis?: ImageAnalysisResult | null,
): boolean {
  // Unreadable image — no question extracted, nothing to retrieve for
  if (imageAnalysis?.readability === "unreadable") return false;
  // Photo (no academic content) — retrieval won't help
  if (imageAnalysis?.contentType === "photo") return false;

  // Simple modes don't benefit from public retrieval
  const skipModes = new Set(["very_short_answer", "fill_in_the_gap", "definition", "mcq"]);
  if (skipModes.has(decision.answerMode)) return false;

  return decision.needsRetrieval;
}

/**
 * Builds a Wikipedia search term from the academic context.
 * Keeps it focused to avoid irrelevant articles.
 */
export function buildWikiSearchTerm(
  subject: string,
  chapter: string | null | undefined,
  question: string,
): string {
  // Extract key noun/concept from the question (first ~5 words after question words)
  const cleaned = question
    .replace(/^(what is|what are|define|explain|describe|how does|why is)\s+/i, "")
    .split(/\s+/)
    .slice(0, 5)
    .join(" ");

  if (chapter) return `${cleaned} ${subject}`;
  return `${cleaned} biology`;
}
