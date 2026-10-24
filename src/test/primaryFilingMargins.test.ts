import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { applyPrimaryFilingMargins, primaryFilingTransform } from "@/lib/pdf/primaryFilingMargins";

describe("Primary filing margins", () => {
  it.each([
    ["classic", 3, 207],
    ["double", 3.4, 206.6],
    ["dotted", 3.4, 206.6],
    ["accent", 4.75, 205.25],
    ["corner", 4.75, 205.25],
    ["certificate", 3.25, 206.75],
  ] as const)("positions %s's visible border at 18 mm left and 12 mm right", (style, left, right) => {
    const t = primaryFilingTransform(style);
    expect(left * t.scale + t.x).toBeCloseTo(18, 8);
    expect(210 - (right * t.scale + t.x)).toBeCloseTo(12, 8);
    expect(t.scale).toBeLessThan(1);
  });

  it("uniformly transforms artwork while retaining exactly one A4 portrait page", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([210 * 72 / 25.4, 297 * 72 / 25.4]);
    page.drawRectangle({ x: 10, y: 10, width: 100, height: 100 });
    const scale = vi.spyOn(page, "scaleContent");
    const translate = vi.spyOn(page, "translateContent");
    applyPrimaryFilingMargins(page, "double");
    expect(scale).toHaveBeenCalledWith(180 / 203.2, 180 / 203.2);
    expect(translate).toHaveBeenCalledWith(
      (18 - 3.4 * 180 / 203.2) * 72 / 25.4,
      297 * (1 - 180 / 203.2) / 2 * 72 / 25.4,
    );
    const saved = await PDFDocument.load(await doc.save());
    expect(saved.getPageCount()).toBe(1);
    expect(saved.getPage(0).getWidth() * 25.4 / 72).toBeCloseTo(210, 8);
    expect(saved.getPage(0).getHeight() * 25.4 / 72).toBeCloseTo(297, 8);
  });
});