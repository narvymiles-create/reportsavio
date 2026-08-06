/**
 * Template-driven PDF rendering engine.
 *
 * The uploaded (official) report card designs are stored as A4 PDFs with all
 * placeholder text stripped out. This engine loads such a PDF verbatim and only
 * paints dynamic values on top of it, at coordinates extracted from the very
 * same document — so the layout, borders, tables, fonts, images, watermarks and
 * spacing of the original design are preserved byte for byte.
 *
 * Coordinates in the field maps are PDF points with a bottom-left origin, and
 * `y` is the text baseline.
 */
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { embedImage } from "../core";

export type TplField = {
  name: string;
  x: number;
  y: number;
  size: number;
  bold: boolean;
  italic: boolean;
  maxWidth: number;
  color: number[];
  box: number[]; // [left, bottom, right, top]
};

export type TplDef = {
  page: { width: number; height: number };
  fields: TplField[];
};

export type Box = [number, number, number, number]; // left, bottom, right, top

export type TextValue = {
  text: string;
  align?: "left" | "center" | "right";
  size?: number;
  bold?: boolean;
  italic?: boolean;
  color?: [number, number, number];
  maxLines?: number;
  width?: number;
  /** Vertically centre the block inside `box` instead of using the baseline. */
  box?: Box;
};

export type ImageValue = {
  image: string | null | undefined;
  box: Box;
  opacity?: number;
};

export type FieldValue = string | number | null | undefined | TextValue | ImageValue;
export type ValueMap = Record<string, FieldValue>;

const isImageValue = (v: FieldValue): v is ImageValue =>
  !!v && typeof v === "object" && "image" in (v as object);

const isTextValue = (v: FieldValue): v is TextValue =>
  !!v && typeof v === "object" && "text" in (v as object);

type Fonts = { r: PDFFont; b: PDFFont; i: PDFFont; bi: PDFFont };

const pick = (f: Fonts, bold?: boolean, italic?: boolean) =>
  bold && italic ? f.bi : bold ? f.b : italic ? f.i : f.r;

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const words = clean.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const cand = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(cand, size) <= width || !line) line = cand;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

/** Draw one field's value onto the page. */
function paintText(page: PDFPage, fonts: Fonts, f: TplField, v: string | TextValue) {
  const tv: TextValue = typeof v === "string" ? { text: v } : v;
  const raw = (tv.text ?? "").toString();
  if (!raw.trim()) return;

  const bold = tv.bold ?? f.bold;
  const italic = tv.italic ?? f.italic;
  const font = pick(fonts, bold, italic);
  const color = tv.color ?? (f.color as [number, number, number]) ?? [0, 0, 0];
  const maxLines = tv.maxLines ?? 1;
  const avail = Math.max(8, tv.width ?? (tv.box ? tv.box[2] - tv.box[0] - 4 : f.maxWidth));

  let size = tv.size ?? f.size;
  let lines = wrap(raw, font, size, avail);
  // Shrink to fit before we allow overflow.
  while (lines.length > maxLines && size > (tv.size ?? f.size) * 0.62) {
    size -= 0.35;
    lines = wrap(raw, font, size, avail);
  }
  if (lines.length > maxLines) lines = lines.slice(0, maxLines);

  const leading = size * 1.15;
  const align = tv.align ?? "left";

  let baseTop: number;
  if (tv.box) {
    const [, bot, , top] = tv.box;
    const block = (lines.length - 1) * leading;
    baseTop = (bot + top) / 2 + block / 2 - size * 0.34;
  } else {
    baseTop = f.y;
  }

  lines.forEach((line, idx) => {
    const w = font.widthOfTextAtSize(line, size);
    let x = tv.box ? tv.box[0] + 2 : f.x;
    if (align === "center") x = (tv.box ? (tv.box[0] + tv.box[2]) / 2 : f.x + avail / 2) - w / 2;
    else if (align === "right") x = (tv.box ? tv.box[2] - 2 : f.x + avail) - w;
    page.drawText(line, {
      x,
      y: baseTop - idx * leading,
      size,
      font,
      color: rgb(color[0], color[1], color[2]),
    });
  });
}

