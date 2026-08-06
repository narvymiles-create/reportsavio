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
 * `y` is the text baseline. A single uniform scale factor (never per-section)
 * maps the template's page box onto the printable A4 area.
 */
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { embedImage } from "../core";

export const A4_PT_W = 595.28;
export const A4_PT_H = 841.89;

/** Smallest font size we are allowed to shrink to before clipping. */
export const MIN_FONT_PT = 7;

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
  /** >1 allows wrapping; 1 (default) keeps the value on a single line. */
  maxLines?: number;
  width?: number;
  /** Vertically centre the block inside this box instead of using the baseline. */
  box?: Box;
  /** When a box is given, centre the text vertically inside it (default true). */
  vcenter?: boolean;
  /** Paint a white rectangle over the cell before drawing (masks static labels). */
  mask?: boolean;
};

export type ImageValue = {
  image: string | null | undefined;
  box: Box;
  opacity?: number;
  /** Defaults to true — clears the placeholder cell before stamping. */
  mask?: boolean;
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

/**
 * Uniform transform from template space to the output page.
 * `s` is a single scale factor used for x, y and font sizes alike.
 */
type Xf = { s: number; dx: number; dy: number };

const tx = (t: Xf, x: number) => t.dx + x * t.s;
const ty = (t: Xf, y: number) => t.dy + y * t.s;
const tbox = (t: Xf, b: Box | number[]): Box =>
  [tx(t, b[0]), ty(t, b[1]), tx(t, b[2]), ty(t, b[3])];

function maskBox(page: PDFPage, box: Box, inset = 1.2) {
  const [l, b, r, tp] = box;
  const w = r - l - inset * 2;
  const h = tp - b - inset * 2;
  if (w <= 0 || h <= 0) return;
  page.drawRectangle({ x: l + inset, y: b + inset, width: w, height: h, color: rgb(1, 1, 1) });
}

/** Draw one field's value onto the page. */
function paintText(page: PDFPage, fonts: Fonts, xf: Xf, f: TplField, v: string | TextValue) {
  const tv: TextValue = typeof v === "string" ? { text: v } : v;
  const raw = (tv.text ?? "").toString().replace(/\s+/g, " ").trim();
  if (!raw) return;

  const bold = tv.bold ?? f.bold;
  const italic = tv.italic ?? f.italic;
  const font = pick(fonts, bold, italic);
  const color = tv.color ?? (f.color as [number, number, number]) ?? [0, 0, 0];
  const maxLines = Math.max(1, tv.maxLines ?? 1);
  const cell = tbox(xf, (tv.box ?? f.box) as Box);
  const baseSize = (tv.size ?? f.size) * xf.s;
  const avail = Math.max(8, (tv.width != null ? tv.width * xf.s : 0) ||
    (tv.box || maxLines > 1 ? cell[2] - cell[0] - 4 : f.maxWidth * xf.s));

  if (tv.mask) maskBox(page, cell);

  let size = baseSize;
  let lines: string[];
  if (maxLines === 1) {
    // Never wrap: shrink to fit, down to MIN_FONT_PT.
    while (size > MIN_FONT_PT && font.widthOfTextAtSize(raw, size) > avail) size -= 0.25;
    lines = [raw];
  } else {
    lines = wrap(raw, font, size, avail);
    while (lines.length > maxLines && size > MIN_FONT_PT) {
      size -= 0.25;
      lines = wrap(raw, font, size, avail);
    }
    if (lines.length > maxLines) lines = lines.slice(0, maxLines);
  }

  const leading = size * 1.15;
  const align = tv.align ?? "left";

  // Vertically centre inside the cell when the caller passed an explicit box,
  // otherwise keep the template's own baseline.
  let baseTop: number;
  if (tv.box) {
    const block = (lines.length - 1) * leading;
    baseTop = (cell[1] + cell[3]) / 2 + block / 2 - size * 0.34;
  } else {
    baseTop = ty(xf, f.y);
  }

  lines.forEach((line, idx) => {
    const w = font.widthOfTextAtSize(line, size);
    let x = tv.box ? cell[0] + 2 : tx(xf, f.x);
    if (align === "center") x = (tv.box ? (cell[0] + cell[2]) / 2 : tx(xf, f.x) + avail / 2) - w / 2;
    else if (align === "right") x = (tv.box ? cell[2] - 2 : tx(xf, f.x) + avail) - w;
    page.drawText(line, {
      x,
      y: baseTop - idx * leading,
      size,
      font,
      color: rgb(color[0], color[1], color[2]),
      rotate: undefined,
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
  const { width: pw, height: ph } = page.getSize();
  const tw = def.page?.width || pw;
  const th = def.page?.height || ph;

  // One uniform scale for everything — no per-section resizing.
  const s = Math.min(pw / tw, ph / th);
  const xf: Xf = { s, dx: (pw - tw * s) / 2, dy: (ph - th * s) / 2 };

  const [r, b, i, bi] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.HelveticaOblique),
    doc.embedFont(StandardFonts.HelveticaBoldOblique),
  ]);
  const fonts: Fonts = { r, b, i, bi };

  const fields = [...def.fields, ...(opts.extraFields ?? [])];
  const shift = (f: TplField): TplField => {
    const sh = opts.shiftBelow;
    if (!sh || f.y >= sh.cutY) return f;
    return { ...f, y: f.y - sh.delta, box: [f.box[0], f.box[1] - sh.delta, f.box[2], f.box[3] - sh.delta] };
  };

  // Images first (with their masks) so text always sits on top.
  const imageJobs = fields
    .map(shift)
    .filter((f) => isImageValue(values[f.name]))
    .map(async (f) => {
      const v = values[f.name] as ImageValue;
      const box = tbox(xf, v.box);
      if (v.mask !== false) maskBox(page, box);
      if (!v.image) return;
      const img = await embedImage(doc, v.image);
      if (img) paintImage(page, img, box, v.opacity);
    });
  await Promise.all(imageJobs);

  for (const fieldDef of fields) {
    const v = values[fieldDef.name];
    if (v == null || isImageValue(v)) continue;
    const f = shift(fieldDef);
    if (isTextValue(v)) paintText(page, fonts, xf, f, v);
    else paintText(page, fonts, xf, f, String(v));
  }

  return doc.save();
}

/**
 * Clones a band of template fields downwards to create additional table rows.
 * Kept for templates that explicitly opt into row expansion.
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
