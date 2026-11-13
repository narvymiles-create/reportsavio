import { describe, it, expect } from "vitest";
import { DEFAULT_ASSESSMENT_CONFIG as D, finalMark, validateConfig, reportTables, normaliseConfig, slugAssessmentId, activeAssessments } from "@/lib/assessmentConfig";

const cfg = (o: any) => normaliseConfig({ ...D, ...o });

describe("assessment configuration", () => {
  it("default keeps the existing calculation (average when all three, else EOT)", () => {
    expect(finalMark(D, { bot: 60, mid: 70, eot: 80 })).toBe(70);
    expect(finalMark(D, { eot: 55 })).toBe(55);
    expect(finalMark(D, { bot: 90 })).toBeNull();
  });
  it("End-of-Term only ignores other assessments", () => {
    expect(finalMark(cfg({ method: "eot_only" }), { bot: 10, eot: 80 })).toBe(80);
  });
  it("average uses only the selected assessments, scaled to their max marks", () => {
    const c = cfg({ method: "average", finalIds: ["mid", "eot"], assessments: [...D.assessments.slice(0, 2), { ...D.assessments[2], maxMarks: 50 }] });
    expect(finalMark(c, { bot: 0, mid: 60, eot: 40 })).toBe(70);
  });
  it("weighted average applies administrator percentages", () => {
    const c = cfg({ method: "weighted", finalIds: ["mid", "eot"], assessments: [D.assessments[0], { ...D.assessments[1], weight: 30 }, { ...D.assessments[2], weight: 70 }] });
    expect(validateConfig(c)).toEqual([]);
    expect(finalMark(c, { mid: 50, eot: 100 })).toBe(85);
    expect(finalMark(c, { eot: 100 })).toBeNull();
  });
  it("rejects weights that do not add up to 100", () => {
    const c = cfg({ method: "weighted", finalIds: ["mid", "eot"], assessments: [D.assessments[0], { ...D.assessments[1], weight: 30 }, { ...D.assessments[2], weight: 50 }] });
    expect(validateConfig(c).join()).toMatch(/add up to 100/);
    expect(finalMark(c, { mid: 50, eot: 100 })).toBeNull();
  });
  it("deactivated assessments leave marks entry and report tables", () => {
    const c = cfg({ assessments: [{ ...D.assessments[0], active: false }, D.assessments[1], D.assessments[2]] });
    expect(activeAssessments(c).map(a => a.id)).toEqual(["mid", "eot"]);
    expect(reportTables(c).map(t => t.heading)).toEqual(["Mid-Term", "End of Term"]);
  });
  it("merged arrangement groups assessments in configured tables", () => {
    const c = cfg({ arrangement: "merged", tables: [{ heading: "Term history", assessmentIds: ["bot", "mid", "eot"] }] });
    expect(reportTables(c)).toEqual([{ heading: "Term history", assessmentIds: ["bot", "mid", "eot"] }]);
  });
  it("new assessment ids never collide with existing marks columns", () => {
    expect(slugAssessmentId("Monthly Assessment", ["monthly_assessment"])).toBe("monthly_assessment_2");
    expect(slugAssessmentId("eot", [])).toBe("eot_2");
  });
});
