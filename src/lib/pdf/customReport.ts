import { PDFDocument } from "pdf-lib";
import { loadPrimaryData, computeAll } from "./primaryReport";
import { loadNurseryData } from "./nurseryReport";
import { gradeFor } from "@/lib/grading";
import { fillTemplate, normalizeField, type TemplateValues } from "./template/forms";
import { templateBytes, type SchoolTemplate } from "@/lib/reportTemplates";
import { bytesToPdfBlob } from "./core";
import { loadReportCustomFields, associationValues, resolveSavedValue, type ReportField, type ReportValue } from "@/lib/reportCustomFields";
import { applyCustomPlacements } from "./template/customPlacements";
import { applyTemplateDecorations, type TemplateDecorations } from "./template/decorations";
import type { ReportDataSource } from "@/lib/reportDataSource";
import { currentReportDataSource } from "@/lib/onlineReportDataSource";
import { recogniseField, valueKey, type Level, type SectionMap } from "@/lib/templateSections";
import { applySectionTables } from "./template/sectionTables";

const fmtDate = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";

/** School setting: whether uploaded templates of this level draw the Settings border. Off keeps the template's own border. */
export const templateBorderKey = (level: string) => `template_border_${level}`;
async function usesSettingsBorder(source: ReportDataSource, level: string) {
  const [data] = await source.read("system_settings", { eq: { key: templateBorderKey(level) } });
  return data?.value === true;
}

export async function customReportValues(level: string, learnerId: string, termId: string, schoolId?: string): Promise<TemplateValues> {
  return (await customReportData(level, learnerId, termId, schoolId)).values;
}

/** Same loaders and calculations as the default report cards, flattened into template keys. */
export async function customReportData(level: string, learnerId: string, termId: string, schoolId?: string, academicYear?: number, provider?: ReportDataSource): Promise<{ values: TemplateValues; decorations: Omit<TemplateDecorations, "border"> & { borderStyle: string } }> {
  const source = provider ?? await currentReportDataSource();
  if (schoolId && source.schoolId !== schoolId) throw new Error("The template must belong to the current school.");
  const d = level === "primary" ? await loadPrimaryData(learnerId, termId, source) : await loadNurseryData(learnerId, termId, source);
  if (schoolId && (d.learner.school_id !== schoolId || d.term?.school_id !== schoolId)) throw new Error("The learner and term must belong to the template's school.");
  const primary = "klass" in d ? d : null;
  const values: TemplateValues = {};
  const add = (prefix: string, record: Record<string, unknown> | null | undefined) => {
    Object.entries(record ?? {}).forEach(([key, value]) => {
      if (value == null || typeof value === "string" || typeof value === "number") values[normalizeField(`${prefix}.${key}`)] = value as string | number | null;
    });
  };
  add("school", d.school); add("learner", d.learner); add("term", d.term); add("report", d.report);
  add("class", "klass" in d ? d.klass : d.cls); add("stream", d.stream); add("class.teacher", d.classTeacher);
  values["academic.year"] = academicYear ?? d.term?.year;
  values["term.year"] = academicYear ?? d.term?.year;
  values["term.next.begins.on"] = fmtDate(d.term?.next_begins_on);
  values["term.ends.on"] = fmtDate(d.term?.ends_on);
  values["learner.dob"] = fmtDate(d.learner?.dob);
  values["class.teacher.name"] = d.classTeacher?.full_name;
  values["head.teacher.name"] = (level === "nursery" ? d.school?.nursery_head_teacher_name : null) ?? d.school?.head_teacher_name;
  if (primary) {
    const computed = computeAll(primary);
    values["eot.class.size"] = primary.report?.class_size ?? primary.classSize;
    for (const phase of ["bot", "mid", "eot"] as const) {
      const summary = computed[phase];
      for (const key of ["total", "avg", "division", "position", "classSize"] as const) values[normalizeField(`${phase}.${key}`)] = summary.has ? summary[key] : "";
      values[`${phase}.average`] = summary.has ? summary.avg : "";
      values[`${phase}.aggregate`] = summary.aggregateText;
      values[`${phase}.class.size`] = summary.has ? summary.classSize : "";
    }
    // Complete section tables: row n is the nth configured subject (stable subject IDs, class sort order).
    primary.subjects.forEach((subject, index) => {
      const marks = computed.bySubject.get(subject.id);
      const initials = (subject.subject_teacher_id && primary.teachersById[subject.subject_teacher_id]?.initials) || marks?.teacher_initials || "";
      for (const phase of ["bot", "mid", "eot"] as const) {
        const row = `table.${phase}.${index + 1}`;
        const raw = marks?.[phase];
        const mark = raw == null || raw === "" || isNaN(Number(raw)) ? null : Number(raw);
        const band = mark == null ? null : gradeFor(mark, primary.bands);
        values[`${row}.subject`] = subject.name; values[`${row}.code`] = subject.code_label || subject.code;
        values[`${row}.full`] = subject.max_marks; values[`${row}.marks`] = mark;
        values[`${row}.grade`] = band?.grade; values[`${row}.points`] = band?.points; values[`${row}.remark`] = band?.remark;
        values[`${row}.initials`] = mark == null ? "" : initials;
      }
    });
    for (const phase of ["bot", "mid", "eot"] as const) {
      const summary = computed[phase];
      Object.assign(values, { [`table.${phase}.total`]: summary.has ? summary.total : "", [`table.${phase}.average`]: summary.has ? summary.avg : "", [`table.${phase}.aggregate`]: summary.aggregateText, [`table.${phase}.division`]: summary.division, [`table.${phase}.position`]: summary.has ? summary.position : "", [`table.${phase}.class.size`]: summary.has ? summary.classSize : "" });
    }
    primary.bands.forEach((band, index) => {
      const row = `table.grading.${index + 1}`;
      Object.assign(values, { [`${row}.grade`]: band.grade, [`${row}.points`]: band.points, [`${row}.remark`]: band.remark, [`${row}.range`]: `${band.min_mark} - ${band.max_mark}` });
    });
    primary.subjects.forEach((subject, index) => {
      const prefixes = [`subject.${index + 1}`, `subject.${normalizeField(subject.code_label || subject.code)}`];
      prefixes.forEach(prefix => {
        values[`${prefix}.name`] = subject.name;
        values[`${prefix}.code`] = subject.code_label || subject.code;
        values[`${prefix}.full.marks`] = subject.max_marks;
        const marks = computed.bySubject.get(subject.id);
        const eot = marks?.eot == null ? null : gradeFor(Number(marks.eot), primary.bands);
        values[`${prefix}.grade`] = eot?.grade;
        values[`${prefix}.points`] = eot?.points;
        values[`${prefix}.remark`] = marks?.remark ?? eot?.remark;
        values[`${prefix}.initials`] = marks?.teacher_initials ?? primary.teachersById[subject.subject_teacher_id]?.initials;
        for (const phase of ["bot", "mid", "eot"] as const) {
          const mark = marks?.[phase];
          const grade = mark == null ? null : gradeFor(Number(mark), primary.bands);
          values[`${prefix}.${phase}`] = mark;
          values[`${prefix}.${phase}.grade`] = grade?.grade;
          values[`${prefix}.${phase}.points`] = grade?.points;
        }
      });
    });
  } else if ("areas" in d) {
    const colors = d.colors as { grade: string; label: string }[];
    colors.forEach((c, index) => { values[`table.key.${index + 1}.grade`] = c.grade; values[`table.key.${index + 1}.rating`] = c.label; });
    d.areas.forEach((area, index) => {
      const a = d.assessments[area.id];
      const row = `table.assessment.${index + 1}`;
      values[`${row}.subject`] = area.name; values[`${row}.grade`] = a?.grade; values[`${row}.remark`] = a?.comment;
      values[`${row}.rating`] = colors.find(c => c.grade === a?.grade)?.label ?? "";
    });
    d.areas.forEach((area, index) => {
      for (const prefix of [`learning.area.${index + 1}`, `learning.area.${normalizeField(area.name)}`]) {
        values[`${prefix}.name`] = area.name;
        values[`${prefix}.comment`] = d.assessments[area.id]?.comment;
        values[`${prefix}.grade`] = d.assessments[area.id]?.grade;
      }
    });
  }
  return { values, decorations: { level, school: d.school, assets: d.assets, borderStyle: d.borderStyle } };
}

