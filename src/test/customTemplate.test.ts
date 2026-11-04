import { describe, expect, it } from "vitest";
import {
  customKey, defaultBox, formatFieldValue, resolveLearnerValue, resolveSchoolValue,
  type CustomField, type FieldMapping,
} from "@/lib/templates";
import { applyCustomValues, mappingsToTplDef } from "@/lib/pdf/customTemplate";

const mapping = (over: Partial<FieldMapping> = {}): FieldMapping => ({
  id: "m1", template_id: "t1", field_key: "learner_name", page: 1,
  x: 100, y: 700, width: 140, height: 18, font_size: 8, align: "left",
  ...over,
});

const field = (over: Partial<CustomField> = {}): CustomField => ({
  id: "f1", template_id: "t1", label: "Attendance", field_type: "percentage",
  description: null, scope: "learner", sort_order: 0,
  ...over,
});

describe("mappingsToTplDef", () => {
  it("converts mappings into engine fields with locked boxes and page numbers", () => {
    const def = mappingsToTplDef({ page_width: 595.28, page_height: 841.89 }, [
      mapping(), mapping({ id: "m2", field_key: "division", page: 2, x: 40, y: 50 }),
    ]);
    expect(def.page).toEqual({ width: 595.28, height: 841.89 });
    expect(def.fields).toHaveLength(2);
    expect(def.fields[0]).toMatchObject({
      name: "learner_name", x: 100, y: 700, size: 8, maxWidth: 140,
      box: [100, 700, 240, 718], page: 1,
    });
    expect(def.fields[1]).toMatchObject({ name: "division", page: 2, box: [40, 50, 180, 68] });
  });
});

describe("formatFieldValue", () => {
  it("appends % to percentages once", () => {
    expect(formatFieldValue("95", "percentage")).toBe("95%");
    expect(formatFieldValue("95%", "percentage")).toBe("95%");
  });
  it("formats dates and leaves other types untouched", () => {
    expect(formatFieldValue("2026-11-03", "date")).toMatch(/2026/);
    expect(formatFieldValue(" 40 ", "number")).toBe("40");
    expect(formatFieldValue("Excellent", "text")).toBe("Excellent");
  });
  it("returns empty for blank values", () => {
    expect(formatFieldValue("  ", "percentage")).toBe("");
  });
});

describe("custom value resolution", () => {
  const rows = [
    { field_id: "f1", learner_id: "L1", term_id: "T1", value: "90" },
    { field_id: "f1", learner_id: "L1", term_id: null, value: "80" },
    { field_id: "f2", learner_id: null, term_id: null, value: "School motto value" },
  ];

  it("prefers the term-specific learner value over the standing value", () => {
    expect(resolveLearnerValue(rows, "f1", "L1", "T1")).toBe("90");
    expect(resolveLearnerValue(rows, "f1", "L1", "T2")).toBe("80");
    expect(resolveLearnerValue(rows, "f1", "L2", "T1")).toBe("");
  });

  it("reads school-wide values centrally", () => {
    expect(resolveSchoolValue(rows, "f2")).toBe("School motto value");
    expect(resolveSchoolValue(rows, "f1")).toBe("");
  });
});

describe("applyCustomValues", () => {
  it("stamps formatted school and learner values under custom keys", () => {
    const values: Record<string, unknown> = {};
    applyCustomValues(
      values as any,
      [field(), field({ id: "f2", scope: "school", field_type: "multiline", label: "Requirements" })],
      [
        { field_id: "f1", learner_id: "L1", term_id: "T1", value: "95" },
        { field_id: "f2", learner_id: null, term_id: null, value: "Bring a ream of paper" },
      ],
      "L1",
      "T1",
    );
    expect(values[customKey("f1")]).toBe("95%");
    expect(values[customKey("f2")]).toEqual({ text: "Bring a ream of paper", maxLines: 4 });
  });
});

describe("defaultBox", () => {
  it("gives images a square box and multiline fields a tall box", () => {
    expect(defaultBox("image")).toEqual({ width: 80, height: 80 });
    expect(defaultBox("multiline").height).toBeGreaterThan(defaultBox("text").height);
  });
});
