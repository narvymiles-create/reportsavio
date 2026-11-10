import { PDFDocument, PDFTextField, StandardFonts } from "pdf-lib";

export type TemplateValues = Record<string, string | number | null | undefined>;
export const normalizeField = (name: string) => name.trim().toLowerCase().replace(/[\s_-]+/g, ".");

// Only named text fields are filled; no coordinates, artwork, or table reflow.
const aliases: Record<string, string> = {
  "school.name": "school.name", "schoolname": "school.name",
  "learner.name": "learner.full.name", "student.name": "learner.full.name", "pupil.name": "learner.full.name",
  "full.name": "learner.full.name", "name": "learner.full.name",
  "class": "class.name", "stream": "stream.name", "term": "term.name", "year": "academic.year",
  "age": "learner.age", "sex": "learner.sex", "house": "learner.house", "section": "learner.section",
  "lin.no": "learner.lin.no", "index.no": "learner.index.no", "reg.no": "learner.reg.no", "pay.code": "learner.pay.code",
};
export function fieldValue(name: string, values: TemplateValues): string {
  const key = normalizeField(name);
  const value = values[aliases[key] ?? key];
  return value == null ? "" : String(value);
}

function originalStandardFont(field: PDFTextField): StandardFonts | null {
  const appearance = field.acroField.getDefaultAppearance() ?? "";
  const fontName = /\/([^\s]+)\s+[\d.]+\s+Tf/.exec(appearance)?.[1];
  if (!fontName) return null;
  const fonts: Record<string, StandardFonts> = {
    Helv: StandardFonts.Helvetica, Helvetica: StandardFonts.Helvetica,
    HeBo: StandardFonts.HelveticaBold, "Helvetica-Bold": StandardFonts.HelveticaBold,
    HeOb: StandardFonts.HelveticaOblique, "Helvetica-Oblique": StandardFonts.HelveticaOblique,
    TiRo: StandardFonts.TimesRoman, "Times-Roman": StandardFonts.TimesRoman,
    TiBo: StandardFonts.TimesRomanBold, "Times-Bold": StandardFonts.TimesRomanBold,
    TiIt: StandardFonts.TimesRomanItalic, "Times-Italic": StandardFonts.TimesRomanItalic,
    Cour: StandardFonts.Courier, Courier: StandardFonts.Courier,
    CoBo: StandardFonts.CourierBold, "Courier-Bold": StandardFonts.CourierBold,
  };
  return fonts[fontName] ?? null;
}

export async function inspectTemplate(bytes: Uint8Array) {
  if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") throw new Error("Choose a valid PDF file.");
  let doc: PDFDocument;
  try { doc = await PDFDocument.load(bytes); }
  catch (error) {
    if (error instanceof Error && /encrypt/i.test(error.message)) throw new Error("Password-protected PDFs cannot be used as templates. Save an unlocked PDF and upload it again.");
    throw new Error("The PDF is damaged or unreadable. Export a new PDF and try again.");
  }
  const form = doc.getForm();
  if (form.hasXFA()) throw new Error("XFA forms are not supported. Upload a standard PDF or AcroForm PDF.");
  const page = doc.getPages()[0];
  if (!page) throw new Error("The PDF has no pages.");
  const fields = form.getFields();
  const textFields = fields.filter((field): field is PDFTextField => field instanceof PDFTextField && originalStandardFont(field) !== null);
  return { pageCount: doc.getPageCount(), width: page.getWidth(), height: page.getHeight(), fieldNames: textFields.map(f => f.getName()), unsupportedCount: fields.length - textFields.length };
}

export async function fillTemplate(bytes: Uint8Array, values: TemplateValues, overrides: TemplateValues = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();
  if (form.hasXFA()) throw new Error("XFA templates cannot be populated.");
  if (!form.getFields().length) return bytes; // Static artwork stays byte-for-byte unchanged.
  for (const field of form.getFields()) {
    if (!(field instanceof PDFTextField)) continue;
    const originalFont = originalStandardFont(field);
    if (!originalFont) continue; // Never substitute a different typeface.
    const font = await doc.embedFont(originalFont);
    const key = normalizeField(field.getName());
    const value = Object.prototype.hasOwnProperty.call(overrides, key) ? String(overrides[key] ?? "") : fieldValue(field.getName(), values);
    try { font.encodeText(value); }
    catch { throw new Error(`The original font in “${field.getName()}” cannot display this value.`); }
    const maxLength = field.getMaxLength();
    if (maxLength !== undefined && value.length > maxLength) throw new Error(`“${field.getName()}” exceeds the template's field length.`);
    field.setText(value);
    field.updateAppearances(font);
    field.enableReadOnly();
  }
  return doc.save({ updateFieldAppearances: false });
}