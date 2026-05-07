/**
 * Nursery Report Card PDF generation — rebuilt from scratch.
 * Uses a dedicated NurseryReportPDF component rendered into a hidden container.
 * NO cloning of interactive DOM. NO transforms. NO scaling hacks.
 */
import html2pdf from "html2pdf.js";
import JSZip from "jszip";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { NurseryReportPDF } from "@/components/NurseryReportPDF";

/** Wait for all images + fonts inside the pdf-root */
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
  await new Promise((r) => setTimeout(r, 500));
}

const pdfOptions = (filename: string) => ({
  margin: 0,
  filename,
  image: { type: "jpeg" as const, quality: 1 },
  html2canvas: {
    scale: 2,
    useCORS: true,
    logging: false,
    letterRendering: true,
    backgroundColor: "#ffffff",
  },
  jsPDF: {
    unit: "mm" as const,
    format: "a4",
    orientation: "portrait" as const,
  },
  pagebreak: { mode: ["avoid-all"] as string[] },
});

function safeFilename(name: string) {
  return (name || "nursery-report").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 80);
}

/** Create a hidden host container sized exactly to A4 */
function createHost(): { host: HTMLDivElement; mount: HTMLDivElement } {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;background:#fff;z-index:-1;pointer-events:none;overflow:hidden;";
  const mount = document.createElement("div");
  host.appendChild(mount);
  document.body.appendChild(host);
  return { host, mount };
}

/** Render NurseryReportPDF into a container and wait for onReady */
async function renderPDF(mount: HTMLDivElement, learnerId: string, termId: string): Promise<Root> {
  const root = createRoot(mount);
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("PDF render timed out")), 30_000);
    root.render(
      createElement(NurseryReportPDF, {
        learnerId,
        termId,
        onReady: () => {
          window.clearTimeout(timeout);
          resolve();
        },
      }),
    );
  });
  return root;
}

/**
 * Download a single nursery report PDF.
 */
export async function downloadNurseryReportCardPDF(
  learnerId: string,
  termId: string,
  learnerName: string,
): Promise<void> {
  const { host, mount } = createHost();
  let root: Root | null = null;
  try {
    root = await renderPDF(mount, learnerId, termId);
    const el = mount.querySelector(".pdf-root") as HTMLElement;
    if (!el) throw new Error("PDF element not found");
    await waitForPDFReady(el);
    const filename = `${safeFilename(learnerName)}.pdf`;
    await html2pdf().set(pdfOptions(filename)).from(el).save();
  } finally {
    try { root?.unmount(); } catch {}
    host.remove();
  }
}

/**
 * Download from a visible .pdf-root element (used by preview pages).
 */
export async function downloadNurseryReportCardFromElement(
  element: HTMLElement,
  learnerName: string,
): Promise<void> {
  await waitForPDFReady(element);
  const filename = `${safeFilename(learnerName)}.pdf`;
  await html2pdf().set(pdfOptions(filename)).from(element).save();
}

export type BulkProgress = {
  done: number;
  total: number;
  current: string;
  failed: { name: string; error: string }[];
};

/**
 * Bulk download as ZIP — renders each report one at a time in a hidden container.
 */
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
        root = await renderPDF(mount, learner.id, termId);
        const el = mount.querySelector(".pdf-root") as HTMLElement;
        if (!el) throw new Error("PDF element not found");
        await waitForPDFReady(el);
        const blob: Blob = await html2pdf()
          .set(pdfOptions(`${safeFilename(learner.full_name)}.pdf`))
          .from(el)
          .outputPdf("blob");
        zip.file(`${safeFilename(learner.full_name)}.pdf`, blob);
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
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFilename(zipFilename)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { failed };
}
