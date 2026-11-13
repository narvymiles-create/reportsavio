import { describe, expect, it } from "vitest";
import { chooseTemplateTestLearner } from "@/lib/templateTestSelection";
import { DeviceReportDataSource, type DeviceReportStore } from "@/lib/reportDataSource";

const learners = [{ id: "one", school_id: "school", full_name: "Real learner", class_id: "class" }, { id: "two", school_id: "school", full_name: "Second learner", class_id: "class" }];
const terms = [{ id: "term", school_id: "school", name: "Term 1", year: 2026, is_current: true }];
const subjects = [{ id: "math", class_id: "class", school_id: "school" }];
const classes = [{ id: "class", school_id: "school" }];
const mark = { school_id: "school", learner_id: "one", term_id: "term", subject_id: "math", bot: 85, mid: null, eot: null };

describe("Automatic template test selection", () => {
  it("randomly selects among suitable real Primary learners", () => {
    const rows = [mark, { ...mark, learner_id: "two" }];
    expect(chooseTemplateTestLearner("school", "primary", learners, terms, rows, subjects, classes, ["bot"], 2027, () => 0.9).learner.id).toBe("two");
  });
  it("never selects another school's learner, term or assessment", () => {
    const foreign = { ...learners[0], id: "foreign", school_id: "other" };
    const rows = [{ ...mark, learner_id: "foreign", school_id: "other" }, mark];
    expect(chooseTemplateTestLearner("school", "primary", [foreign, ...learners], terms, rows, subjects, classes, ["bot"], undefined, () => 0).learner.id).toBe("one");
    expect(() => chooseTemplateTestLearner("school", "primary", learners, [{ ...terms[0], school_id: "other" }], [mark], subjects, classes, ["bot"])).toThrow("no saved terms");
    expect(() => chooseTemplateTestLearner("school", "primary", learners, terms, [{ ...mark, school_id: "other" }], subjects, classes, ["bot"])).toThrow("saved marks");
  });
  it("requires saved marks in the uploaded template's supported exam sections", () => {
    expect(() => chooseTemplateTestLearner("school", "primary", learners, terms, [mark], subjects, classes, ["eot"])).toThrow("End of Term");
  });
  it("accepts zero marks as actual saved assessment data", () => {
    expect(chooseTemplateTestLearner("school", "primary", learners, terms, [{ ...mark, bot: 0 }], subjects, classes, ["bot"]).learner.id).toBe("one");
  });
  it("uses Nursery grades in this school's configured learning areas", () => {
    const rows = [{ school_id: "school", learner_id: "two", term_id: "term", learning_area_id: "literacy", grade: "A", comment: "Reads well" }];
    expect(chooseTemplateTestLearner("school", "nursery", learners, terms, rows, [{ id: "literacy", school_id: "school" }], classes, []).learner.id).toBe("two");
    expect(() => chooseTemplateTestLearner("school", "nursery", learners, terms, [mark], subjects, classes, [])).toThrow("saved assessment grades");
  });
  it("explains missing learner details and assessment records", () => {
    expect(() => chooseTemplateTestLearner("school", "primary", [], terms, [], subjects, classes, [])).toThrow("No Primary learners");
    expect(() => chooseTemplateTestLearner("school", "primary", [{ ...learners[0], class_id: null }], terms, [], subjects, classes, [])).toThrow("saved name and a valid class");
  });
  it("prefers the most complete available assessment records", () => {
    const rows = [mark, { ...mark, learner_id: "two", mid: 80, eot: 90 }];
    expect(chooseTemplateTestLearner("school", "primary", learners, terms, rows, subjects, classes, [], undefined, () => 0).learner.id).toBe("two");
  });
  it("does not modify supplied learner or assessment records", () => {
    const rows = [Object.freeze(mark)];
    const input = JSON.stringify({ learners, terms, rows });
    chooseTemplateTestLearner("school", "primary", learners, terms, rows, subjects, classes, ["bot"]);
    expect(JSON.stringify({ learners, terms, rows })).toBe(input);
  });
});

describe("Device report data access", () => {
  it("filters device records by school even when a local store returns mixed schools", async () => {
    const store = { rows: async () => [...learners, { ...learners[0], id: "foreign", school_id: "other" }], file: async () => null } as unknown as DeviceReportStore;
    const source = new DeviceReportDataSource("school", store);
    expect((await source.read("learners")).map(l => l.id)).toEqual(["one", "two"]);
    await expect(source.read("learners", { eq: { school_id: "other" } })).rejects.toThrow("current school");
  });
  it("looks up stored files with school context and explains missing offline assets", async () => {
    let scope = "";
    const source = new DeviceReportDataSource("school", { rows: async () => [], file: async school => { scope = school; return null; } });
    await expect(source.fileBytes("report-templates", "template.pdf")).rejects.toThrow("not available on this device");
    expect(scope).toBe("school");
  });
});