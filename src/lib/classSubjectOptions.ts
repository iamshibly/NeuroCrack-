import { ACADEMIC_DATA } from "@/data/academic-data";

export const CLASS_OPTIONS = [
  "SSC (Science)",
  "SSC (Arts)",
  "SSC (Commerce)",
  "HSC (Science)",
  "HSC (Business Studies)",
  "HSC (Humanities)",
] as const;

export type ClassOption = (typeof CLASS_OPTIONS)[number];

function parseClassOption(cls: string): { exam: "SSC" | "HSC"; stream: string } {
  const match = cls.match(/^(SSC|HSC)\s*\(([^)]+)\)$/);
  if (!match) throw new Error(`Invalid class option: ${cls}`);
  return { exam: match[1] as "SSC" | "HSC", stream: match[2] };
}

export const SUBJECTS_BY_CLASS: Record<ClassOption, string[]> = Object.fromEntries(
  CLASS_OPTIONS.map((cls) => {
    const { exam, stream } = parseClassOption(cls);
    const subjects = ACADEMIC_DATA
      .filter((r) => r.exam === exam && r.streamOptions.includes(stream))
      .map((r) => r.displayName);
    return [cls, subjects];
  }),
) as Record<ClassOption, string[]>;

export function getChapterOptions(cls: string | null, subject: string | null): string[] {
  if (!cls || !subject) return [];
  let exam: "SSC" | "HSC";
  let stream: string;
  try {
    ({ exam, stream } = parseClassOption(cls));
  } catch {
    return [];
  }
  const record = ACADEMIC_DATA.find(
    (r) =>
      r.exam === exam &&
      r.streamOptions.includes(stream) &&
      (r.displayName === subject || r.sourceName === subject || r.aliases.includes(subject)),
  );
  return record?.chapters ?? [];
}

export function requiresChapter(cls: string | null, subject: string | null): boolean {
  return getChapterOptions(cls, subject).length > 0;
}
