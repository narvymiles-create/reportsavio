/**
 * Nursery Report Card PDF generation — captures the VISIBLE .nrc-page element.
 * No hidden containers, no re-rendering, no re-fetching.
 */
import html2pdf from "html2pdf.js";
import JSZip from "jszip";

/** Wait for all images + fonts inside a container to finish loading. Hide broken images. */
async function waitForNurseryRender(container: Element): Promise<void> {
  const images = container.querySelectorAll("img");
  await Promise.all(
    Array.from(images).map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      if (img.complete && img.naturalWidth === 0) {
        // Broken image — hide it to prevent dark blocks in html2canvas
        img.style.visibility = "hidden";
        img.style.display = "none";
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => {
          img.style.visibility = "hidden";
          img.style.display = "none";
          resolve();
        };
      });
    }),
  );
  await document.fonts.ready;
  await new Promise((r) => setTimeout(r, 300));
}

const html2pdfOptions = (filename: string) => ({
  margin: 0,
  filename,
  image: { type: "jpeg" as const, quality: 1 },
  html2canvas: {
    scale: 3,
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: "#ffffff",
    imageTimeout: 5000,
    removeContainer: true,
  },
  jsPDF: {
    unit: "mm" as const,
    format: "a4",
    orientation: "portrait" as const,
    compress: true,
  },
  pagebreak: { mode: ["avoid-all"] as string[] },
});

function safeFilename(name: string) {
  return (name || "nursery-report").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 80);
}

/**
 * Download PDF from a visible .nrc-page element.
 * `element` must be the rendered report card DOM node.
 */
export async function downloadNurseryReportCardFromElement(
  element: HTMLElement,
  learnerName: string,
): Promise<void> {
  await waitForNurseryRender(element);
  const filename = `${safeFilename(learnerName)}.pdf`;
  await html2pdf().set(html2pdfOptions(filename)).from(element).save();
}

/**
 * Generate a PDF blob from a visible .nrc-page element.
 */
async function generatePDFBlobFromElement(
  element: HTMLElement,
  learnerName: string,
): Promise<Blob> {
  await waitForNurseryRender(element);
  const filename = `${safeFilename(learnerName)}.pdf`;
  const blob: Blob = await html2pdf()
    .set(html2pdfOptions(filename))
    .from(element)
    .outputPdf("blob");
  return blob;
}

export type BulkProgress = {
  done: number;
  total: number;
  current: string;
  failed: { name: string; error: string }[];
};

/**
 * Bulk ZIP: caller provides a function that renders each learner and returns the .nrc-page element.
 * This keeps rendering in React land while PDF gen stays DOM-only.
 */
export async function downloadNurseryReportCardsZipFromElements(
  learners: { id: string; full_name: string }[],
  getElement: (learnerId: string) => Promise<HTMLElement | null>,
  zipFilename: string,
  onProgress?: (p: BulkProgress) => void,
): Promise<{ failed: { name: string; error: string }[] }> {
  const zip = new JSZip();
  const failed: { name: string; error: string }[] = [];
  let done = 0;

  for (const learner of learners) {
    onProgress?.({ done, total: learners.length, current: learner.full_name, failed });
    try {
      const el = await getElement(learner.id);
      if (!el) throw new Error("Report element not found");
      const blob = await generatePDFBlobFromElement(el, learner.full_name);
      zip.file(`${safeFilename(learner.full_name)}.pdf`, blob);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[nursery bulk pdf] failed for", learner.full_name, err);
      failed.push({ name: learner.full_name, error: msg });
    }
    done += 1;
    onProgress?.({ done, total: learners.length, current: learner.full_name, failed });
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  triggerBlobDownload(zipBlob, `${safeFilename(zipFilename)}.zip`);
  return { failed };
}

// ---- Legacy API kept for backward compat (re-render approach) ----
// These are kept but should NOT be used — prefer the *FromElement variants.

import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { NurseryReportSheet } from "@/components/NurseryReportSheet";
import { waitForImagesAndFonts } from "@/lib/reportAssets";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

function buildHostContainer(): { host: HTMLDivElement; page: HTMLDivElement } {
  const host = document.createElement("div");
  host.setAttribute("data-nursery-pdf-host", "true");
  host.style.cssText = [
    "position:fixed", "left:-10000px", "top:0",
    `width:${A4_WIDTH_MM}mm`, "height:auto",
    "background:#ffffff", "z-index:-1", "pointer-events:none",
  ].join(";");
  const page = document.createElement("div");
  page.style.cssText = [
    `width:${A4_WIDTH_MM}mm`, `height:${A4_HEIGHT_MM}mm`,
    "box-sizing:border-box", "overflow:hidden", "background:#ffffff", "position:relative",
  ].join(";");
  host.appendChild(page);
  document.body.appendChild(host);
  return { host, page };
}

async function renderSheetIntoPage(page: HTMLDivElement, learnerId: string, termId: string): Promise<Root> {
  const root = createRoot(page);
  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error("Nursery report card timed out")), 30_000);
    root.render(createElement(NurseryReportSheet, {
      learnerId, termId,
      onReady: () => { window.clearTimeout(timeoutId); requestAnimationFrame(() => requestAnimationFrame(() => resolve())); },
    }));
  });
  await waitForImagesAndFonts(page);
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  return root;
}

/** Legacy: re-render in hidden container. Prefer downloadNurseryReportCardFromElement. */
export async function downloadNurseryReportCardPDF(learnerId: string, termId: string, learnerName: string): Promise<void> {
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

/** Legacy bulk */
export async function downloadNurseryReportCardsZip(
  learners: { id: string; full_name: string }[], termId: string, zipFilename: string,
  onProgress?: (p: BulkProgress) => void, batchSize = 3,
): Promise<{ failed: { name: string; error: string }[] }> {
  const zip = new JSZip();
  const failed: { name: string; error: string }[] = [];
  let done = 0;
  for (let i = 0; i < learners.length; i += batchSize) {
    const batch = learners.slice(i, i + batchSize);
    for (const learner of batch) {
      onProgress?.({ done, total: learners.length, current: learner.full_name, failed });
      try {
        const { host, page } = buildHostContainer();
        let root: Root | null = null;
        try {
          root = await renderSheetIntoPage(page, learner.id, termId);
          const blob: Blob = await html2pdf().set(html2pdfOptions(`${safeFilename(learner.full_name)}.pdf`)).from(page).outputPdf("blob");
          zip.file(`${safeFilename(learner.full_name)}.pdf`, blob);
        } finally {
          try { root?.unmount(); } catch {}
          host.remove();
        }
      } catch (err) {
        failed.push({ name: learner.full_name, error: err instanceof Error ? err.message : String(err) });
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
