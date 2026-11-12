import { PDFDocument, StandardFonts } from "pdf-lib";
import type { TemplateValues } from "./forms";
import type { StaticTable } from "@/lib/templateSections";

/** Cell text for one positioned table: row r (1-based) of section, column c. Header rows are skipped. */
export function tableCellText(table: StaticTable, values: TemplateValues, row: number, column: string) {
  const v = values[`table.${table.section}.${row}.${column}`];
  return v == null ? "" : String(v);
}

/** One-time positioned tables for fixed/scanned PDFs: evenly divided cells in top-left PDF points; artwork is untouched. */
export async function applySectionTables(bytes: Uint8Array, tables: StaticTable[], values: TemplateValues) {
  if (!tables.length) return bytes;
  const doc = await PDFDocument.load(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const t of tables) {
    const page = doc.getPages()[t.page - 1];
    if (!page || !t.columns.length || t.rows < 1) continue;
    const cellW = t.width / t.columns.length, cellH = t.height / t.rows;
    for (let r = 1; r <= t.rows; r++) t.columns.forEach((column, c) => {
      let text = tableCellText(t, values, r, column).replace(/[\r\n]+/g, " ");
      try { font.encodeText(text); } catch { text = text.replace(/[^\x20-\x7e]/g, ""); }
      if (!text) return;
      let size = Math.min(10, cellH * 0.7);
      while (size > 4 && font.widthOfTextAtSize(text, size) > cellW - 2) size -= 0.25;
      while (text.length > 1 && font.widthOfTextAtSize(text, size) > cellW - 2) text = text.slice(0, -1);
      const x = t.x + c * cellW + (cellW - font.widthOfTextAtSize(text, size)) / 2;
      const y = page.getHeight() - (t.y + (r - 1) * cellH) - (cellH + size * 0.7) / 2;
      page.drawText(text, { x, y, size, font });
    });
  }
  return doc.save({ updateFieldAppearances: false });
}
