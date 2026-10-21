import { PDFDocument, PrintScaling } from "pdf-lib";
import { generateReportCardBlob } from "@/lib/pdfGenerator";

const A4_WIDTH_PT = 210 * 72 / 25.4;
const A4_HEIGHT_PT = 297 * 72 / 25.4;

/** Reject extra pages or altered page sizes rather than silently dropping content. */
export async function validatePrimaryPdf(blob: Blob, expectedPages: number): Promise<PDFDocument> {
  const document = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
  if (expectedPages < 1 || document.getPageCount() !== expectedPages) {
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
  if (learnerIds.length === 1) {
    const blob = await generateReportCardBlob(learnerIds[0], termId);
    await validatePrimaryPdf(blob, 1);
    onProgress?.(1, 1);
    return blob;
  }
  const merged = await PDFDocument.create();
  for (const [index, learnerId] of learnerIds.entries()) {
    const source = await validatePrimaryPdf(await generateReportCardBlob(learnerId, termId), 1);
    const [page] = await merged.copyPages(source, [0]);
    if (!page) throw new Error("Missing report page");
    merged.addPage(page);
    onProgress?.(index + 1, learnerIds.length);
  }
  // Ask PDF viewers not to stretch the A4 artwork. These are viewer preferences,
  // not a reconstruction or a transformation of the report's content.
  const preferences = merged.catalog.getOrCreateViewerPreferences();
  preferences.setPrintScaling(PrintScaling.None);
  preferences.setPickTrayByPDFSize(true);
  const bytes = await merged.save();
  const blob = new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" });
  await validatePrimaryPdf(blob, learnerIds.length);
  return blob;
}