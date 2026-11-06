import { describe, it, expect } from "vitest";
import { pickPreviewLearner, pickPreviewTerm } from "@/lib/pdf/defaultTemplatePreview";

const term = (id: string, name: string, is_current: boolean, created_at: string) =>
  ({ id, name, is_current, created_at });

describe("pickPreviewTerm", () => {
  it("uses the current term even when a newer term exists", () => {
    const picked = pickPreviewTerm([
      term("t2", "Term 2", false, "2026-05-01"),
      term("t1", "Term 1", true, "2026-01-01"),
    ]);
    expect(picked?.id).toBe("t1");
  });

  it("falls back to the newest term when none is current", () => {
    const picked = pickPreviewTerm([
      term("t1", "Term 1", false, "2026-01-01"),
      term("t3", "Term 3", false, "2026-09-01"),
      term("t2", "Term 2", false, "2026-05-01"),
    ]);
    expect(picked?.id).toBe("t3");
  });

  it("returns null when the school has no terms", () => {
    expect(pickPreviewTerm([])).toBeNull();
  });
});

describe("pickPreviewLearner", () => {
  it("prefers the learner with the most recorded marks", () => {
    const picked = pickPreviewLearner([
      { id: "a", full_name: "Aledy Bullen", marks: 12 },
      { id: "b", full_name: "Zara Omar", marks: 35 },
      { id: "c", full_name: "Mina Kariuki", marks: 7 },
    ]);
    expect(picked?.id).toBe("b");
  });

  it("breaks ties alphabetically so the preview is stable", () => {
    const picked = pickPreviewLearner([
      { id: "a", full_name: "Tom Achieng", marks: 9 },
      { id: "b", full_name: "Ann Wanjiru", marks: 9 },
    ]);
    expect(picked?.full_name).toBe("Ann Wanjiru");
  });

  it("still previews an empty card when no learner has marks", () => {
    const picked = pickPreviewLearner([
      { id: "a", full_name: "Tom Achieng", marks: 0 },
      { id: "b", full_name: "Ann Wanjiru", marks: 0 },
    ]);
    expect(picked?.id).toBe("b");
  });

  it("returns null when there are no learners", () => {
    expect(pickPreviewLearner([])).toBeNull();
  });
});
