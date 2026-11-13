import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { writeFileSync, mkdirSync } from "node:fs";
import { renderPrimaryBytes, primaryBlocks, computeAll, FINAL_KEY, type PrimaryData } from "@/lib/pdf/primaryReport";
import { DEFAULT_ASSESSMENT_CONFIG as D, normaliseConfig } from "@/lib/assessmentConfig";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const subjects = ["English", "Mathematics", "Science", "Social Studies", "Religious Education", "Kiswahili", "ICT"].map((name, i) => ({ id: `s${i}`, name, is_core: i < 4, max_marks: 100 }));
const monthly = [1, 2, 3, 4].map(i => ({ id: `month_${i}`, name: `Month ${i}`, maxMarks: 100, weight: null, active: true, onReport: true }));
const base = (assessmentConfig: unknown): PrimaryData => ({
  learner: { id: "one", full_name: "TEST LEARNER", age: 10, sex: "F", lin_no: "LIN001" },
  term: { name: "Term 2", year: 2026 }, report: { class_teacher_comment: "Good progress.", head_teacher_comment: "Keep working hard." },
  school: { name: "TEST PRIMARY SCHOOL", motto: "Learning together" }, klass: { name: "P4" }, stream: null, classTeacher: null,
  bands: [{ grade: "D1", points: 1, min_mark: 80, max_mark: 100, remark: "Excellent" }, { grade: "C3", points: 3, min_mark: 0, max_mark: 79.99, remark: "Good" }],
  subjects, marks: subjects.map((s, i) => ({ subject_id: s.id, learner_id: "one", bot: 60 + i, mid: 70 + i, eot: 80 + i, month_1: 50, month_2: 60, month_3: 70, month_4: 80 })),
  classSubjects: subjects, classMarks: [], classSize: 1, teachersById: {},
  flags: { stream: true, house: true, section: true, pay_code: true, show_position: true }, order: [], borderStyle: "double", templateSetting: null,
  assessmentConfig: normaliseConfig(assessmentConfig),
  assets: { logo: null, headSig: null, classSig: null, photo: null, stamp: null, watermark: null },
} as unknown as PrimaryData);

const only = (ids: string[], extra: object = {}) => ({ ...D, ...extra, assessments: D.assessments.map(a => ({ ...a, active: ids.includes(a.id) })) });
const cases: Record<string, unknown> = {
  "1-bot-mid-eot": D,
  "2-bot-eot": only(["bot", "eot"]),
  "3-mid-eot": only(["mid", "eot"]),
  "4-eot-only": only(["eot"], { method: "eot_only" }),
  "5-monthly": { ...D, assessments: [...monthly, D.assessments[2]], method: "average", finalIds: ["month_1", "month_2", "month_3", "month_4", "eot"] },
  "6-separate": { ...D, assessments: [...D.assessments, ...monthly.slice(0, 2)] },
  "7-merged": { ...D, arrangement: "merged", tables: [{ heading: "Assessment history", assessmentIds: ["bot", "mid", "eot"] }] },
  "8-merged-final": { ...D, assessments: [{ ...D.assessments[0], weight: 20 }, { ...D.assessments[1], weight: 30 }, { ...D.assessments[2], weight: 50 }], arrangement: "merged_final", method: "weighted", finalIds: ["bot", "mid", "eot"], tables: [{ heading: "Term history", assessmentIds: ["bot", "mid", "eot"] }] },
};

describe("Primary report tables follow the school's assessment settings", () => {
  it("default keeps Beginning, Mid-Term and the detailed End of Term table", () => {
    expect(primaryBlocks(base(D)).map(b => b.kind)).toEqual(["phase", "phase", "detail"]);
  });
  it("disabled assessments are not drawn", () => {
    expect(primaryBlocks(base(only(["mid", "eot"]))).map(b => b.label)).toEqual(["MID TERM EXAMINATION RESULTS", "END OF TERM EXAMINATION RESULTS"]);
  });
  it("merged with final results adds a final table using the weighted method", () => {
    const d = base(cases["8-merged-final"]);
    expect(primaryBlocks(d).map(b => b.kind)).toEqual(["merged", "detail"]);
    const c = computeAll(d);
    expect(c.bySubject.get("s0")[FINAL_KEY]).toBe(60 * 0.2 + 70 * 0.3 + 80 * 0.5);
  });
  for (const [name, cfg] of Object.entries(cases)) {
    it(`renders ${name} on whole A4 pages`, async () => {
      const bytes = await renderPrimaryBytes(base(cfg));
      const pdf = await PDFDocument.load(new Uint8Array(bytes));
      expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
      if (process.env.DUMP_LAYOUTS) { mkdirSync("/tmp/layouts", { recursive: true }); writeFileSync(`/tmp/layouts/${name}.pdf`, bytes); }
    });
  }
});
