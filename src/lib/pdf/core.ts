/**
 * pdf-lib drawing core.
 *
 * All public helpers work in millimetres with the origin at the TOP-LEFT of the
 * page (the same mental model as the CSS report sheets), and convert internally
 * to pdf-lib's bottom-left PostScript point space.
 */
import { PDFDocument, PDFFont, PDFPage, PDFImage, StandardFonts, rgb, degrees } from "pdf-lib";

export const MM = 72 / 25.4;
export const A4_W = 210;
export const A4_H = 297;

export const mm = (v: number) => v * MM;

export type RGB = { r: number; g: number; b: number };

export const hexToRgb = (hex: string): RGB => {
  const h = (hex || "#000000").replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full.slice(0, 6) || "000000", 16);
  if (isNaN(n)) return { r: 0, g: 0, b: 0 };
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
};

const col = (c: string | RGB) => {
  const v = typeof c === "string" ? hexToRgb(c) : c;
  return rgb(v.r, v.g, v.b);
};

export const INK = "#111111";
export const FRAME = "#1a2a52";

export type Fonts = {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
};

export async function loadFonts(doc: PDFDocument): Promise<Fonts> {
  const [regular, bold, italic, boldItalic] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.HelveticaOblique),
    doc.embedFont(StandardFonts.HelveticaBoldOblique),
  ]);
  return { regular, bold, italic, boldItalic };
}

export type TextOpts = {
  x: number;
  y: number;              // top of the text line, mm from page top
  size?: number;          // pt
  bold?: boolean;
  italic?: boolean;
  color?: string | RGB;
  align?: "left" | "center" | "right";
  width?: number;         // mm — required for center/right alignment and wrapping
  opacity?: number;
  maxLines?: number;
  lineHeight?: number;    // multiplier
};

/** Convert an on-screen px font-size to a comparable pt size. */
export const pxToPt = (px: number) => px * 0.75;

export class Painter {
  constructor(public page: PDFPage, public fonts: Fonts) {}

  private font(o: { bold?: boolean; italic?: boolean }) {
    if (o.bold && o.italic) return this.fonts.boldItalic;
    if (o.bold) return this.fonts.bold;
    if (o.italic) return this.fonts.italic;
    return this.fonts.regular;
  }

  widthOf(text: string, size: number, o: { bold?: boolean; italic?: boolean } = {}) {
    return this.font(o).widthOfTextAtSize(text ?? "", size) / MM;
  }

