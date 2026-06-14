/**
 * Nursery Report Card PDF generation.
 *
 * Renders the same NurseryReportSheet component used by the print view inside
 * an off-screen host (.nrc-export-host) sized to an A4 page, captures it with
 * html2canvas, then emits a single-page A4 PDF via jsPDF.
 *
 * The print and bulk-print flows are intentionally untouched.
 */
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import JSZip from "jszip";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { NurseryReportSheet } from "@/components/NurseryReportSheet";

const A4_W_MM = 210;
const A4_H_MM = 297;

async function waitForPDFReady(container: Element): Promise<void> {
  const images = container.querySelectorAll("img");
  await Promise.all(
    Array.from(images).map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      if (img.complete && img.naturalWidth === 0) {
        img.style.display = "none";
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => { img.style.display = "none"; resolve(); };
      });
    }),
  );
  await document.fonts.ready;
  await new Promise((r) => setTimeout(r, 400));
}

function safeFilename(name: string) {
  return (name || "nursery-report").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 80);
}

/** Off-screen host sized exactly to a full A4 sheet. */
function createHost(): { host: HTMLDivElement; mount: HTMLDivElement } {
  const host = document.createElement("div");
  host.className = "nrc-export-host";
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_W_MM}mm;height:${A4_H_MM}mm;background:#fff;z-index:-1;pointer-events:none;overflow:hidden;`;
  const mount = document.createElement("div");
  mount.style.cssText = `width:${A4_W_MM}mm;height:${A4_H_MM}mm;`;
  host.appendChild(mount);
  document.body.appendChild(host);
  return { host, mount };
}

async function renderSheet(mount: HTMLDivElement, learnerId: string, termId: string): Promise<Root> {
  const root = createRoot(mount);
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("PDF render timed out")), 30_000);
    root.render(
      createElement(NurseryReportSheet, {
        learnerId,
        termId,
        onReady: () => {
          window.clearTimeout(timeout);
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        },
      }),
    );
  });
  return root;
}

/** Capture the rendered .nrc-page and return a single-page A4 PDF blob. */
async function captureToPdfBlob(el: HTMLElement, filename: string): Promise<Blob> {
  await waitForPDFReady(el);
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    windowWidth: el.offsetWidth,
    windowHeight: el.offsetHeight,
  });
  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  pdf.addImage(imgData, "JPEG", 0, 0, A4_W_MM, A4_H_MM, undefined, "FAST");
  pdf.setProperties({ title: filename });
  return pdf.output("blob");
}

/** Download a single nursery report PDF. */
export async function downloadNurseryReportCardPDF(
  learnerId: string,
  termId: string,
  learnerName: string,
): Promise<void> {
  const { host, mount } = createHost();
  let root: Root | null = null;
  try {
    root = await renderSheet(mount, learnerId, termId);
    const el = mount.querySelector(".nrc-page") as HTMLElement;
    if (!el) throw new Error("PDF element not found");
    const filename = `${safeFilename(learnerName)}.pdf`;
    const blob = await captureToPdfBlob(el, filename);
    triggerBlobDownload(blob, filename);
  } finally {
    try { root?.unmount(); } catch {}
    host.remove();
  }
}

/** Kept for compatibility — captures a visible element (used by the preview page fallback). */
export async function downloadNurseryReportCardFromElement(
  element: HTMLElement,
  learnerName: string,
): Promise<void> {
  const filename = `${safeFilename(learnerName)}.pdf`;
  const blob = await captureToPdfBlob(element, filename);
  triggerBlobDownload(blob, filename);
}

export type BulkProgress = {
  done: number;
  total: number;
  current: string;
  failed: { name: string; error: string }[];
};

/** Bulk: render each learner once, zip the resulting PDFs. */
export async function downloadNurseryReportCardsZip(
  learners: { id: string; full_name: string }[],
  termId: string,
  zipFilename: string,
  onProgress?: (p: BulkProgress) => void,
): Promise<{ failed: { name: string; error: string }[] }> {
  const zip = new JSZip();
  const failed: { name: string; error: string }[] = [];
  let done = 0;

  for (const learner of learners) {
    onProgress?.({ done, total: learners.length, current: learner.full_name, failed });
    try {
      const { host, mount } = createHost();
      let root: Root | null = null;
      try {
        root = await renderSheet(mount, learner.id, termId);
        const el = mount.querySelector(".nrc-page") as HTMLElement;
        if (!el) throw new Error("PDF element not found");
        const filename = `${safeFilename(learner.full_name)}.pdf`;
        const blob = await captureToPdfBlob(el, filename);
        zip.file(filename, blob);
      } finally {
        try { root?.unmount(); } catch {}
        host.remove();
      }
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
