/**
 * Fresh PDF download system (independent of screen UI/print logic).
 *
 * Strategy:
 *  1. Render an A4-locked container offscreen.
 *  2. Mount the report sheet React tree inside it, using the same data hooks
 *     so the PDF matches print output exactly.
 *  3. Wait for all images + fonts to fully load (preloaded as base64 already).
 *  4. Auto-shrink content (transform: scale) so it fits one A4 page.
 *  5. Hand to html2pdf with clean, fixed config.
 */
import html2pdf from "html2pdf.js";
import JSZip from "jszip";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { ReportCardSheet } from "@/components/ReportCardSheet";
import { waitForImagesAndFonts } from "@/lib/reportAssets";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAGE_PADDING_MM = 8;

function buildHostContainer(): { host: HTMLDivElement; page: HTMLDivElement } {
  const host = document.createElement("div");
  host.setAttribute("data-pdf-host", "true");
  host.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    "width:" + A4_WIDTH_MM + "mm",
    "height:auto",
    "background:#ffffff",
    "z-index:-1",
    "pointer-events:none",
  ].join(";");

  const page = document.createElement("div");
  page.setAttribute("data-pdf-page", "true");
  page.style.cssText = [
    "width:" + A4_WIDTH_MM + "mm",
    "height:" + A4_HEIGHT_MM + "mm",
    "padding:" + PAGE_PADDING_MM + "mm",
    "box-sizing:border-box",
    "overflow:hidden",
    "background:#ffffff",
    "color:#000000",
    "position:relative",
    "font-family:'Times New Roman', Times, serif",
  ].join(";");

  // Inner wrapper that we shrink-to-fit.
  const inner = document.createElement("div");
  inner.setAttribute("data-pdf-inner", "true");
  inner.style.cssText = [
    "transform-origin:top left",
    "width:100%",
    "height:auto",
  ].join(";");

  page.appendChild(inner);
  host.appendChild(page);
  document.body.appendChild(host);
  return { host, page };
}

function autoShrinkToFit(page: HTMLDivElement) {
  const inner = page.querySelector<HTMLDivElement>("[data-pdf-inner]");
  if (!inner) return;
  // Reset first
  inner.style.transform = "none";
  inner.style.width = "100%";

  const availableHeightPx = page.clientHeight - mmToPx(PAGE_PADDING_MM * 2);
  const availableWidthPx = page.clientWidth - mmToPx(PAGE_PADDING_MM * 2);
  const contentHeight = inner.scrollHeight;
  const contentWidth = inner.scrollWidth;

  const scaleH = contentHeight > availableHeightPx ? availableHeightPx / contentHeight : 1;
  const scaleW = contentWidth > availableWidthPx ? availableWidthPx / contentWidth : 1;
  const scale = Math.min(scaleH, scaleW, 1);

  if (scale < 1) {
    inner.style.transform = `scale(${scale})`;
    // Compensate width so layout doesn't get cut horizontally after scale.
    inner.style.width = `${100 / scale}%`;
  }
}

function mmToPx(mm: number) {
  // 1mm = 3.7795275591 px at 96dpi
  return mm * 3.7795275591;
}

async function renderSheetIntoPage(
  page: HTMLDivElement,
  learnerId: string,
  termId: string,
): Promise<Root> {
  const inner = page.querySelector<HTMLDivElement>("[data-pdf-inner]")!;
  const root = createRoot(inner);

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("Report card timed out while loading"));
    }, 30_000);

    root.render(
      createElement(ReportCardSheet, {
        learnerId,
        termId,
        onReady: () => {
          window.clearTimeout(timeoutId);
          // Give the DOM one paint cycle after onReady fires.
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        },
      }),
    );
  });

  // Final guard: ensure all images decoded + fonts ready
  await waitForImagesAndFonts(inner);
  autoShrinkToFit(page);
  // Allow layout to settle after transform.
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
  return (name || "report-card").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 80);
}

/** Generate a single learner's report card PDF and trigger a browser download. */
export async function downloadReportCardPDF(
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
    try { root?.unmount(); } catch { /* noop */ }
    host.remove();
  }
}

/** Generate one PDF blob (used internally by bulk). */
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
    try { root?.unmount(); } catch { /* noop */ }
    host.remove();
  }
}

export type BulkProgress = {
  done: number;
  total: number;
  current: string;
  failed: { name: string; error: string }[];
};

/** Bulk: generates each learner's PDF in small batches and zips them. */
export async function downloadReportCardsZip(
  learners: { id: string; full_name: string }[],
  termId: string,
  zipFilename: string,
  onProgress?: (p: BulkProgress) => void,
  batchSize = 5,
): Promise<{ failed: { name: string; error: string }[] }> {
  const zip = new JSZip();
  const failed: { name: string; error: string }[] = [];
  let done = 0;

  for (let i = 0; i < learners.length; i += batchSize) {
    const batch = learners.slice(i, i + batchSize);
    // Sequential within a batch keeps DOM/render predictable.
    for (const learner of batch) {
      onProgress?.({ done, total: learners.length, current: learner.full_name, failed });
      try {
        const blob = await generatePDFBlob(learner.id, termId, learner.full_name);
        zip.file(`${safeFilename(learner.full_name)}.pdf`, blob);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[bulk pdf] failed for", learner.full_name, err);
        failed.push({ name: learner.full_name, error: msg });
      }
      done += 1;
      onProgress?.({ done, total: learners.length, current: learner.full_name, failed });
    }
    // Small breather between batches so the browser stays responsive.
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
