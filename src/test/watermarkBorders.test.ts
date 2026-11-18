import { describe, it, expect, vi } from "vitest";
import { AppearancePainter } from "@/lib/pdf/appearancePainter";

describe("watermarked report cards with custom colours", () => {
  it("fades the cell fill but keeps table outlines fully visible", () => {
    const drawRectangle = vi.fn();
    const page = { drawRectangle } as any;
    const p = new AppearancePainter(page, {} as any, { tableBackground: "#ffffff", tableBorder: "#000000" }, true);
    p.rect({ x: 10, y: 10, w: 20, h: 8, border: "#333333" });
    const call = drawRectangle.mock.calls[0][0];
    expect(call.opacity).toBe(0.18);
    expect(call.borderOpacity ?? 1).toBe(1);
  });
});
