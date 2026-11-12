import { describe, expect, it } from "vitest";
import { checkNurseryAreas } from "@/lib/nurseryVerification";
const values = { "table.assessment.1.subject": "Language", "table.assessment.1.grade": "A", "table.assessment.1.remark": "Speaks clearly", "table.assessment.2.subject": "Number work", "table.assessment.2.grade": "", "table.assessment.2.remark": "", "table.assessment.3.subject": "Health habits", "table.assessment.3.grade": "B" };
const names = ["learning_area_1", "area_grade_1", "area_comment_1", "learning_area_2", "area_grade_2"];
describe("Nursery learning areas check", () => {
  it("passes an area whose name, grade and comment appear in the output", () => {
    expect(checkNurseryAreas(values, names, {}, "Language A Speaks clearly Number work")[0].status).toBe("Correct");
  });
  it("flags an area missing from the generated output", () => {
    expect(checkNurseryAreas(values, names, {}, "Number work")[0].status).toBe("Missing from output");
  });
  it("separates a missing assessment from a missing template row", () => {
    const r = checkNurseryAreas(values, names, {}, "Language A Speaks clearly Number work");
    expect(r[1].status).toBe("No assessment yet"); expect(r[2].status).toBe("Not on template");
  });
  it("counts positioned tables on scanned designs", () => {
    const map = { tables: [{ id: "t", section: "assessment", page: 1, x: 0, y: 0, width: 100, height: 100, rows: 3, columns: ["subject" as const, "grade" as const] }] };
    expect(checkNurseryAreas(values, [], map, "Language A Speaks clearly Number work Health habits B")[2].status).toBe("Correct");
  });
});
