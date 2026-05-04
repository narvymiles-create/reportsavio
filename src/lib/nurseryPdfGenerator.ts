/**
 * Nursery Report Card PDF generation (single + bulk ZIP).
 * Mirrors the approach used by pdfGenerator.ts but renders NurseryReportSheet.
 */
import html2pdf from "html2pdf.js";
import JSZip from "jszip";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { NurseryReportSheet } from "@/components/NurseryReportSheet";
import { waitForImagesAndFonts } from "@/lib/reportAssets";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

function mmToPx(mm: number) {
  return mm * 3.7795275591;
}

function buildHostContainer(): { host: HTMLDivElement; page: HTMLDivElement } {
  const host = document.createElement("div");
  host.setAttribute("data-nursery-pdf-host", "true");
  host.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    `width:${A4_WIDTH_MM}mm`,
    "height:auto",
    "background:#ffffff",
    "z-index:-1",
    "pointer-events:none",
  ].join(";");

  const page = document.createElement("div");
  page.style.cssText = [
    `width:${A4_WIDTH_MM}mm`,
    `height:${A4_HEIGHT_MM}mm`,
    "box-sizing:border-box",
    "overflow:hidden",
    "background:#ffffff",
    "position:relative",
  ].join(";");

  host.appendChild(page);
  document.body.appendChild(host);
  return { host, page };
}

async function renderSheetIntoPage(
  page: HTMLDivElement,
  learnerId: string,
  termId: string,
): Promise<Root> {
  const root = createRoot(page);

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("Nursery report card timed out while loading"));
    }, 30_000);

    root.render(
      createElement(NurseryReportSheet, {
        learnerId,
        termId,
        onReady: () => {
          window.clearTimeout(timeoutId);
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        },
      }),
    );
  });

  await waitForImagesAndFonts(page);
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  return root;
}

const html2pdfOptions = (filename: string) => ({
  margin: 0,
  filename,
  image: { type: "jpeg" as const, quality: 0.98 },
  html2canvas: {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    windowWidth: mmToPx(A4_WIDTH_MM),
  },
  jsPDF: {
    unit: "mm",
    format: "a4",
    orientation: "portrait" as const,
    compress: true,
  },
  pagebreak: { mode: ["avoid-all"] as string[] },
});

function safeFilename(name: string) {
  return (name || "nursery-report").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 80);
}

/** Download a single nursery learner's report card as PDF. */
export async function downloadNurseryReportCardPDF(
  learnerId: string,
  termId: string,
  learnerName: string,
): Promise<void> {
  const { host, page } = buildHostContainer();
  let root: Root | null = null;
  try {
    root = await renderSheetIntoPage(page, learnerId, termId);
    const filename = `${safeFilename(learnerName)}.pdf`;
    await html2pdf().set(html2pdfOptions(filename)).from(page).save();
  } finally {
    try { root?.unmount(); } catch {}
    host.remove();
  }
}

async function generatePDFBlob(
  learnerId: string,
  termId: string,
  learnerName: string,
): Promise<Blob> {
  const { host, page } = buildHostContainer();
  let root: Root | null = null;
  try {
    root = await renderSheetIntoPage(page, learnerId, termId);
    const filename = `${safeFilename(learnerName)}.pdf`;
    const blob: Blob = await html2pdf()
      .set(html2pdfOptions(filename))
      .from(page)
      .outputPdf("blob");
    return blob;
  } finally {
    try { root?.unmount(); } catch {}
    host.remove();
  }
}

export type BulkProgress = {
  done: number;
  total: number;
  current: string;
  failed: { name: string; error: string }[];
};

/** Bulk: generates each nursery learner's PDF and zips them. */
export async function downloadNurseryReportCardsZip(
  learners: { id: string; full_name: string }[],
  termId: string,
  zipFilename: string,
  onProgress?: (p: BulkProgress) => void,
  batchSize = 3,
): Promise<{ failed: { name: string; error: string }[] }> {
  const zip = new JSZip();
  const failed: { name: string; error: string }[] = [];
  let done = 0;

  for (let i = 0; i < learners.length; i += batchSize) {
    const batch = learners.slice(i, i + batchSize);
    for (const learner of batch) {
      onProgress?.({ done, total: learners.length, current: learner.full_name, failed });
      try {
        const blob = await generatePDFBlob(learner.id, termId, learner.full_name);
        zip.file(`${safeFilename(learner.full_name)}.pdf`, blob);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[nursery bulk pdf] failed for", learner.full_name, err);
        failed.push({ name: learner.full_name, error: msg });
      }
      done += 1;
      onProgress?.({ done, total: learners.length, current: learner.full_name, failed });
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  triggerBlobDownload(zipBlob, `${safeFilename(zipFilename)}.zip`);
  return { failed };
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
