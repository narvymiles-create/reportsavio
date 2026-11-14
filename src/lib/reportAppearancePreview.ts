import { currentReportDataSource } from "./onlineReportDataSource";
import type { ReportDataSource } from "./reportDataSource";
import type { ReportAppearance } from "./reportAppearance";
import { defaultTemplatePreview } from "./pdf/defaultTemplatePreview";
import { loadPrimaryData, renderPrimaryBytes } from "./pdf/primaryReport";
import { loadNurseryData, renderNurseryReport } from "./pdf/nurseryReport";
import { generateCustomOutput } from "./pdf/customReport";
import { bytesToPdfBlob } from "./pdf/core";
import type { SchoolTemplate } from "./reportTemplates";
export async function loadAppearancePreview(schoolId: string, level: "primary" | "nursery") {
  const source = await currentReportDataSource();
  if (source.schoolId !== schoolId) throw new Error("School changed. Reopen appearance settings.");
  const [learners, terms, templates] = await Promise.all([
    source.read(level === "primary" ? "learners" : "nursery_learners", { order: "full_name", limit: 1 }),
    source.read("terms", { order: "is_current", ascending: false, limit: 1 }),
    source.read("report_templates", { eq: { level, is_active: true }, limit: 1 }),
  ]);
  const learner = learners[0], term = terms[0];
  if (!learner || !term) return { template: null, render: (appearance: ReportAppearance) => defaultTemplatePreview(level, schoolId, appearance) };
  const template = templates[0] as SchoolTemplate | undefined;
  if (template) return { template, render: (appearance: ReportAppearance) => generateCustomOutput(template, [learner.id], term.id, undefined, undefined, source, appearance) };
  const data = level === "primary" ? await loadPrimaryData(learner.id, term.id, source) : await loadNurseryData(learner.id, term.id, source);
  return { template: null, render: async (appearance: ReportAppearance) => "klass" in data ? bytesToPdfBlob(await renderPrimaryBytes({ ...data, appearance })) : bytesToPdfBlob(await (await renderNurseryReport({ ...data, appearance })).save()) };
}
/** Bulk Nursery uses the identical per-learner file, never a separate HTML colour implementation. */
export async function generateNurseryOutput(ids: string[], termId: string, progress?: (done: number, total: number) => void, provider?: ReportDataSource) {
  const source = provider ?? await currentReportDataSource();
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  for (const [index, id] of ids.entries()) { await renderNurseryReport(await loadNurseryData(id, termId, source), pdf); progress?.(index + 1, ids.length); }
  return bytesToPdfBlob(await pdf.save());
}