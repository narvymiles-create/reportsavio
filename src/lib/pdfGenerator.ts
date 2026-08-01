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
import { Component, createElement, type ReactNode } from "react";
import { ReportCardSheet } from "@/components/ReportCardSheet";
import { waitForImagesAndFonts } from "@/lib/reportAssets";
import { AuthProvider } from "@/contexts/AuthContext";
import "@/pages/PrintReportCard.css";

const A4_W_MM = 210;
const A4_H_MM = 297;
const MIN_VALID_PDF_BYTES = 2500;

class ExportErrorBoundary extends Component<
  { children?: ReactNode; onError: (error: Error) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function buildHost(): { host: HTMLDivElement; mount: HTMLDivElement } {
  const host = document.createElement("div");
  host.setAttribute("data-pdf-host", "true");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_W_MM}mm;min-height:${A4_H_MM}mm;background:#ffffff;z-index:0;pointer-events:none;overflow:visible;`;
  const mount = document.createElement("div");
  mount.style.cssText = `width:${A4_W_MM}mm;min-height:${A4_H_MM}mm;overflow:visible;`;
  host.appendChild(mount);
  document.body.appendChild(host);
  return { host, mount };
}

async function renderSheet(mount: HTMLDivElement, learnerId: string, termId: string): Promise<Root> {
  const root = createRoot(mount);
  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error("Report card timed out while loading")), 30_000);
    root.render(
      createElement(
        ExportErrorBoundary,
        {
          onError: (error: Error) => {
            window.clearTimeout(timeoutId);
            reject(error);
          },
        },
        createElement(
          AuthProvider,
          null,
          createElement(ReportCardSheet, {
            learnerId,
            termId,
            onReady: () => {
              window.clearTimeout(timeoutId);
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            },
          }),
        ),
      ),
    );
  });
  await waitForImagesAndFonts(mount);
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  return root;
}

function addCanvasToPdf(canvas: HTMLCanvasElement): jsPDF {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const pageHeightPx = Math.floor((canvas.width * A4_H_MM) / A4_W_MM);

  if (canvas.height <= pageHeightPx + 8) {
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, A4_W_MM, A4_H_MM, undefined, "FAST");
    return pdf;
  }

  let sourceY = 0;
  let pageIndex = 0;
  while (sourceY < canvas.height) {
    const sliceHeight = Math.min(pageHeightPx, canvas.height - sourceY);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;
    const ctx = pageCanvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare report card PDF page");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

    if (pageIndex > 0) pdf.addPage();
    const pageHeightMm = (sliceHeight * A4_W_MM) / canvas.width;
    pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", 0, 0, A4_W_MM, pageHeightMm, undefined, "FAST");
    sourceY += sliceHeight;
    pageIndex += 1;
  }
  return pdf;
}

async function captureToPdfBlob(el: HTMLElement): Promise<Blob> {
  if (el.offsetWidth === 0 || el.offsetHeight === 0) {
    throw new Error("Report card rendered with no visible size");
  }
  const captureWidth = Math.ceil(Math.max(el.scrollWidth, el.offsetWidth));
  const captureHeight = Math.ceil(Math.max(el.scrollHeight, el.offsetHeight));
  const extendsPastPage = captureHeight > el.offsetHeight + 8;
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    width: captureWidth,
    height: captureHeight,
    windowWidth: captureWidth,
    windowHeight: captureHeight,
    imageTimeout: 15000,
    onclone: (_doc, clonedElement) => {
      const page = clonedElement as HTMLElement;
      page.style.background = "#ffffff";
      page.style.boxShadow = "none";
      page.style.transform = "none";
      if (extendsPastPage) {
        page.style.height = `${captureHeight}px`;
        page.style.maxHeight = "none";
        page.style.overflow = "visible";
      }
    },
  });
  if (canvas.width === 0 || canvas.height === 0) {
    throw new Error("Report card snapshot was empty");
  }
  const pdf = addCanvasToPdf(canvas);

  const blob = pdf.output("blob");
  assertValidPdfBlob(blob);
  return blob;
}

function assertValidPdfBlob(blob: Blob): void {
  if (!(blob instanceof Blob) || blob.size < MIN_VALID_PDF_BYTES) {
    throw new Error("Generated report card PDF is empty");
  }
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
  assertValidPdfBlob(blob);
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
  let added = 0;

  for (let i = 0; i < learners.length; i += batchSize) {
    const batch = learners.slice(i, i + batchSize);
    for (const learner of batch) {
      onProgress?.({ done, total: learners.length, current: learner.full_name, failed });
      try {
        const blob = await generatePDFBlobFor(learner.id, termId);
        assertValidPdfBlob(blob);
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
    await new Promise((r) => setTimeout(r, 100));
  }

  if (added === 0) {
    throw new Error(failed.length ? `No report cards were generated. First error: ${failed[0].error}` : "No report cards were generated.");
  }
  if (added !== learners.length || failed.length > 0) {
    throw new Error(`Generated ${added} of ${learners.length} report card(s). ZIP was not created because every selected learner must be included.`);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  if (!(zipBlob instanceof Blob) || zipBlob.size === 0 || Object.keys(zip.files).length !== learners.length) {
    throw new Error("ZIP archive was empty or incomplete");
  }
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
