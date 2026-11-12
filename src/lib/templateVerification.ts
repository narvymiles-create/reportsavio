import { type TemplateValues } from "./pdf/template/forms";
import { type TemplateAssets } from "./pdf/template/decorations";
import { recogniseField, sectionLabel, summariseRecognition, valueKey, type Level, type SectionMap } from "./templateSections";
import { normalizeField } from "./pdf/template/forms";
import type { ReportField } from "./reportCustomFields";

export type VerificationField = { key: string; label: string; section: string; required: boolean; status: "Filled" | "Missing Data" | "Unrecognised"; value: string };
/** Section-level verification: missing learner data is a warning; only unrecognised labels can block activation. */
export function verifyTemplate(level: Level, names: string[], map: SectionMap, values: TemplateValues, assets: TemplateAssets, rules: { field_key: string; required: boolean }[], customFields: ReportField[] = [], filled: Record<string, string> = {}): VerificationField[] {
  return names.map(name => {
    const required = rules.find(r => r.field_key === name)?.required ?? true;
    if (customFields.some(f => normalizeField(f.label) === normalizeField(name))) {
      const value = filled[normalizeField(name)] ?? "";
      return { key: name, label: name, section: "Custom field", required, value, status: value ? "Filled" : "Missing Data" };
    }
    const r = recogniseField(name, level, map);
    if (r.kind === "unrecognised" || r.kind === "unassigned") return { key: name, label: name, section: "", required, value: "", status: "Unrecognised" };
    const key = valueKey(r);
    const value = r.kind === "image" ? String(assets[r.source as keyof TemplateAssets] ?? "") : key && values[key] != null ? String(values[key]) : "";
    return { key: name, label: name, section: sectionLabel(level, r.section), required, value, status: value !== "" ? "Filled" : "Missing Data" };
  });
}
export const canActivateVerification = (fields: VerificationField[]) => !fields.some(f => f.required && f.status === "Unrecognised");
export { summariseRecognition };
