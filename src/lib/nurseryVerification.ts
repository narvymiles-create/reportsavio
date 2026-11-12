import type { TemplateValues } from "./pdf/template/forms";
import { recogniseField, type SectionMap } from "./templateSections";

export type AreaCheck = { row: number; area: string; grade: string; comment: string; onTemplate: boolean; inOutput: boolean; status: "Correct" | "No assessment yet" | "Missing from output" | "Not on template" };
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Every existing learning area (school sort order) checked against the template rows and the generated PDF text. */
export function checkNurseryAreas(values: TemplateValues, fieldNames: string[], map: SectionMap, outputText: string): AreaCheck[] {
  const rows = new Set<number>();
  for (const n of fieldNames) { const r = recogniseField(n, "nursery", map); if (r.kind === "cell" && r.section === "assessment") rows.add(r.row); }
  for (const t of map.tables ?? []) if (t.section === "assessment") for (let i = 1; i <= t.rows; i++) rows.add(i);
  const text = norm(outputText);
  const out: AreaCheck[] = [];
  for (let row = 1; values[`table.assessment.${row}.subject`] != null; row++) {
    const area = String(values[`table.assessment.${row}.subject`]);
    const grade = String(values[`table.assessment.${row}.grade`] ?? ""), comment = String(values[`table.assessment.${row}.remark`] ?? "");
    const onTemplate = rows.has(row);
    const expected = [area, grade, comment].filter(Boolean);
    const inOutput = onTemplate && expected.every(v => text.includes(norm(v).slice(0, 30)));
    out.push({ row, area, grade, comment, onTemplate, inOutput, status: !onTemplate ? "Not on template" : !inOutput ? "Missing from output" : grade || comment ? "Correct" : "No assessment yet" });
  }
  return out;
}
