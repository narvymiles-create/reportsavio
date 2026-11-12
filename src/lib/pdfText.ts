/** All text in a generated PDF, as read by PDF.js (the same reader used by the preview). */
export async function pdfText(blob: Blob): Promise<string> {
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
  const parts: string[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      parts.push(...(await page.getTextContent()).items.map(i => ("str" in i ? i.str : "")));
      // Filled form fields live in widget appearances.
      parts.push(...(await page.getAnnotations()).map(a => String(a.fieldValue ?? "")));
    }
  } finally { await doc.destroy(); }
  return parts.join(" ");
}
