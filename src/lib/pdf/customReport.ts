import { PDFDocument } from "pdf-lib";
import { loadPrimaryData, computeAll } from "./primaryReport";
import { loadNurseryData } from "./nurseryReport";
import { gradeFor } from "@/lib/grading";
import { fillTemplate, normalizeField, type TemplateValues } from "./template/forms";
import { templateBytes, type SchoolTemplate } from "@/lib/reportTemplates";
import { bytesToPdfBlob } from "./core";

export async function customReportValues(level: string, learnerId: string, termId: string): Promise<TemplateValues> {
  const d = level === "primary" ? await loadPrimaryData(learnerId, termId) : await loadNurseryData(learnerId, termId);
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
  if (primary) {
    const computed = computeAll(primary);
    for (const phase of ["bot", "mid", "eot"] as const) {
      const summary = computed[phase];
      for (const key of ["total", "avg", "division", "position", "classSize"] as const) values[normalizeField(`${phase}.${key}`)] = summary.has ? summary[key] : "";
      values[`${phase}.average`] = summary.has ? summary.avg : "";
      values[`${phase}.aggregate`] = summary.aggregateText;
    }
    primary.subjects.forEach((subject, index) => {
      const prefixes = [`subject.${index + 1}`, `subject.${normalizeField(subject.code_label || subject.code)}`];
      prefixes.forEach(prefix => {
        values[`${prefix}.name`] = subject.name;
        const marks = computed.bySubject.get(subject.id);
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
  return values;
}

export async function generateCustomOutput(template: SchoolTemplate, learnerIds: string[], termId: string, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  if (!learnerIds.length) throw new Error("No learners selected");
  const bytes = await templateBytes(template);
  const merged = await PDFDocument.create();
  for (const [index, learnerId] of learnerIds.entries()) {
    const filled = await fillTemplate(bytes, await customReportValues(template.level, learnerId, termId));
    onProgress?.(index + 1, learnerIds.length);
    if (learnerIds.length === 1) return bytesToPdfBlob(filled);
    const source = await PDFDocument.load(filled);
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach(page => merged.addPage(page));
  }
  return bytesToPdfBlob(await merged.save());
}