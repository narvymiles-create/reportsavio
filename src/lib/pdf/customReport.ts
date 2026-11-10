import { PDFDocument } from "pdf-lib";
import { loadPrimaryData, computeAll } from "./primaryReport";
import { loadNurseryData } from "./nurseryReport";
import { gradeFor } from "@/lib/grading";
import { fillTemplate, normalizeField, type TemplateValues } from "./template/forms";
import { templateBytes, type SchoolTemplate } from "@/lib/reportTemplates";
import { bytesToPdfBlob } from "./core";
import { loadReportCustomFields, associationValues } from "@/lib/reportCustomFields";
import { applyCustomPlacements } from "./template/customPlacements";
import { applyTemplateDecorations, type TemplateDecorations } from "./template/decorations";
import { supabase } from "@/integrations/supabase/client";

const fmtDate = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";

/** School setting: whether uploaded templates of this level draw the Settings border. Off keeps the template's own border. */
export const templateBorderKey = (level: string) => `template_border_${level}`;
async function usesSettingsBorder(schoolId: string, level: string) {
  const { data, error } = await supabase.from("system_settings").select("value").eq("school_id", schoolId).eq("key", templateBorderKey(level)).maybeSingle();
  if (error) throw error;
  return data?.value === true;
}

export async function customReportValues(level: string, learnerId: string, termId: string, schoolId?: string): Promise<TemplateValues> {
  return (await customReportData(level, learnerId, termId, schoolId)).values;
}

/** Same loaders and calculations as the default report cards, flattened into template keys. */
export async function customReportData(level: string, learnerId: string, termId: string, schoolId?: string): Promise<{ values: TemplateValues; decorations: Omit<TemplateDecorations, "border"> & { borderStyle: string } }> {
  const d = level === "primary" ? await loadPrimaryData(learnerId, termId) : await loadNurseryData(learnerId, termId);
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
  values["academic.year"] = d.term?.year;
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

export async function generateCustomOutput(template: SchoolTemplate, learnerIds: string[], termId: string, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  if (!learnerIds.length) throw new Error("No learners selected");
  const bytes = await templateBytes(template);
  const custom = await loadReportCustomFields(template.school_id, template.level, template.id);
  const settingsBorder = await usesSettingsBorder(template.school_id, template.level);
  const merged = await PDFDocument.create();
  for (const [index, learnerId] of learnerIds.entries()) {
    const { values, decorations } = await customReportData(template.level, learnerId, termId, template.school_id);
    const associations = associationValues(custom, values, learnerId, termId);
    const overrides = Object.fromEntries(associations.filter(a => a.pdf_field).map(a => [normalizeField(a.pdf_field ?? ""), a.value]));
    const placed = await applyCustomPlacements(await fillTemplate(bytes, values, overrides), associations);
    const filled = await applyTemplateDecorations(placed, { ...decorations, border: settingsBorder ? decorations.borderStyle : null });
    onProgress?.(index + 1, learnerIds.length);
    if (learnerIds.length === 1) return bytesToPdfBlob(filled);
    const source = await PDFDocument.load(filled);
    source.getForm().flatten({ updateFieldAppearances: false });
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach(page => merged.addPage(page));
  }
  return bytesToPdfBlob(await merged.save());
}