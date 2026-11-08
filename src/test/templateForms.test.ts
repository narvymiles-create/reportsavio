import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { fieldValue, fillTemplate, inspectTemplate } from "@/lib/pdf/template/forms";

async function fixture(fillable = true) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([500, 700]);
  page.drawText("School artwork remains", { x: 30, y: 650, size: 15 });
  if (fillable) {
    const font = await doc.embedFont(StandardFonts.TimesRoman);
    for (const [i, name] of ["learner.full_name", "academic.year", "school.email", "unknown_field"].entries()) {
      const field = doc.getForm().createTextField(name);
      field.setText("Template sample");
      field.addToPage(page, { x: 30, y: 550 - i * 40, width: 220, height: 25, font });
    }
  }
  return doc.save();
}
describe("Optional PDF templates", () => {
  it("keeps non-fillable designs byte-for-byte unchanged", async () => {
    const bytes = await fixture(false);
    expect(await fillTemplate(bytes, { "learner.full.name": "Actual learner" })).toBe(bytes);
  });
  it("fills actual learner and current year values and blanks missing or unsupported names", async () => {
    const doc = await PDFDocument.load(await fillTemplate(await fixture(), { "learner.full.name": "Actual learner", "academic.year": 2026 }));
    expect(doc.getForm().getTextField("learner.full_name").getText()).toBe("Actual learner");
    expect(doc.getForm().getTextField("academic.year").getText()).toBe("2026");
    expect(doc.getForm().getTextField("school.email").getText() ?? "").toBe("");
    expect(doc.getForm().getTextField("unknown_field").getText() ?? "").toBe("");
    expect(doc.getPage(0).getSize()).toEqual({ width: 500, height: 700 });
  });
  it("reports supported fields without assigning a class or term", async () => {
    const info = await inspectTemplate(await fixture());
    expect(info.fieldNames).toContain("learner.full_name");
    expect(info.pageCount).toBe(1);
  });
  it("retains zero values rather than substituting a missing value", () => {
    expect(fieldValue("bot.total", { "bot.total": 0 })).toBe("0");
  });
  it("rejects a non-PDF upload", async () => {
    await expect(inspectTemplate(new TextEncoder().encode("not a pdf"))).rejects.toThrow("valid PDF");
  });
});