import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { UNPAID_WATERMARK_TEXT, watermarkUnpaidPdf } from "@/lib/pdf/unpaidWatermark";

describe("unpaid preview watermark", () => {
  it("uses the exact agreed wording", () => {
    expect(UNPAID_WATERMARK_TEXT).toBe("SKAVIO EDUREPORTS – UNPAID PREVIEW");
  });
  it("stamps every page and keeps the page count and size", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595.28, 841.89]); doc.addPage([595.28, 841.89]);
    const clean = await doc.save();
    const marked = await PDFDocument.load(await watermarkUnpaidPdf(clean));
    expect(marked.getPageCount()).toBe(2);
    expect(marked.getPage(1).getSize()).toEqual({ width: 595.28, height: 841.89 });
    const before = await PDFDocument.load(clean);
    expect((await marked.save()).length).toBeGreaterThan((await before.save()).length);
  });
});
