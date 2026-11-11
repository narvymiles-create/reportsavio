import { describe, expect, it } from "vitest";
import { canActivateVerification, sourceForField, verifyTemplateFields } from "@/lib/templateVerification";
const empty = { fields: [], values: [], associations: [] };
describe("Pre-activation verification", () => {
  it("matches a learner field with real data", () => {
    const result = verifyTemplateFields("primary", ["Name"], empty, { "learner.full.name": "Actual learner" }, {}, "learner", "term", []);
    expect(result[0].status).toBe("Matched"); expect(result[0].value).toBe("Actual learner");
  });
  it("missing mapped data warns but does not block activation", () => {
    const result = verifyTemplateFields("primary", ["Age"], empty, {}, {}, "learner", "term", []);
    expect(result[0].status).toBe("Missing Data"); expect(canActivateVerification(result)).toBe(true); expect(result[0].value).toBe("");
  });
  it("required unmatched fields block activation", () => {
    const result = verifyTemplateFields("primary", ["Unknown label"], empty, {}, {}, "learner", "term", []);
    expect(result[0].status).toBe("Unmatched Field"); expect(canActivateVerification(result)).toBe(false);
  });
  it("optional unmatched fields remain blank and permit activation", () => {
    const result = verifyTemplateFields("nursery", ["Unknown label"], empty, {}, {}, "learner", "term", [{ field_key: "Unknown label", required: false }]);
    expect(result[0].value).toBe(""); expect(canActivateVerification(result)).toBe(true);
  });
  it("does not claim scanned artwork labels were checked", () => {
    expect(verifyTemplateFields("nursery", [], empty, {}, {}, "learner", "term", [])).toEqual([]);
  });
  it("missing assessments are known sources only for their education level", () => {
    expect(sourceForField("learning_area.1.grade", "nursery")).toBe("learning.area.1.grade");
    expect(sourceForField("learning_area.1.grade", "primary")).toBe(null);
    expect(sourceForField("subject.1.eot.grade", "primary")).toBe("subject.1.eot.grade");
  });
  it("zero marks are available data, not missing", () => {
    expect(verifyTemplateFields("primary", ["subject.1.bot"], empty, { "subject.1.bot": 0 }, {}, "learner", "term", [])[0].status).toBe("Matched");
  });
  it("mapped image fields with absent photos warn", () => {
    expect(verifyTemplateFields("primary", ["photo"], empty, {}, {}, "learner", "term", [])[0].status).toBe("Missing Data");
  });
});