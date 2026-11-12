import { describe, expect, it } from "vitest";
import { templateExamSections } from "@/lib/templateExams";

describe("templateExamSections", () => {
  it("disables Mid-Term when the template only has BOT and EOT tables", () => {
    expect(templateExamSections([], {}, ["Beginning of Term Results", "End of Term Results"])).toEqual(["bot", "eot"]);
  });
  it("includes Mid-Term when the template has a mid term table", () => {
    expect(templateExamSections([], {}, ["Mid Term Examination Results"])).toEqual(["mid"]);
  });
});
