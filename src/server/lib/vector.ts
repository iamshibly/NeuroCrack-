import { OpenAIEmbeddings } from "@langchain/openai";
import type { Document } from "@langchain/core/documents";
import { serverConfig } from "../config";

// Module-level cache: keyed by chapterId so we embed once per chapter per process.
// In Cloudflare Workers (isolate-per-request model) this won't persist across requests,
// but it correctly avoids re-embedding within a single long-lived worker instance.
const embeddingCache = new Map<string, { docs: Document[]; vectors: number[][] }>();

function getEmbeddings(): OpenAIEmbeddings {
  return new OpenAIEmbeddings({
    model: serverConfig.openaiEmbeddingsModel,
    apiKey: serverConfig.openaiApiKey,
  });
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    magA += (a[i] ?? 0) ** 2;
    magB += (b[i] ?? 0) ** 2;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-8);
}

/**
 * Loads and embeds documents for a given chapter, using the module-level cache.
 * Returns an object with a `similaritySearch` method.
 */
export async function buildVectorStore(
  cacheKey: string,
  docs: Document[],
): Promise<{ similaritySearch: (query: string, k: number) => Promise<Document[]> }> {
  let cached = embeddingCache.get(cacheKey);

  if (!cached) {
    const embedder = getEmbeddings();
    const texts = docs.map((d) => d.pageContent);
    const vectors = await embedder.embedDocuments(texts);
    cached = { docs, vectors };
    embeddingCache.set(cacheKey, cached);
  }

  const { docs: storedDocs, vectors: storedVectors } = cached;

  return {
    async similaritySearch(query: string, k: number): Promise<Document[]> {
      const embedder = getEmbeddings();
      const queryVector = await embedder.embedQuery(query);

      const scored = storedDocs.map((doc, i) => ({
        doc,
        score: cosineSimilarity(queryVector, storedVectors[i] ?? []),
      }));

      return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, k)
        .map((s) => s.doc);
    },
  };
}

/** Clears the embedding cache (useful for testing or manual refresh). */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}