  /** Greedy word wrap. Returns lines that fit inside `width` mm. */
  wrap(text: string, size: number, width: number, o: { bold?: boolean; italic?: boolean } = {}): string[] {
    const clean = (text ?? "").replace(/\s+/g, " ").trim();
    if (!clean) return [];
    const words = clean.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (this.widthOf(candidate, size, o) <= width || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /** Draws a single line of text. Returns the line height in mm. */
  text(str: string, opts: TextOpts): number {
    const size = opts.size ?? 8;
    const lh = (opts.lineHeight ?? 1.25) * size / MM;
    if (!str) return lh;
    const f = this.font(opts);
    const w = f.widthOfTextAtSize(str, size) / MM;
    let x = opts.x;
    if (opts.align === "center") x = opts.x + ((opts.width ?? 0) - w) / 2;
    else if (opts.align === "right") x = opts.x + (opts.width ?? 0) - w;
    // Baseline sits at ~80% of the em box below the line top.
    const baselineTop = opts.y + (size * 0.82) / MM;
    this.page.drawText(str, {
      x: mm(x),
      y: mm(A4_H - baselineTop),
      size,
      font: f,
      color: col(opts.color ?? INK),
      opacity: opts.opacity ?? 1,
    });
    return lh;
  }

  /** Draws wrapped text; returns total height used (mm). */
  paragraph(str: string, opts: TextOpts & { width: number }): number {
    const size = opts.size ?? 8;
    const lines = this.wrap(str, size, opts.width, opts);
    const capped = opts.maxLines ? lines.slice(0, opts.maxLines) : lines;
    let y = opts.y;
    for (const l of capped) {
      y += this.text(l, { ...opts, y, align: opts.align ?? "left" });
    }
    return y - opts.y;
  }

  /** Vertically + horizontally centred text inside a box. */
  textInBox(
    str: string,
    box: { x: number; y: number; w: number; h: number },
    opts: Omit<TextOpts, "x" | "y" | "width"> = {},
  ) {
    const size = opts.size ?? 8;
    const lh = (opts.lineHeight ?? 1.15) * size / MM;
    const lines = this.wrap(str, size, box.w - 1.6, opts).slice(0, opts.maxLines ?? 2);
    const total = lines.length * lh;
    let y = box.y + (box.h - total) / 2;
    for (const l of lines) {
      this.text(l, { ...opts, x: box.x + 0.8, y, width: box.w - 1.6, align: opts.align ?? "center" });
      y += lh;
    }
  }

  rect(o: {
    x: number; y: number; w: number; h: number;
    fill?: string | RGB; border?: string | RGB; lineWidth?: number; opacity?: number;
    dashArray?: number[];
  }) {
    this.page.drawRectangle({
      x: mm(o.x),
      y: mm(A4_H - o.y - o.h),
      width: mm(o.w),
      height: mm(o.h),
      color: o.fill ? col(o.fill) : undefined,
      borderColor: o.border ? col(o.border) : undefined,
      borderWidth: o.border ? mm(o.lineWidth ?? 0.25) : 0,
      opacity: o.opacity,
      borderOpacity: o.opacity,
      borderDashArray: o.dashArray?.map(mm),
    });
  }

  line(x1: number, y1: number, x2: number, y2: number, o: { color?: string | RGB; width?: number; dashArray?: number[] } = {}) {
    this.page.drawLine({
      start: { x: mm(x1), y: mm(A4_H - y1) },
      end: { x: mm(x2), y: mm(A4_H - y2) },
      thickness: mm(o.width ?? 0.25),
      color: col(o.color ?? INK),
      dashArray: o.dashArray?.map(mm),
    });
  }

  circle(cx: number, cy: number, r: number, fill: string | RGB) {
    this.page.drawCircle({ x: mm(cx), y: mm(A4_H - cy), size: mm(r), color: col(fill) });
  }

  /** Draws an image scaled to *contain* inside the given box. */
  image(img: PDFImage | null, box: { x: number; y: number; w: number; h: number }, o: { opacity?: number; cover?: boolean } = {}) {
    if (!img) return;
    const ratio = img.width / img.height;
    const boxRatio = box.w / box.h;
    let w = box.w, h = box.h;
    const contain = !o.cover;
    if (contain ? ratio > boxRatio : ratio < boxRatio) { w = box.w; h = box.w / ratio; }
    else { h = box.h; w = box.h * ratio; }
    const x = box.x + (box.w - w) / 2;
    const y = box.y + (box.h - h) / 2;
    this.page.drawImage(img, {
      x: mm(x), y: mm(A4_H - y - h), width: mm(w), height: mm(h), opacity: o.opacity ?? 1,
    });
  }

  rotatedText(str: string, o: TextOpts & { angle: number }) {
    const size = o.size ?? 8;
    this.page.drawText(str, {
      x: mm(o.x), y: mm(A4_H - o.y), size, font: this.font(o),
      color: col(o.color ?? INK), opacity: o.opacity ?? 1, rotate: degrees(o.angle),
    });
  }
}

/* ---------------------------------------------------------------- images */

const imageCache = new Map<string, Promise<Uint8Array | null>>();

async function rasterize(bytes: Uint8Array, mime: string): Promise<Uint8Array | null> {
  // SVG / WEBP / GIF etc. are not supported natively by pdf-lib — repaint them
  // onto a canvas and re-encode as PNG.
  const blob = new Blob([bytes], { type: mime || "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = url;
    });
    if (!img) return null;
    const w = Math.max(1, Math.min(2000, img.naturalWidth || 800));
    const h = Math.max(1, Math.min(2000, img.naturalHeight || 800));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/png");
    const b64 = dataUrl.split(",")[1];
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    if (isPng || isJpg) return buf;
    return await rasterize(buf, res.headers.get("content-type") ?? "");
  } catch {
    return null;
  }
}

/** Fetches (and caches) image bytes, then embeds them in the given document. */
export async function embedImage(doc: PDFDocument, url: string | null | undefined): Promise<PDFImage | null> {
  if (!url) return null;
  let pending = imageCache.get(url);
  if (!pending) {
    pending = fetchImageBytes(url);
    imageCache.set(url, pending);
  }
  const bytes = await pending;
  if (!bytes) return null;
  try {
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    return isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

export function bytesToPdfBlob(bytes: Uint8Array): Blob {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: "application/pdf" });
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(name: string) {
  return (name || "report-card").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 80);
}
