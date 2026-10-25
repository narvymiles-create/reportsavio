import { describe, expect, it } from "vitest";
import { paginateMarksheet } from "../lib/marksheetPagination";

describe("Primary marksheet pagination", () => {
  it("keeps whole learner rows in order without omission or duplication across pages", () => {
    const pages = paginateMarksheet(Array(53).fill(22), 500, 180);
    expect(pages.map(page => page.rowIndexes.length)).toEqual([22, 22, 9]);
    expect(pages.flatMap(page => page.rowIndexes)).toEqual(Array.from({ length: 53 }, (_, i) => i));
  });
  it("places both summaries only on the last page after all learners", () => {
    const pages = paginateMarksheet(Array(53).fill(22), 500, 180);
    expect(pages.map(page => page.summaries)).toEqual([false, false, true]);
  });
  it("adds a final summary page when summaries cannot fit with the last learners", () => {
    const pages = paginateMarksheet(Array(44).fill(22), 500, 180);
    expect(pages.map(page => page.rowIndexes.length)).toEqual([22, 22, 0]);
    expect(pages.map(page => page.summaries)).toEqual([false, false, true]);
  });
  it("does not add a blank page when rows and summaries fit exactly", () => {
    expect(paginateMarksheet([100, 100], 400, 200)).toEqual([{ rowIndexes: [0, 1], summaries: true }]);
  });
});