export const sectionMapOf = (template: Pick<SchoolTemplate, "section_map">): SectionMap => (template.section_map && typeof template.section_map === "object" && !Array.isArray(template.section_map) ? template.section_map : {}) as SectionMap;
export const templateFieldNames = (template: Pick<SchoolTemplate, "field_names">) => Array.isArray(template.field_names) ? template.field_names.filter((n): n is string => typeof n === "string") : [];

/** Recognised sections take precedence over legacy one-by-one matches; custom fields fill labels with their exact name. */
export function recognisedValues(template: Pick<SchoolTemplate, "level" | "field_names" | "section_map">, values: TemplateValues, fields: ReportField[] = [], saved: ReportValue[] = [], learnerId = "", termId = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of templateFieldNames(template)) {
    const custom = fields.find(f => normalizeField(f.label) === normalizeField(name));
    if (custom) { out[normalizeField(name)] = resolveSavedValue(custom, saved, learnerId, termId, Number(values["academic.year"])); continue; }
    const key = valueKey(recogniseField(name, template.level as Level, sectionMapOf(template)));
    if (key) out[normalizeField(name)] = values[key] == null ? "" : String(values[key]);
  }
  return out;
}

export async function generateCustomOutput(template: SchoolTemplate, learnerIds: string[], termId: string, onProgress?: (done: number, total: number) => void, academicYear?: number, provider?: ReportDataSource): Promise<Blob> {
  if (!learnerIds.length) throw new Error("No learners selected");
  const source = provider ?? await currentReportDataSource();
  if (source.schoolId !== template.school_id) throw new Error("The template must belong to the current school.");
  const bytes = await templateBytes(template, source);
  const custom = await loadReportCustomFields(template.school_id, template.level, template.id, source);
  const settingsBorder = await usesSettingsBorder(source, template.level);
  const merged = await PDFDocument.create();
  for (const [index, learnerId] of learnerIds.entries()) {
    const { values, decorations } = await customReportData(template.level, learnerId, termId, template.school_id, academicYear, source);
    const associations = associationValues(custom, values, learnerId, termId);
    const overrides = { ...Object.fromEntries(associations.filter(a => a.pdf_field).map(a => [normalizeField(a.pdf_field ?? ""), a.value])), ...recognisedValues(template, values, custom.fields, custom.values, learnerId, termId) };
    const placed = await applySectionTables(await applyCustomPlacements(await fillTemplate(bytes, values, overrides), associations), usableStaticTables(template.level as Level, templateFieldNames(template), sectionMapOf(template)), values);
    const filled = await applyTemplateDecorations(placed, { ...decorations, border: settingsBorder ? decorations.borderStyle : null });
    onProgress?.(index + 1, learnerIds.length);
    if (learnerIds.length === 1) return bytesToPdfBlob(filled);
    const document = await PDFDocument.load(filled);
    document.getForm().flatten({ updateFieldAppearances: false });
    const pages = await merged.copyPages(document, document.getPageIndices());
    pages.forEach(page => merged.addPage(page));
  }
  return bytesToPdfBlob(await merged.save());
}