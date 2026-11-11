import { FIELD_ALIASES, normalizeField, fieldValue, type TemplateValues } from "./pdf/template/forms";
import { IMAGE_FIELDS, type TemplateAssets } from "./pdf/template/decorations";
import { DATA_SOURCES, associationValues, type loadReportCustomFields } from "./reportCustomFields";

export const EXTRA_SOURCES = ["school.po.box", "school.website", "learner.dob", "learner.index.no", "learner.section", "class.teacher.name", "head.teacher.name", "eot.class.size", "bot.class.size", "mid.class.size"];
export const SYSTEM_SOURCES = [...DATA_SOURCES, ...EXTRA_SOURCES];
export function systemSource(key: string, level: string): boolean {
  if (SYSTEM_SOURCES.includes(key)) return level === "primary" || !/^(bot|mid|eot)\./.test(key);
  return level === "primary"
    ? /^subject\.[a-z0-9.]+\.(name|code|full\.marks|grade|points|remark|initials|bot|mid|eot|(?:bot|mid|eot)\.(?:grade|points))$/.test(key)
    : /^learning\.area\.[a-z0-9.]+\.(name|grade|comment)$/.test(key);
}
export function sourceForField(name: string, level: string): string | null {
  const key = normalizeField(name).replace(/[^a-z0-9.]+/g, "").replace(/\.+/g, ".").replace(/^\.|\.$/g, "");
  return [FIELD_ALIASES[key] ?? key, key, ...["learner.", "school.", "report.", "term.", "class.", "eot."].map(p => p + key)].find(k => systemSource(k, level)) ?? null;
}
export type VerificationField = { key: string; label: string; required: boolean; status: "Matched" | "Missing Data" | "Unmatched Field"; source: string | null; value: string };
export function verifyTemplateFields(level: string, names: string[], data: Awaited<ReturnType<typeof loadReportCustomFields>>, values: TemplateValues, assets: TemplateAssets, learnerId: string, termId: string, rules: { field_key: string; required: boolean }[]): VerificationField[] {
  const resolved = associationValues(data, values, learnerId, termId);
  const check = (key: string, label: string, association?: typeof resolved[number]): VerificationField => {
    const definition = data.fields.find(f => f.id === association?.definition_id);
    const source = association ? definition ? `custom:${definition.id}` : association.source_key && systemSource(association.source_key, level) ? association.source_key : null : IMAGE_FIELDS[normalizeField(label)] ? `image:${IMAGE_FIELDS[normalizeField(label)]}` : sourceForField(label, level);
    const value = association ? association.value : source?.startsWith("image:") ? String(assets[source.slice(6) as keyof TemplateAssets] ?? "") : fieldValue(label, values);
    return { key, label, required: rules.find(r => r.field_key === key)?.required ?? true, source, value, status: !source ? "Unmatched Field" : value !== "" ? "Matched" : "Missing Data" };
  };
  return [...names.map(n => check(n, n, resolved.find(a => a.pdf_field === n))), ...resolved.filter(a => !a.pdf_field).map(a => check(`placement:${a.id}`, data.fields.find(f => f.id === a.definition_id)?.label ?? a.source_key ?? "Archived field", a))];
}
export const canActivateVerification = (fields: VerificationField[]) => !fields.some(f => f.required && f.status === "Unmatched Field");