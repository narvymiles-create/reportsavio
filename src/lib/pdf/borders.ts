/**
 * Vector re-implementation of the /public/borders/*.svg frames.
 *
 * The SVGs use a `0 0 210 297` viewBox, so their coordinates map 1:1 onto our
 * millimetre page space — every path below mirrors the corresponding SVG.
 */
import { Painter, FRAME } from "./core";

const S = FRAME;

function bezier(p: Painter, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, width: number) {
  // Flatten the quadratic curve into short segments.
  const steps = 14;
  let px = x0, py = y0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const it = 1 - t;
    const x = it * it * x0 + 2 * it * t * cx + t * t * x1;
    const y = it * it * y0 + 2 * it * t * cy + t * t * y1;
    p.line(px, py, x, y, { color: S, width });
    px = x; py = y;
  }
}

function poly(p: Painter, pts: [number, number][], width: number) {
  for (let i = 1; i < pts.length; i++) {
    p.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], { color: S, width });
  }
}

export type BorderStyle = "classic" | "double" | "dotted" | "accent" | "corner" | "certificate";

export function drawBorder(p: Painter, style: string | null | undefined) {
  const s = (style ?? "double") as BorderStyle;
  switch (s) {
    case "classic": {
      p.rect({ x: 5, y: 5, w: 200, h: 287, border: S, lineWidth: 1.5 });
      [[5, 5], [205, 5], [5, 292], [205, 292]].forEach(([x, y]) => p.circle(x, y, 2, S));
      [[105, 5], [105, 292], [5, 148.5], [205, 148.5]].forEach(([x, y]) => p.circle(x, y, 1.5, S));
      break;
    }
    case "dotted": {
      p.rect({ x: 4, y: 4, w: 202, h: 289, border: S, lineWidth: 1.2 });
      p.rect({ x: 8, y: 8, w: 194, h: 281, border: S, lineWidth: 0.8, dashArray: [2, 2] });
      break;
    }
    case "accent": {
      p.rect({ x: 5, y: 5, w: 200, h: 287, border: S, lineWidth: 0.5 });
      p.rect({ x: 5, y: 20, w: 4, h: 257, fill: S });
      p.rect({ x: 201, y: 20, w: 4, h: 257, fill: S });
      p.line(9, 5, 201, 5, { color: S, width: 1.5 });
      p.line(9, 292, 201, 292, { color: S, width: 1.5 });
      break;
    }
    case "corner": {
      p.rect({ x: 6, y: 6, w: 198, h: 285, border: S, lineWidth: 0.8 });
      poly(p, [[6, 30], [6, 6], [30, 6]], 2.5);
      poly(p, [[10, 26], [10, 10], [26, 10]], 1);
      poly(p, [[180, 6], [204, 6], [204, 30]], 2.5);
      poly(p, [[184, 10], [200, 10], [200, 26]], 1);
      poly(p, [[6, 267], [6, 291], [30, 291]], 2.5);
      poly(p, [[10, 271], [10, 287], [26, 287]], 1);
      poly(p, [[180, 291], [204, 291], [204, 267]], 2.5);
      poly(p, [[184, 287], [200, 287], [200, 271]], 1);
      break;
    }
    case "certificate": {
      p.rect({ x: 4, y: 4, w: 202, h: 289, border: S, lineWidth: 1.5 });
      p.rect({ x: 8, y: 8, w: 194, h: 281, border: S, lineWidth: 0.5 });
      bezier(p, 4, 4, 15, 15, 4, 26, 1);
      bezier(p, 4, 4, 15, 15, 26, 4, 1);
      bezier(p, 206, 4, 195, 15, 206, 26, 1);
      bezier(p, 206, 4, 195, 15, 184, 4, 1);
      bezier(p, 4, 293, 15, 282, 4, 271, 1);
      bezier(p, 4, 293, 15, 282, 26, 293, 1);
      bezier(p, 206, 293, 195, 282, 206, 271, 1);
      bezier(p, 206, 293, 195, 282, 184, 293, 1);
      break;
    }
    case "double":
    default: {
      p.rect({ x: 4, y: 4, w: 202, h: 289, border: S, lineWidth: 1.2 });
      p.rect({ x: 7, y: 7, w: 196, h: 283, border: S, lineWidth: 0.5 });
      break;
    }
  }
}
