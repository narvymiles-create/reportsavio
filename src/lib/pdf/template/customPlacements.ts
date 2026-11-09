import { PDFDocument, StandardFonts } from "pdf-lib";
import type { ReportAssociation } from "@/lib/reportCustomFields";

export type FilledAssociation = ReportAssociation & { value: string; multiline: boolean };
/** Coordinates are PDF points from the top left; artwork is never erased or reflowed. */
export async function applyCustomPlacements(bytes: Uint8Array, associations: FilledAssociation[]) {
  const placements = associations.filter(a => !a.pdf_field && a.value);
  if (!placements.length) return bytes;
  const doc = await PDFDocument.load(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const a of placements) {
    const page = doc.getPages()[a.page - 1];
    if (!page || a.x + a.width > page.getWidth() || a.y + a.height > page.getHeight()) throw new Error("A saved field placement is outside the PDF page.");
    try { font.encodeText(a.value); } catch { throw new Error("This placed value contains characters not supported by the PDF font."); }
    let size = a.font_size;
    const linesFor = (s: number) => {
      if (!a.multiline) return [a.value.replace(/[\r\n]+/g, " ")];
      const lines: string[] = [];
      for (const paragraph of a.value.split(/\r?\n/)) {
        let line = "";
        for (const char of paragraph) {
          if (line && font.widthOfTextAtSize(line + char, s) > a.width) { lines.push(line); line = ""; }
          line += char;
        }
        lines.push(line);
      }
      return lines;
    };
    let lines = linesFor(size);
    while (size > 4 && (lines.length * size * 1.2 > a.height || lines.some(line => font.widthOfTextAtSize(line, size) > a.width))) { size = Math.max(4, size - 0.25); lines = linesFor(size); }
    if (lines.length * size * 1.2 > a.height || lines.some(line => font.widthOfTextAtSize(line, size) > a.width)) throw new Error("A custom value does not fit its placement. Enlarge the saved area.");
    lines.forEach((line, i) => {
      const width = font.widthOfTextAtSize(line, size);
      const x = a.x + (a.align === "center" ? (a.width - width) / 2 : a.align === "right" ? a.width - width : 0);
      page.drawText(line, { x, y: page.getHeight() - a.y - size - i * size * 1.2, size, font });
    });
  }
  return doc.save({ updateFieldAppearances: false });
}