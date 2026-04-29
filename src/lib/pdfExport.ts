// Browser-side PDF generation using html2pdf.js
// No server / edge function involvement.
import html2pdf from "html2pdf.js";
import JSZip from "jszip";
import { waitForImagesAndFonts } from "@/lib/reportAssets";

export type PdfElementJob = {
  element: HTMLElement;
  filename: string;
};

// A4 dimensions in mm
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
// At 96 DPI: 1mm = 3.7795275591 px
const MM_TO_PX = 3.7795275591;
const A4_WIDTH_PX = Math.round(A4_WIDTH_MM * MM_TO_PX);   // 794
const A4_HEIGHT_PX = Math.round(A4_HEIGHT_MM * MM_TO_PX); // 1123

const baseOptions = (filename: string) => ({
  margin: 0,
  filename,
  image: { type: "png" as const, quality: 1 },
  html2canvas: {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
    scrollX: 0,
    scrollY: 0,
    windowWidth: A4_WIDTH_PX,
    windowHeight: A4_HEIGHT_PX,
    width: A4_WIDTH_PX,
    height: A4_HEIGHT_PX,
  },
  jsPDF: {
    unit: "mm" as const,
    format: "a4" as const,
    orientation: "portrait" as const,
    compress: true,
  },
  pagebreak: { mode: [] as any },
});

/**
 * Prepare an element to be captured as exactly one A4 page.
 * Locks dimensions inline so html2canvas snapshots a fixed-size box.
 */
function lockElementToA4(element: HTMLElement): () => void {
  const prev = {
    width: element.style.width,
    height: element.style.height,
    maxWidth: element.style.maxWidth,
    maxHeight: element.style.maxHeight,
    minWidth: element.style.minWidth,
    minHeight: element.style.minHeight,
    margin: element.style.margin,
    boxShadow: element.style.boxShadow,
    overflow: element.style.overflow,
    pageBreakAfter: element.style.pageBreakAfter,
    breakAfter: element.style.breakAfter,
  };
  element.style.width = `${A4_WIDTH_MM}mm`;
  element.style.height = `${A4_HEIGHT_MM}mm`;
  element.style.maxWidth = `${A4_WIDTH_MM}mm`;
  element.style.maxHeight = `${A4_HEIGHT_MM}mm`;
  element.style.minWidth = `${A4_WIDTH_MM}mm`;
  element.style.minHeight = `${A4_HEIGHT_MM}mm`;
  element.style.margin = "0";
  element.style.boxShadow = "none";
  element.style.overflow = "hidden";
  element.style.pageBreakAfter = "auto";
  element.style.breakAfter = "auto";

  return () => {
    element.style.width = prev.width;
    element.style.height = prev.height;
    element.style.maxWidth = prev.maxWidth;
    element.style.maxHeight = prev.maxHeight;
    element.style.minWidth = prev.minWidth;
    element.style.minHeight = prev.minHeight;
    element.style.margin = prev.margin;
    element.style.boxShadow = prev.boxShadow;
    element.style.overflow = prev.overflow;
    element.style.pageBreakAfter = prev.pageBreakAfter;
    element.style.breakAfter = prev.breakAfter;
  };
}

async function waitForRenderAssets(element: HTMLElement): Promise<void> {
  await waitForImagesAndFonts(element);
}

function createA4CaptureTarget(element: HTMLElement): { target: HTMLElement; cleanup: () => void } {
  const host = document.createElement("div");
  host.setAttribute("data-pdf-capture-host", "true");
  host.style.position = "fixed";
  host.style.left = "0";
  host.style.top = "0";
  host.style.width = `${A4_WIDTH_MM}mm`;
  host.style.height = `${A4_HEIGHT_MM}mm`;
  host.style.overflow = "hidden";
  host.style.background = "#ffffff";
  host.style.pointerEvents = "none";
  host.style.zIndex = "-1";

  const target = element.cloneNode(true) as HTMLElement;
  host.appendChild(target);
  document.body.appendChild(host);
  const restore = lockElementToA4(target);

  return {
    target,
    cleanup: () => {
      restore();
      host.remove();
    },
  };
}

export async function elementToPdfBlob(element: HTMLElement, filename = "report.pdf"): Promise<Blob> {
  const { target, cleanup } = createA4CaptureTarget(element);
  try {
    window.scrollTo(0, 0);
    await waitForRenderAssets(target);
    const blob: Blob = await (html2pdf() as any)
      .set(baseOptions(filename))
      .from(target)
      .outputPdf("blob");
    return blob;
  } finally {
    cleanup();
  }
}

export async function downloadPdfFromElement(element: HTMLElement, filename = "report.pdf"): Promise<void> {
  const { target, cleanup } = createA4CaptureTarget(element);
  try {
    window.scrollTo(0, 0);
    await waitForRenderAssets(target);
    await (html2pdf() as any).set(baseOptions(filename)).from(target).save();
  } finally {
    cleanup();
  }
}

export async function downloadElementsAsZip(
  jobs: PdfElementJob[],
  zipName = `report-cards-${new Date().toISOString().slice(0, 10)}.zip`,
  onProgress?: (done: number, total: number, current: string) => void
): Promise<{ failures: string[] }> {
  const zip = new JSZip();
  const failures: string[] = [];
  for (let i = 0; i < jobs.length; i++) {
    const { element, filename } = jobs[i];
    try {
      const blob = await elementToPdfBlob(element, filename);
      zip.file(filename, blob);
    } catch (err) {
      console.error(`[pdfExport] failed for ${filename}`, err);
      failures.push(filename);
    }
    onProgress?.(i + 1, jobs.length, filename);
    // yield to keep UI responsive
    await new Promise(r => setTimeout(r, 20));
  }
  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { failures };
}

export function safeFileName(name: string, fallback = "report"): string {
  const cleaned = (name || fallback).replace(/[^a-z0-9_\-\s]/gi, "_").trim();
  return cleaned || fallback;
}
