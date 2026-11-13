import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fieldValue, normalizeField, type TemplateValues } from "@/lib/pdf/template/forms";
import type { ReportDataSource } from "./reportDataSource";

export type ReportField = Tables<"report_field_definitions">;
export type ReportValue = Tables<"report_field_values">;
export type ReportAssociation = Tables<"report_field_associations">;
export const DATA_SOURCES = ["school.name", "school.motto", "school.location", "school.tel", "school.email", "learner.full.name", "learner.age", "learner.sex", "learner.house", "learner.conduct", "learner.co.curricular", "learner.lin.no", "learner.reg.no", "learner.pay.code", "class.name", "stream.name", "term.name", "academic.year", "term.next.begins.on", "term.ends.on", "report.class.teacher.comment", "report.head.teacher.comment", "bot.total", "bot.average", "bot.aggregate", "bot.division", "bot.position", "mid.total", "mid.average", "mid.aggregate", "mid.division", "mid.position", "eot.total", "eot.average", "eot.aggregate", "eot.division", "eot.position"];

export function reportDataSources(level: string, fieldNames: unknown) {
  const sources = [...DATA_SOURCES, "school.po.box", "school.website", "learner.dob", "learner.index.no", "learner.section", "class.teacher.name", "eot.class.size", "bot.class.size", "mid.class.size"].filter(key => level === "primary" || !/^(bot|mid|eot)\./.test(key));
  const indexed = level === "primary"
    ? Array.from({ length: 7 }, (_, i) => ["name", "bot", "bot.grade", "bot.points", "mid", "mid.grade", "mid.points", "eot", "eot.grade", "eot.points"].map(key => `subject.${i + 1}.${key}`)).flat()
    : Array.from({ length: 20 }, (_, i) => ["name", "grade", "comment"].map(key => `learning.area.${i + 1}.${key}`)).flat();
  const detected = Array.isArray(fieldNames) ? fieldNames.filter((name): name is string => typeof name === "string").map(normalizeField).filter(key => /^(subject|learning\.area)\./.test(key)) : [];
  return [...new Set([...sources, ...indexed, ...detected])];
}

export function validateFieldValue(type: string, value: string) {
  if (!value) return;
  if (value.length > 5000) throw new Error("Maximum 5000 characters.");
  if (["number", "percentage"].includes(type) && !/^[+-]?\d+(\.\d+)?$/.test(value)) throw new Error("Enter a valid number.");
  if (type === "percentage" && (Number(value) < 0 || Number(value) > 100)) throw new Error("Percentage must be between 0 and 100.");
  if (type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error("Enter a valid date.");
  if (type === "text" && /[\r\n]/.test(value)) throw new Error("Use Multiline Text for multiple lines.");
}

export function resolveSavedValue(field: ReportField, values: ReportValue[], learnerId: string, termId: string, year: number): string {
  const candidates = values.filter(v => v.definition_id === field.id && v.school_id === field.school_id && v.level === field.level && v.learner_id === (field.scope === "learner" ? learnerId : null) && (v.term_id === null || v.term_id === termId) && (v.academic_year === null || v.academic_year === year));
  candidates.sort((a, b) => (Number(b.term_id !== null) * 2 + Number(b.academic_year !== null)) - (Number(a.term_id !== null) * 2 + Number(a.academic_year !== null)));
  const value = candidates[0]?.value ?? "";
  return value && field.field_type === "percentage" ? `${value}%` : value;
}

export async function loadReportCustomFields(schoolId: string, level: string, templateId: string, source?: ReportDataSource) {
  if (source) {
    if (source.schoolId !== schoolId) throw new Error("Custom fields must belong to the current school.");
    const [fields, values, associations] = await Promise.all([
      source.read("report_field_definitions", { eq: { level, archived: false } }),
      source.read("report_field_values", { eq: { level } }),
      source.read("report_field_associations", { eq: { level, template_id: templateId } }),
    ]);
    return { fields, values, associations };
  }
  const [fields, values, associations] = await Promise.all([
    supabase.from("report_field_definitions").select("*").eq("school_id", schoolId).eq("level", level).eq("archived", false),
    supabase.from("report_field_values").select("*").eq("school_id", schoolId).eq("level", level),
    supabase.from("report_field_associations").select("*").eq("school_id", schoolId).eq("level", level).eq("template_id", templateId),
  ]);
  for (const result of [fields, values, associations]) if (result.error) throw result.error;
  return { fields: fields.data ?? [], values: values.data ?? [], associations: associations.data ?? [] };
}

export function associationValues(data: Awaited<ReturnType<typeof loadReportCustomFields>>, builtIn: TemplateValues, learnerId: string, termId: string) {
  return data.associations.map(association => {
    const field = data.fields.find(f => f.id === association.definition_id);
    const value = field ? resolveSavedValue(field, data.values, learnerId, termId, Number(builtIn["academic.year"])) : association.source_key ? fieldValue(association.source_key, builtIn) : "";
    return { ...association, value, multiline: field?.field_type === "multiline" };
  });
}