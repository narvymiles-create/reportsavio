/**
 * Primary Report Card PDF generation.
 *
 * Renders the ReportCardSheet (the same component the print view uses) into an
 * off-screen host, captures its .report-page element with html2canvas, and emits
 * a single-page A4 PDF via jsPDF. No transforms, no extra padding wrappers, so
 * the downloaded PDF matches the printed output.
 */
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import JSZip from "jszip";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { ReportCardSheet } from "@/components/ReportCardSheet";
import { waitForImagesAndFonts } from "@/lib/reportAssets";

const A4_W_MM = 210;
const A4_H_MM = 297;

function buildHost(): { host: HTMLDivElement; mount: HTMLDivElement } {
  const host = document.createElement("div");
  host.setAttribute("data-pdf-host", "true");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_W_MM}mm;height:${A4_H_MM}mm;background:#ffffff;z-index:-1;pointer-events:none;overflow:hidden;`;
  const mount = document.createElement("div");
  mount.style.cssText = `width:${A4_W_MM}mm;height:${A4_H_MM}mm;`;
  host.appendChild(mount);
  document.body.appendChild(host);
  return { host, mount };
}

async function renderSheet(mount: HTMLDivElement, learnerId: string, termId: string): Promise<Root> {
  const root = createRoot(mount);
  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error("Report card timed out while loading")), 30_000);
    root.render(
      createElement(ReportCardSheet, {
        learnerId,
        termId,
        onReady: () => {
          window.clearTimeout(timeoutId);
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        },
      }),
    );
  });
  await waitForImagesAndFonts(mount);
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  return root;
}

async function captureToPdfBlob(el: HTMLElement): Promise<Blob> {
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
  return pdf.output("blob");
}

function safeFilename(name: string) {
  return (name || "report-card").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 80);
}

async function generatePDFBlobFor(learnerId: string, termId: string): Promise<Blob> {
  const { host, mount } = buildHost();
  let root: Root | null = null;
  try {
    root = await renderSheet(mount, learnerId, termId);
    const page = mount.querySelector(".report-page") as HTMLElement | null;
    if (!page) throw new Error("Report page element not found");
    return await captureToPdfBlob(page);
  } finally {
    try { root?.unmount(); } catch {}
    host.remove();
  }
}

export async function downloadReportCardPDF(
  learnerId: string,
  termId: string,
  learnerName: string,
): Promise<void> {
  const blob = await generatePDFBlobFor(learnerId, termId);
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
  batchSize = 5,
): Promise<{ failed: { name: string; error: string }[] }> {
  const zip = new JSZip();
  const failed: { name: string; error: string }[] = [];
  let done = 0;

  for (let i = 0; i < learners.length; i += batchSize) {
    const batch = learners.slice(i, i + batchSize);
    for (const learner of batch) {
      onProgress?.({ done, total: learners.length, current: learner.full_name, failed });
      try {
        const blob = await generatePDFBlobFor(learner.id, termId);
        zip.file(`${safeFilename(learner.full_name)}.pdf`, blob);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[bulk pdf] failed for", learner.full_name, err);
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
