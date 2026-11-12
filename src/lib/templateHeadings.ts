import { templateBytes, type SchoolTemplate } from "./reportTemplates";

/** Printed text lines of a template (headings of tables and sections). Scanned images yield none. */
export async function templateTextLines(template: SchoolTemplate): Promise<string[]> {
  const [pdfjs, worker, bytes] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url"), templateBytes(template)]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const lines = new Map<string, string[]>();
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const key = `${n}:${Math.round(item.transform[5])}`;
        lines.set(key, [...(lines.get(key) ?? []), item.str.trim()]);
      }
    }
  } finally { await doc.destroy(); }
  return [...new Set([...lines.values()].map(parts => parts.join(" ").replace(/\s+/g, " ").trim()).filter(t => t.length > 2 && t.length <= 80))];
}
