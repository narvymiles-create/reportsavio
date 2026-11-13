import { describe, it, expect } from "vitest";
import { templateExamSections } from "@/lib/templateExams";

const fillable = ["learner_name", ...[1, 2].flatMap(i => [`mid_subject_${i}`, `mid_marks_${i}`, `end_subject_${i}`, `end_marks_${i}`])];
const stray = { tables: [{ id: "t", section: "bot", page: 1, x: 40, y: 200, width: 500, height: 160, rows: 8, columns: ["subject", "marks"] as never }] };

describe("template exam availability", () => {
  it("ignores a positioned BOT table on a fillable template with only Mid and End tables", () => {
    expect(templateExamSections(fillable, stray, [])).toEqual(["mid", "eot"]);
  });
  it("keeps positioned tables for fixed/scanned templates without fillable cells", () => {
    expect(templateExamSections([], stray, [])).toEqual(["bot"]);
  });
});
