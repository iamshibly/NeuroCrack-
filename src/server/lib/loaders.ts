import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import type { ChapterDoc } from "./chapter-data";
import { chapterToPlainText } from "./chapter-data";

// Chunk size tuned for chapter content: large enough for coherent context,
// small enough for targeted retrieval. Overlap preserves sentence continuity.
const CHUNK_SIZE = 600;
const CHUNK_OVERLAP = 80;

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHUNK_SIZE,
  chunkOverlap: CHUNK_OVERLAP,
  separators: ["\n\n---\n\n", "\n\n", "\n", ". ", " ", ""],
});

/**
 * Converts a ChapterDoc into LangChain Documents, one per section.
 * Sections that are too long are further split.
 */
export async function chapterToDocuments(chapter: ChapterDoc): Promise<Document[]> {
  const docs: Document[] = [];

  for (const section of chapter.sections) {
    const text = `${section.heading}\n\n${section.body}`;
    const chunks = await splitter.splitText(text);
    for (const chunk of chunks) {
      docs.push(
        new Document({
          pageContent: chunk,
          metadata: {
            chapterId: chapter.chapterId,
            chapterTitle: chapter.chapterTitle,
            sectionHeading: section.heading,
            subject: chapter.subject,
            class: chapter.class,
          },
        }),
      );
    }
  }
  return docs;
}

/**
 * Converts a raw text string (e.g., from Wikipedia) into LangChain Documents.
 */
export async function textToDocuments(
  text: string,
  metadata: Record<string, string>,
): Promise<Document[]> {
  const chunks = await splitter.splitText(text);
  return chunks.map(
    (chunk) => new Document({ pageContent: chunk, metadata }),
  );
}

/**
 * Converts full chapter content to a single Document (for direct injection
 * when the chapter is small enough to fit in context without retrieval).
 */
export function chapterToSingleDocument(chapter: ChapterDoc): Document {
  return new Document({
    pageContent: chapterToPlainText(chapter),
    metadata: {
      chapterId: chapter.chapterId,
      chapterTitle: chapter.chapterTitle,
      subject: chapter.subject,
      class: chapter.class,
    },
  });
}
