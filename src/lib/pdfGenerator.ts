/**
 * Primary report card downloads.
 *
 * PDFs are produced natively with pdf-lib (see src/lib/pdf/primaryReport.ts) —
 * no HTML rendering or canvas rasterisation is involved, so the output is
 * vector-sharp and identical every time.
 */
import JSZip from "jszip";
import { primaryReportBlob } from "@/lib/pdf/primaryReport";
import { safeFilename, triggerBlobDownload } from "@/lib/pdf/core";

const MIN_VALID_PDF_BYTES = 800;

function assertValidPdfBlob(blob: Blob): void {
  if (!(blob instanceof Blob) || blob.size < MIN_VALID_PDF_BYTES) {
    throw new Error("Generated report card PDF is empty");
  }
}

export async function generateReportCardBlob(learnerId: string, termId: string): Promise<Blob> {
  const blob = await primaryReportBlob(learnerId, termId);
  assertValidPdfBlob(blob);
  return blob;
}

export async function downloadReportCardPDF(
  learnerId: string,
  termId: string,
  learnerName: string,
): Promise<void> {
  const blob = await generateReportCardBlob(learnerId, termId);
  triggerBlobDownload(blob, `${safeFilename(learnerName)}.pdf`);
}

export type BulkProgress = {
  done: number;
  total: number;
  current: string;
  failed: { name: string; error: string }[];
};

export async function downloadReportCardsZip(
  learners: { id: string; full_name: string }[],
  termId: string,
  zipFilename: string,
  onProgress?: (p: BulkProgress) => void,
): Promise<{ failed: { name: string; error: string }[] }> {
  const zip = new JSZip();
  const failed: { name: string; error: string }[] = [];
  let done = 0;
  let added = 0;

  for (const learner of learners) {
    onProgress?.({ done, total: learners.length, current: learner.full_name, failed });
    try {
      const blob = await generateReportCardBlob(learner.id, termId);
      zip.file(`${safeFilename(learner.full_name)}.pdf`, blob);
      added += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[bulk pdf] failed for", learner.full_name, err);
      failed.push({ name: learner.full_name, error: msg });
    }
    done += 1;
    onProgress?.({ done, total: learners.length, current: learner.full_name, failed });
  }

  if (added === 0) {
    throw new Error(failed.length ? `No report cards were generated. First error: ${failed[0].error}` : "No report cards were generated.");
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  if (!(zipBlob instanceof Blob) || zipBlob.size === 0) {
    throw new Error("ZIP archive was empty");
  }
  triggerBlobDownload(zipBlob, `${safeFilename(zipFilename)}.zip`);
  return { failed };
}
