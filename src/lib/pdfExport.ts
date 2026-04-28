// Browser-side PDF generation using html2pdf.js
// No server / edge function involvement.
import html2pdf from "html2pdf.js";
import JSZip from "jszip";

export type PdfElementJob = {
  element: HTMLElement;
  filename: string;
};

const baseOptions = (filename: string) => ({
  margin: 0,
  filename,
  image: { type: "jpeg" as const, quality: 0.95 },
  html2canvas: {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
  },
  jsPDF: {
    unit: "mm" as const,
    format: "a4" as const,
    orientation: "portrait" as const,
  },
  pagebreak: { mode: ["css", "legacy"] as any },
});

export async function elementToPdfBlob(element: HTMLElement, filename = "report.pdf"): Promise<Blob> {
  // html2pdf returns a worker chain; .output('blob') resolves to a Blob.
  const blob: Blob = await (html2pdf() as any)
    .set(baseOptions(filename))
    .from(element)
    .outputPdf("blob");
  return blob;
}

export async function downloadPdfFromElement(element: HTMLElement, filename = "report.pdf"): Promise<void> {
  await (html2pdf() as any).set(baseOptions(filename)).from(element).save();
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
