import { PDFDocument, PDFName, PDFRef, popGraphicsState, pushGraphicsState, concatTransformationMatrix, type PDFImage, type PDFPage } from "pdf-lib";
import { A4_H, A4_W, Painter, embedImage, loadFonts, mm, type Fonts } from "../core";
import { drawBorder } from "../borders";
import { normalizeField } from "./forms";

type Any = Record<string, any>;
export type TemplateAssets = { logo?: string | null; photo?: string | null; stamp?: string | null; watermark?: string | null; headSig?: string | null; classSig?: string | null };
export type TemplateDecorations = { level: string; school: Any | null | undefined; assets: TemplateAssets; border: string | null };

/** Field names that receive an image instead of text, matched after normalizeField. */
export const IMAGE_FIELDS: Record<string, keyof TemplateAssets> = {
  "logo": "logo", "school.logo": "logo", "school.badge": "logo", "badge": "logo",
  "photo": "photo", "learner.photo": "photo", "student.photo": "photo", "pupil.photo": "photo",
  "stamp": "stamp", "school.stamp": "stamp",
  "head.teacher.signature": "headSig", "head.signature": "headSig", "headteacher.signature": "headSig",
  "class.teacher.signature": "classSig", "class.signature": "classSig", "classteacher.signature": "classSig", "teacher.signature": "classSig", "class.teacher.sign": "classSig", "head.teacher.sign": "headSig", "headteacher.sign": "headSig",
};

/** Draw A4 millimetre artwork scaled onto any page size, so settings map proportionally. */
function onA4(page: PDFPage, fonts: Fonts, draw: (p: Painter) => void) {
  const sx = page.getWidth() / mm(A4_W), sy = page.getHeight() / mm(A4_H);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(sx, 0, 0, sy, 0, 0));
  draw(new Painter(page, fonts));
  page.pushOperators(popGraphicsState());
}

function containIn(page: PDFPage, image: PDFImage, r: { x: number; y: number; width: number; height: number }) {
  const ratio = Math.min(r.width / image.width, r.height / image.height);
  const width = image.width * ratio, height = image.height * ratio;
  page.drawImage(image, { x: r.x + (r.width - width) / 2, y: r.y + (r.height - height) / 2, width, height });
}

/**
 * Overlay the school's Settings (watermark, image fields, optional border, stamp)
 * onto an already-filled template. Never erases or reflows the template artwork.
 */
export async function applyTemplateDecorations(bytes: Uint8Array, o: TemplateDecorations): Promise<Uint8Array> {
  const s: Any = o.school ?? {};
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  if (!pages.length) return bytes;
  const fonts = await loadFonts(doc);
  const cache = new Map<string, PDFImage | null>();
  const image = async (key: keyof TemplateAssets) => {
    if (!cache.has(key)) cache.set(key, await embedImage(doc, o.assets[key]));
    return cache.get(key) ?? null;
  };

  // Image fields: draw into the field's own rectangle and clear the field.
  const form = doc.getForm();
  for (const field of form.getFields()) {
    const asset = IMAGE_FIELDS[normalizeField(field.getName())];
    if (!asset) continue;
    const img = await image(asset);
    for (const widget of field.acroField.getWidgets()) {
      const ref = widget.dict.get(PDFName.of("P"));
      const page = (ref instanceof PDFRef && pages.find(pg => pg.ref === ref)) || pages[0];
      if (img) containIn(page, img, widget.getRectangle());
    }
    // Remove the widget so its stale appearance (filled text or background) can't cover the image.
    form.removeField(field);
  }

  const watermark = s.watermark_enabled !== false && s.watermark_path ? await image("watermark") : null;
  const stamp = s.stamp_path ? await image("stamp") : null;
  pages.forEach((page, index) => {
    onA4(page, fonts, p => {
      if (watermark && o.level === "nursery") {
        const w = A4_W * 0.5 * Number(s.watermark_scale ?? 1);
        const h = w / (watermark.width / watermark.height);
        p.image(watermark, { x: (A4_W * Number(s.watermark_x ?? 50)) / 100 - w / 2, y: (A4_H * Number(s.watermark_y ?? 50)) / 100 - h / 2, w, h }, { opacity: Number(s.watermark_opacity ?? 0.15) });
      } else if (watermark && s.watermark_enabled) {
        const opacity = Number(s.watermark_opacity ?? 0.3);
        const mode = (s.watermark_mode as string) || "custom";
        if (mode === "fit" || mode === "fill") p.image(watermark, { x: 10, y: 10, w: A4_W - 20, h: A4_H - 20 }, { opacity, cover: mode === "fill" });
        else {
          const w = A4_W * 0.4 * Number(s.watermark_scale ?? 1);
          p.image(watermark, { x: (A4_W * Number(s.watermark_x ?? 50)) / 100 - w / 2, y: (A4_H * Number(s.watermark_y ?? 50)) / 100 - w / 2, w, h: w }, { opacity });
        }
      }
      if (o.border) drawBorder(p, o.border);
      if (stamp && index === 0) {
        const size = 28 * Number(s.stamp_size ?? 1);
        p.image(stamp, { x: (A4_W * Number(s.stamp_x ?? 75)) / 100 - size / 2, y: (A4_H * Number(s.stamp_y ?? 78)) / 100 - size / 2, w: size, h: size }, { opacity: Number(s.stamp_opacity ?? 0.6) });
      }
    });
  });
  return doc.save({ updateFieldAppearances: false });
}
