/**
 * Template-driven PDF rendering engine.
 *
 * The official report card design is converted **once** from DOCX to a single
 * A4 PDF (uniformly scaled, placeholder tokens erased) and shipped as a CDN
 * asset. That PDF is an immutable background canvas: this engine never redraws
 * tables, borders, fonts or spacing — it only stamps dynamic values into the
 * cell boxes recorded in the matching `*.fields.json` map.
 *
 * Rules enforced here:
 *  - one global scale (already baked into the field map) — no per-section maths
 *  - fixed grids: rows never grow, nothing is ever reflowed or shifted
 *  - single line by default, shrink-to-fit, hard clipped to the cell box
 *  - all text is stamped horizontally (0° rotation)
 *  - image cells are erased (background rect) before the image is drawn, and
 *    the image is contained (never stretched) inside its box
 */
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, degrees, rgb } from "pdf-lib";
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
  /** Number of lines allowed. Defaults to 1 (nowrap). */
  maxLines?: number;
  /** Horizontal clip width. Defaults to the field's cell width. */
  width?: number;
  /** Override the layout box (clip + centring). */
  box?: Box;
  /** Paint a background rectangle over the cell before stamping. */
  erase?: boolean;
  /** Vertically centre inside the box (default true when a box is known). */
  middle?: boolean;
};

export type ImageValue = {
  image: string | null | undefined;
  box: Box;
  opacity?: number;
  /** Erase the placeholder area (tag + any static label) first. Default true. */
  erase?: boolean;
  /** Erase colour, defaults to white. */
  eraseColor?: [number, number, number];
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

/** Minimum readable size before we start clipping instead of shrinking. */
const MIN_SIZE = 4.2;

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

/** Hard truncation for the pathological case (single unbreakable long token). */
function clipToWidth(text: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > width) out = out.slice(0, -1);
  return `${out}…`;
}

function eraseRect(page: PDFPage, box: Box, color: [number, number, number] = [1, 1, 1]) {
  const [l, b, r, t] = box;
  if (r <= l || t <= b) return;
  page.drawRectangle({
    x: l, y: b, width: r - l, height: t - b,
    color: rgb(color[0], color[1], color[2]),
    borderWidth: 0,
  });
}

/** Draw one field's value onto the page. Never grows the row. */
function paintText(page: PDFPage, fonts: Fonts, f: TplField, v: string | TextValue) {
  const tv: TextValue = typeof v === "string" ? { text: v } : v;
  const raw = (tv.text ?? "").toString();
  if (!raw.trim()) return;

  const box: Box | undefined = (tv.box ?? (f.box as Box)) as Box | undefined;
  if (tv.erase && box) eraseRect(page, box);

  const bold = tv.bold ?? f.bold;
  const italic = tv.italic ?? f.italic;
  const font = pick(fonts, bold, italic);
  const color = tv.color ?? (f.color as [number, number, number]) ?? [0, 0, 0];
  const maxLines = Math.max(1, tv.maxLines ?? 1);
  const boxWidth = box ? box[2] - box[0] - 3 : f.maxWidth;
  // An explicit box overrides the template slot width (used to borrow free space).
  const avail = Math.max(6, tv.width ?? (tv.box ? boxWidth : Math.min(f.maxWidth || boxWidth, boxWidth)));

  const boxHeight = box ? box[3] - box[1] : Infinity;

  const startSize = tv.size ?? f.size;
  let size = startSize;
  let lines = maxLines === 1 ? [raw.replace(/\s+/g, " ").trim()] : wrap(raw, font, size, avail);

  // Shrink-to-fit: never wrap beyond maxLines, never expand the row.
  const tooWide = () =>
    maxLines === 1
      ? font.widthOfTextAtSize(lines[0], size) > avail
      : lines.length > maxLines;
  const tooTall = () => (lines.length - 1) * size * 1.12 + size > boxHeight - 1.5;

  while ((tooWide() || tooTall()) && size > MIN_SIZE) {
    size = Math.round((size - 0.25) * 100) / 100;
    if (maxLines > 1) lines = wrap(raw, font, size, avail);
  }
  if (maxLines === 1) lines = [clipToWidth(lines[0], font, size, avail)];
  else if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = clipToWidth(lines[maxLines - 1], font, size, avail);
  }

  const leading = size * 1.12;
  const align = tv.align ?? "left";
  const middle = tv.middle ?? true;

  let baseTop: number;
  if (box && middle) {
    const block = (lines.length - 1) * leading;
    baseTop = (box[1] + box[3]) / 2 + block / 2 - size * 0.34;
  } else {
    baseTop = f.y;
  }

  lines.forEach((line, idx) => {
    const w = font.widthOfTextAtSize(line, size);
    const left = box ? box[0] + 1.5 : f.x;
    const right = box ? box[2] - 1.5 : f.x + avail;
    let x = align === "center" ? (left + right) / 2 - w / 2 : align === "right" ? right - w : left;
    if (x < left) x = left;
    page.drawText(line, {
      x,
      y: baseTop - idx * leading,
      size,
      font,
      color: rgb(color[0], color[1], color[2]),
      rotate: degrees(0),
    });
  });
}

function paintImage(page: PDFPage, img: PDFImage, box: Box, opacity = 1) {
  const [l, b, r, t] = box;
  const bw = r - l;
  const bh = t - b;
  if (bw <= 0 || bh <= 0) return;
  // object-fit: contain — proportional, centred, never stretched.
  const ratio = img.width / img.height;
  let w = bw;
  let h = bw / ratio;
  if (h > bh) { h = bh; w = bh * ratio; }
  page.drawImage(img, { x: l + (bw - w) / 2, y: b + (bh - h) / 2, width: w, height: h, opacity, rotate: degrees(0) });
}

export type FillOptions = Record<string, never>;

/**
 * Loads the immutable template PDF and paints `values` onto it.
 * The grid is locked: no row cloning, no shifting, no page growth.
 */
export async function fillTemplate(
  templateBytes: ArrayBuffer | Uint8Array,
  def: TplDef,
  values: ValueMap,
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

  // Images first (with placeholder erasure) so text always sits on top.
  for (const f of def.fields) {
    const v = values[f.name];
    if (!isImageValue(v)) continue;
    if (v.erase !== false) eraseRect(page, v.box, v.eraseColor ?? [1, 1, 1]);
    if (!v.image) continue;
    const img = await embedImage(doc, v.image);
    if (img) paintImage(page, img, v.box, v.opacity);
  }

  for (const field of def.fields) {
    const v = values[field.name];
    if (v == null || isImageValue(v)) continue;
    if (isTextValue(v)) paintText(page, fonts, field, v);
    else paintText(page, fonts, field, String(v));
  }

  return doc.save();
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
