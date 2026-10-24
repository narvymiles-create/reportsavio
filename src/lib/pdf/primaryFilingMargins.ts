import { PDFPage } from "pdf-lib";
import { A4_H, A4_W, mm } from "./core";

// Visible extents include centered strokes and the classic frame's circles.
// Keep these synchronized with borders.ts; Nursery does not use this transform.
const borderExtents: Record<string, [number, number]> = {
  classic: [3, 207],
  double: [3.4, 206.6],
  dotted: [3.4, 206.6],
  accent: [4.75, 205.25],
  corner: [4.75, 205.25],
  certificate: [3.25, 206.75],
};

export function primaryFilingTransform(style: string | null | undefined) {
  const [left, right] = borderExtents[style ?? "double"] ?? borderExtents.double;
  const scale = (A4_W - 18 - 12) / (right - left);
  return {
    scale,
    x: 18 - left * scale,
    y: A4_H * (1 - scale) / 2,
  };
}

/** Reposition the completed vector artwork, without reflow or font substitution. */
export function applyPrimaryFilingMargins(page: PDFPage, style: string | null | undefined) {
  const { scale, x, y } = primaryFilingTransform(style);
  page.scaleContent(scale, scale);
  page.translateContent(mm(x), mm(y));
}