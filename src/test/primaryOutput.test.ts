import { Blob as NodeBlob } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generatePrimaryOutput, validatePrimaryPdf } from "@/lib/pdf/primaryOutput";
import { renderPrimaryBytes, type PrimaryData } from "@/lib/pdf/primaryReport";

const generator = vi.hoisted(() => vi.fn());
vi.mock("@/lib/pdfGenerator", () => ({ generateReportCardBlob: generator }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const fixture: PrimaryData = {
  learner: { id: "one", full_name: "TEST LEARNER", age: 10, sex: "F", lin_no: "LIN001" },
  term: { name: "Term 2", year: 2026 },
  report: { class_teacher_comment: "Good progress.", head_teacher_comment: "Keep working hard." },
  school: { name: "TEST PRIMARY SCHOOL", motto: "Learning together" },
  klass: { name: "PRIMARY FOUR" }, stream: null, classTeacher: null,
  bands: [{ grade: "D1", points: 1, min_mark: 90, max_mark: 100, remark: "Excellent" }],
  subjects: [{ id: "english", name: "English", is_core: true }],
  marks: [{ subject_id: "english", bot: 90, mid: 92, eot: 94 }],
  classSubjects: [], classMarks: [], classSize: 1, teachersById: {},
  flags: { stream: true, house: true, section: true, pay_code: true, show_position: true },
  order: [], borderStyle: "double", templateSetting: null,
  assets: { logo: null, headSig: null, classSig: null, photo: null, stamp: null, watermark: null },
} as unknown as PrimaryData;

async function sample(pages = 1, width = 210 * 72 / 25.4) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage([width, 297 * 72 / 25.4]);
  return new Blob([new Uint8Array(await pdf.save()).buffer], { type: "application/pdf" });
}

beforeEach(() => {
  generator.mockReset();
  vi.stubGlobal("Blob", NodeBlob);
});

describe("Primary output page contract", () => {
  it("rejects an empty PDF with an actionable diagnostic", async () => {
    await expect(validatePrimaryPdf(new Blob([]), 1)).rejects.toThrow("PDF is empty");
  });

  it("rejects a non-PDF response instead of displaying a blank preview", async () => {
    await expect(validatePrimaryPdf(new Blob(["<html>Error</html>"]), 1)).rejects.toThrow("not a PDF document");
  });

  it("rejects corrupted PDF bytes with a useful diagnostic", async () => {
    await expect(validatePrimaryPdf(new Blob(["%PDF-invalid"]), 1)).rejects.toThrow("could not be read");
  });
  it("renders the existing Primary engine as exactly one 210 x 297 mm page", async () => {
    const bytes = await renderPrimaryBytes(fixture);
    const pdf = await validatePrimaryPdf(new Blob([new Uint8Array(bytes).buffer]), 1);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getWidth() * 25.4 / 72).toBeCloseTo(210, 6);
    expect(pdf.getPage(0).getHeight() * 25.4 / 72).toBeCloseTo(297, 6);
  });

  it("uses the single download blob unchanged for preview and print", async () => {
    const blob = await sample();
    generator.mockResolvedValue(blob);
    expect(await generatePrimaryOutput(["one"], "term")).toBe(blob);
    expect(generator).toHaveBeenCalledWith("one", "term");
  });

  it("bulk produces exactly one complete A4 page per learner in selected order", async () => {
    generator.mockResolvedValue(await sample());
    const progress = vi.fn();
    const output = await generatePrimaryOutput(["one", "two", "three"], "term", progress);
    const pdf = await validatePrimaryPdf(output, 3);
    expect(pdf.getPageCount()).toBe(3);
    expect(generator.mock.calls).toEqual([["one", "term"], ["two", "term"], ["three", "term"]]);
    expect(progress.mock.calls).toEqual([[1, 3], [2, 3], [3, 3]]);
  });

  it("rejects extra blank pages rather than silently printing them", async () => {
    generator.mockResolvedValue(await sample(2));
    await expect(generatePrimaryOutput(["one"], "term")).rejects.toThrow("Expected 1 report page(s), received 2");
  });

  it("rejects pages that are not A4 portrait", async () => {
    await expect(validatePrimaryPdf(await sample(1, 500), 1)).rejects.toThrow("A4 portrait");
  });

  it("fails bulk output if any learner fails instead of omitting their page", async () => {
    generator.mockResolvedValueOnce(await sample()).mockRejectedValueOnce(new Error("Missing learner"));
    await expect(generatePrimaryOutput(["one", "two"], "term")).rejects.toThrow("Missing learner");
  });
});