function paintImage(page: PDFPage, img: PDFImage, box: Box, opacity = 1) {
  const [l, b, r, t] = box;
  const bw = r - l;
  const bh = t - b;
  if (bw <= 0 || bh <= 0) return;
  const ratio = img.width / img.height;
  let w = bw;
  let h = bw / ratio;
  if (h > bh) { h = bh; w = bh * ratio; }
  page.drawImage(img, { x: l + (bw - w) / 2, y: b + (bh - h) / 2, width: w, height: h, opacity });
}

export type FillOptions = {
  /** Extra synthetic fields (e.g. cloned table rows) appended to the map. */
  extraFields?: TplField[];
  /** Vertical shift applied to every field whose baseline sits below `cutY`. */
  shiftBelow?: { cutY: number; delta: number };
};

/**
 * Loads the template PDF and paints `values` onto it.
 * Returns the finished PDF bytes.
 */
export async function fillTemplate(
  templateBytes: ArrayBuffer | Uint8Array,
  def: TplDef,
  values: ValueMap,
  opts: FillOptions = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(templateBytes as ArrayBuffer);
  const page = doc.getPages()[0];
  const [r, b, i, bi] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.HelveticaOblique),
    doc.embedFont(StandardFonts.HelveticaBoldOblique),
  ]);
  const fonts: Fonts = { r, b, i, bi };

  const fields = [...def.fields, ...(opts.extraFields ?? [])];
  const shift = (f: TplField): TplField => {
    const s = opts.shiftBelow;
    if (!s || f.y >= s.cutY) return f;
    return { ...f, y: f.y - s.delta, box: [f.box[0], f.box[1] - s.delta, f.box[2], f.box[3] - s.delta] };
  };

  // Images first so text always sits on top.
  const imageJobs = fields
    .map(shift)
    .filter((f) => isImageValue(values[f.name]))
    .map(async (f) => {
      const v = values[f.name] as ImageValue;
      if (!v.image) return;
      const img = await embedImage(doc, v.image);
      if (img) paintImage(page, img, v.box, v.opacity);
    });
  await Promise.all(imageJobs);

  for (const field of fields) {
    const v = values[field.name];
    if (v == null || isImageValue(v)) continue;
    const f = shift(field);
    if (isTextValue(v)) paintText(page, fonts, f, v);
    else paintText(page, fonts, f, String(v));
  }

  return doc.save();
}

/**
 * Clones a band of template fields downwards to create additional table rows.
 *
 * `rows` are the template's existing row indices (0-based, top row first);
 * fields are matched by the `nameFor(rowIndex)` naming convention.
 */
export function cloneRow(
  def: TplDef,
  sourceRowNames: string[],
  targetSuffix: string,
  sourceSuffix: string,
  dy: number,
): TplField[] {
  const out: TplField[] = [];
  for (const base of sourceRowNames) {
    const src = def.fields.find((f) => f.name === `${base}${sourceSuffix}`);
    if (!src) continue;
    out.push({
      ...src,
      name: `${base}${targetSuffix}`,
      y: src.y - dy,
      box: [src.box[0], src.box[1] - dy, src.box[2], src.box[3] - dy],
    });
  }
  return out;
}

/** Cached template fetches so bulk generation only downloads once. */
const templateCache = new Map<string, Promise<ArrayBuffer>>();

export function loadTemplateBytes(url: string): Promise<ArrayBuffer> {
  let p = templateCache.get(url);
  if (!p) {
    p = fetch(url, { cache: "force-cache" }).then((res) => {
      if (!res.ok) throw new Error(`Template not found (${res.status})`);
      return res.arrayBuffer();
    });
    templateCache.set(url, p);
  }
  return p;
}
