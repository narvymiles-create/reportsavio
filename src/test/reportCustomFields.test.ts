import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { resolveSavedValue, validateFieldValue, associationValues, type ReportField, type ReportValue, type ReportAssociation } from "@/lib/reportCustomFields";
import { fillTemplate } from "@/lib/pdf/template/forms";
import { applyCustomPlacements } from "@/lib/pdf/template/customPlacements";

const field: ReportField = { id: "field", school_id: "school", level: "primary", label: "Attendance", field_type: "percentage", scope: "learner", archived: false, created_at: "" };
const value = (overrides: Partial<ReportValue>): ReportValue => ({ id: "value", school_id: "school", level: "primary", definition_id: "field", learner_id: "learner", term_id: null, academic_year: null, value: "80", updated_at: "", ...overrides });
const association: ReportAssociation = { id: "association", school_id: "school", level: "primary", template_id: "template", definition_id: "field", source_key: null, pdf_field: "Attendance", page: 1, x: 30, y: 50, width: 150, height: 25, font_size: 10, align: "left" };

describe("Uploaded template custom fields", () => {
  it("uses the matching learner and academic period, ahead of all-period fallback", () => {
    expect(resolveSavedValue(field, [value({}), value({ id: "specific", academic_year: 2026, term_id: "term", value: "95" }), value({ academic_year: 2025, value: "50" })], "learner", "term", 2026)).toBe("95%");
  });
  it("never uses a different school's or education level's values", () => {
    expect(resolveSavedValue(field, [value({ school_id: "other" }), value({ level: "nursery" })], "learner", "term", 2026)).toBe("");
  });
  it("leaves missing learner values blank rather than borrowing another learner's value", () => {
    expect(resolveSavedValue(field, [value({ learner_id: "someone-else" })], "learner", "term", 2026)).toBe("");
  });
  it("applies school-wide values to every learner", () => {
    expect(resolveSavedValue({ ...field, scope: "school", field_type: "text" }, [value({ learner_id: null, value: "Bring a notebook" })], "any-learner", "term", 2026)).toBe("Bring a notebook");
  });
  it("retains an intentionally blank period override", () => {
    expect(resolveSavedValue(field, [value({}), value({ term_id: "term", value: "" })], "learner", "term", 2026)).toBe("");
  });
  it("accepts percentage endpoints and rejects outside 0–100", () => {
    expect(() => validateFieldValue("percentage", "0")).not.toThrow();
    expect(() => validateFieldValue("percentage", "100")).not.toThrow();
    expect(() => validateFieldValue("percentage", "101")).toThrow();
    expect(() => validateFieldValue("percentage", "-1")).toThrow();
  });
  it("validates real dates and distinguishes multiline text", () => {
    expect(() => validateFieldValue("date", "2026-02-30")).toThrow();
    expect(() => validateFieldValue("date", "2026-02-28")).not.toThrow();
    expect(() => validateFieldValue("text", "first\nsecond")).toThrow();
    expect(() => validateFieldValue("multiline", "first\nsecond")).not.toThrow();
  });
  it("uses existing data without a duplicate custom definition", () => {
    expect(associationValues({ fields: [], values: [], associations: [{ ...association, definition_id: null, source_key: "learner.full.name" }] }, { "learner.full.name": "Real Learner" }, "learner", "term")[0].value).toBe("Real Learner");
  });
  it("fills an associated PDF field while keeping its page artwork and geometry", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 700]);
    const font = await doc.embedFont(StandardFonts.TimesRoman);
    const textField = doc.getForm().createTextField("Attendance");
    textField.addToPage(page, { x: 30, y: 600, width: 150, height: 25, font });
    const filled = await PDFDocument.load(await fillTemplate(await doc.save(), {}, { attendance: "95%" }));
    expect(filled.getForm().getTextField("Attendance").getText()).toBe("95%");
    expect(filled.getPage(0).getSize()).toEqual({ width: 500, height: 700 });
  });
  it("draws static placements without adding pages and rejects clipped placements", async () => {
    const doc = await PDFDocument.create(); doc.addPage([500, 700]);
    const bytes = await doc.save();
    const filled = await applyCustomPlacements(bytes, [{ ...association, pdf_field: null, value: "95%", multiline: false }]);
    expect((await PDFDocument.load(filled)).getPageCount()).toBe(1);
    await expect(applyCustomPlacements(bytes, [{ ...association, pdf_field: null, x: 490, value: "95%", multiline: false }])).rejects.toThrow("outside");
  });
  it("keeps missing placed values byte-for-byte unchanged", async () => {
    const doc = await PDFDocument.create(); doc.addPage(); const bytes = await doc.save();
    expect(await applyCustomPlacmentsFixture(bytes)).toBe(bytes);
  });
});

function applyCustomPlacmentsFixture(bytes: Uint8Array) { return applyCustomPlacements(bytes, [{ ...association, pdf_field: null, value: "", multiline: false }]); }