import { describe, expect, it } from "vitest";
import { canActivateVerification, verifyTemplate } from "@/lib/templateVerification";
import { recogniseField, recogniseHeading, valueKey } from "@/lib/templateSections";
import { recognisedValues } from "@/lib/pdf/customReport";

const primaryValues = {
  "learner.full.name": "Real Learner", "learner.reg.no": "ADM-7", "academic.year": 2026, "term.name": "Term II",
  "table.mid.1.subject": "English", "table.mid.1.marks": 78, "table.mid.1.grade": "D2", "table.mid.1.remark": "Very good",
  "table.mid.2.subject": "Mathematics", "table.mid.2.marks": 0, "table.mid.2.grade": "F9",
  "table.bot.1.subject": "English", "table.bot.1.marks": 60, "table.eot.1.subject": "English", "table.eot.1.marks": 81,
  "table.eot.aggregate": "12", "table.eot.division": "II",
};
describe("Section recognition", () => {
  it("recognises common label variations", () => {
    for (const [label, source] of [["Pupil Name", "learner.full.name"], ["Student Name", "learner.full.name"], ["Admission No.", "learner.reg.no"], ["School Year", "academic.year"], ["Term of Study", "term.name"]])
      expect(recogniseField(label, "primary")).toMatchObject({ kind: "general", source });
  });
  it("recognises complete Primary table headings", () => {
    expect(recogniseHeading("Mid-term Performance Record", "primary")).toBe("mid");
    expect(recogniseHeading("End of Term Examination Results", "primary")).toBe("eot");
    expect(recogniseHeading("Beginning Term Assessment", "primary")).toBe("bot");
    expect(recogniseHeading("School Grading System", "primary")).toBe("grading");
    expect(recogniseHeading("Term Ends On", "primary")).toBe("term.ends");
  });
  it("never puts Primary examinations into Nursery", () => {
    expect(recogniseHeading("Mid Term Examination Results", "nursery")).not.toBe("mid");
    expect(recogniseField("mid_marks_1", "nursery").kind).not.toBe("cell");
  });
  it("puts subject names, marks, grades and remarks in their own columns", () => {
    const template = { level: "primary", field_names: ["mid_subject_1", "mid_marks_1", "mid_grade_1", "mid_remark_1", "mid_subject_2", "mid_marks_2"], section_map: {} };
    expect(recognisedValues(template, primaryValues)).toEqual({ "mid.subject.1": "English", "mid.marks.1": "78", "mid.grade.1": "D2", "mid.remark.1": "Very good", "mid.subject.2": "Mathematics", "mid.marks.2": "0" });
  });
  it("fills all three Primary examination sections and summaries", () => {
    const template = { level: "primary", field_names: ["BOT Marks 1", "Mid Term Marks 1", "End of Term Marks 1", "EOT Aggregate", "EOT Division"], section_map: {} };
    expect(Object.values(recognisedValues(template, primaryValues))).toEqual(["60", "78", "81", "12", "II"]);
  });
  it("asks for the section of a table with no recognisable heading instead of guessing", () => {
    expect(recogniseField("subject_1", "primary").kind).toBe("unassigned");
    expect(recogniseField("subject_1", "primary", { groups: { table: "eot" } })).toMatchObject({ kind: "cell", section: "eot", row: 1, column: "subject" });
  });
  it("fills Nursery learning areas with their ratings and comments", () => {
    expect(valueKey(recogniseField("learning_area_3", "nursery"))).toBe("table.assessment.3.subject");
    expect(valueKey(recogniseField("area_comment_3", "nursery"))).toBe("table.assessment.3.remark");
    expect(valueKey(recogniseField("area_grade_3", "nursery"))).toBe("table.assessment.3.grade");
  });
});
describe("Section verification", () => {
  it("missing learner data warns but does not block activation", () => {
    const r = verifyTemplate("primary", ["Age"], {}, {}, {}, []);
    expect(r[0].status).toBe("Missing Data"); expect(canActivateVerification(r)).toBe(true);
  });
  it("unrecognised labels block until left blank", () => {
    expect(canActivateVerification(verifyTemplate("primary", ["Mystery box"], {}, {}, {}, []))).toBe(false);
    expect(canActivateVerification(verifyTemplate("primary", ["Mystery box"], {}, {}, {}, [{ field_key: "Mystery box", required: false }]))).toBe(true);
  });
  it("zero marks are filled data", () => {
    expect(verifyTemplate("primary", ["mid_marks_2"], {}, primaryValues, {}, [])[0].status).toBe("Filled");
  });
});
