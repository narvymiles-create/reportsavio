import { PDFDocument, PrintScaling } from "pdf-lib";
import { generateReportCardBlob } from "@/lib/pdfGenerator";
import { getActiveTemplate } from "@/lib/reportTemplates";
import { generateCustomOutput } from "@/lib/pdf/customReport";

const A4_WIDTH_PT = 210 * 72 / 25.4;
const A4_HEIGHT_PT = 297 * 72 / 25.4;

/** Reject extra pages or altered page sizes rather than silently dropping content. */
export async function validatePrimaryPdf(blob: Blob, expectedPages: number): Promise<PDFDocument> {
  if (!blob.size) throw new Error("The report PDF is empty. Retry preparing the report.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") {
    throw new Error("The report response is not a PDF document. Retry preparing the report.");
  }
  let document: PDFDocument;
  try { document = await PDFDocument.load(bytes); }
  catch { throw new Error("The report PDF could not be read. Retry preparing the report."); }
  // expectedPages 0 = any whole number of pages (reports that genuinely need more than one A4 page).
  if (expectedPages < 0 || document.getPageCount() < 1 || (expectedPages > 0 && document.getPageCount() !== expectedPages)) {
    throw new Error(`Expected ${expectedPages} report page(s), received ${document.getPageCount()}`);
  }
  for (const page of document.getPages()) {
    const { width, height } = page.getSize();
    if (Math.abs(width - A4_WIDTH_PT) > 0.1 || Math.abs(height - A4_HEIGHT_PT) > 0.1 || page.getRotation().angle !== 0) {
      throw new Error("Primary reports must use A4 portrait pages");
    }
  }
  return document;
}

/** Single output is unchanged; bulk copies complete pages from the download engine. */
export async function generatePrimaryOutput(
  learnerIds: string[],
  termId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  if (!learnerIds.length) throw new Error("No learners selected");
  const template = await getActiveTemplate("primary");
  if (template) return generateCustomOutput(template, learnerIds, termId, onProgress);
  if (learnerIds.length === 1) {
    const blob = await generateReportCardBlob(learnerIds[0], termId);
    await validatePrimaryPdf(blob, 0);
    onProgress?.(1, 1);
    return blob;
  }
  const merged = await PDFDocument.create();
  let pageTotal = 0;
  for (const [index, learnerId] of learnerIds.entries()) {
    const source = await validatePrimaryPdf(await generateReportCardBlob(learnerId, termId), 0);
    for (const page of await merged.copyPages(source, source.getPageIndices())) merged.addPage(page);
    pageTotal += source.getPageCount();
    onProgress?.(index + 1, learnerIds.length);
  }
  // Ask PDF viewers not to stretch the A4 artwork. These are viewer preferences,
  // not a reconstruction or a transformation of the report's content.
  const preferences = merged.catalog.getOrCreateViewerPreferences();
  preferences.setPrintScaling(PrintScaling.None);
  preferences.setPickTrayByPDFSize(true);
  const bytes = await merged.save();
  const blob = new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" });
  await validatePrimaryPdf(blob, pageTotal);
  return blob;
}