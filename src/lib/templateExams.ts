import { summariseRecognition, recogniseHeading, looksLikeTableHeading, type SectionMap } from "./templateSections";

export type ExamId = "bot" | "mid" | "eot";
export const EXAM_IDS: ExamId[] = ["bot", "mid", "eot"];
export const EXAM_NAMES: Record<ExamId, string> = { bot: "Beginning of Term", mid: "Mid-Term", eot: "End of Term" };

/** Examination tables present in an uploaded Primary template (fields, corrected tables and printed headings). */
export function templateExamSections(names: string[], map: SectionMap, lines: string[]): ExamId[] {
  const headings = lines.filter(l => recogniseHeading(l, "primary") || looksLikeTableHeading(l));
  const found = new Set(summariseRecognition("primary", names, map, headings).sections.map(s => s.id));
  return EXAM_IDS.filter(id => found.has(id));
}
