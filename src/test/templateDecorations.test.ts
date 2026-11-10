import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { fieldValue } from "@/lib/pdf/template/forms";
import { applyTemplateDecorations } from "@/lib/pdf/template/decorations";

async function blankPdf(withField?: string) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  if (withField) doc.getForm().createTextField(withField).addToPage(page, { x: 50, y: 700, width: 80, height: 80 });
  return doc.save();
}
const contentLength = async (bytes: Uint8Array) => {
  const doc = await PDFDocument.load(bytes);
  const contents = doc.getPages()[0].node.Contents();
  return contents ? String(contents).length : 0;
};

describe("uploaded template data and decorations", () => {
  it("resolves common template labels to the same data as default cards", () => {
    const values = { "learner.full.name": "Aledy", "eot.division": "II", "report.class.teacher.comment": "Good", "term.next.begins.on": "May 4, 2026", "learner.reg.no": "R1" };
    expect(fieldValue("Name", values)).toBe("Aledy");
    expect(fieldValue("Division", values)).toBe("II");
    expect(fieldValue("Class Teacher's Comment", values)).toBe("Good");
    expect(fieldValue("Next Term Begins", values)).toBe("May 4, 2026");
    expect(fieldValue("Admission No", values)).toBe("R1");
    expect(fieldValue("Unknown thing", values)).toBe("");
  });

  it("draws the Settings border only when enabled", async () => {
    const bytes = await blankPdf();
    const without = await applyTemplateDecorations(bytes, { level: "primary", school: {}, assets: {}, border: null });
    const withBorder = await applyTemplateDecorations(bytes, { level: "primary", school: {}, assets: {}, border: "double" });
    expect(await contentLength(withBorder)).toBeGreaterThan(await contentLength(without));
  });

  it("clears image fields so no placeholder text prints", async () => {
    const out = await applyTemplateDecorations(await blankPdf("Learner Photo"), { level: "nursery", school: {}, assets: {}, border: null });
    const doc = await PDFDocument.load(out);
    expect(doc.getForm().getTextField("Learner Photo").getText() ?? "").toBe("");
  });
});
