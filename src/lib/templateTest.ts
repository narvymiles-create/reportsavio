import type { ReportDataSource } from "./reportDataSource";
import type { SchoolTemplate } from "./reportTemplates";
import { loadTemplateTestCandidate } from "./templateTestSelection";
import { templateExamSections } from "./templateExams";
import { templateTextLines } from "./templateHeadings";
import { customReportData, generateCustomOutput, recognisedValues, sectionMapOf, templateFieldNames } from "./pdf/customReport";
import { loadReportCustomFields } from "./reportCustomFields";
import { verifyTemplate } from "./templateVerification";
import { checkNurseryAreas } from "./nurseryVerification";
import { pdfText } from "./pdfText";

/** Uses the production report pipeline, without any database/configuration writes. */
export async function testSchoolTemplate(template: SchoolTemplate, level: "primary" | "nursery", source: ReportDataSource) {
  if (template.school_id !== source.schoolId || template.level !== level) throw new Error("Choose a template from the current school's selected section.");
  const names = templateFieldNames(template); const map = sectionMapOf(template);
  const lines = level === "primary" ? await templateTextLines(template, source) : [];
  const candidate = await loadTemplateTestCandidate(source, level, level === "primary" ? templateExamSections(names, map, lines) : []);
  const { learner, term, academicYear } = candidate;
  const [data, custom, blob] = await Promise.all([
    customReportData(level, learner.id, term.id, source.schoolId, academicYear, source),
    loadReportCustomFields(source.schoolId, level, template.id, source),
    generateCustomOutput(template, [learner.id], term.id, undefined, academicYear, source),
  ]);
  const fields = verifyTemplate(level, names, map, data.values, data.decorations.assets, [], custom.fields, recognisedValues(template, data.values, custom.fields, custom.values, learner.id, term.id));
  const areas = level === "nursery" ? checkNurseryAreas(data.values, names, map, await pdfText(blob)) : null;
  return { ...candidate, fields, areas, blob, warnings: source.warnings ?? [] };
}