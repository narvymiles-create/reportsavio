import { describe, expect, it } from "vitest";
import { canAddActiveLearner, evaluateCapacity } from "../../supabase/functions/_shared/billing/capacity";

const base = { licensed: 150, graceLimit: 165, graceDays: 30, now: new Date("2026-03-01T08:00:00Z") };

describe("learner capacity grace", () => {
  it("is within capacity at 150 learners", () => {
    expect(evaluateCapacity({ ...base, activeLearners: 150, overSince: null }).state).toBe("approaching");
    expect(evaluateCapacity({ ...base, activeLearners: 100, overSince: null }).state).toBe("ok");
  });
  it("starts the grace allowance at 151 learners with 30 days remaining", () => {
    const r = evaluateCapacity({ ...base, activeLearners: 151, overSince: null });
    expect(r.state).toBe("grace");
    expect(r.remainingGraceDays).toBe(30);
  });
  it("stays within the temporary allowance at 165 learners", () => {
    expect(evaluateCapacity({ ...base, activeLearners: 165, overSince: "2026-02-20T08:00:00Z" }).state).toBe("grace");
  });
  it("requires an upgrade immediately above 165 learners", () => {
    expect(evaluateCapacity({ ...base, activeLearners: 166, overSince: null }).state).toBe("exceeded");
    expect(canAddActiveLearner({ ...base, activeLearners: 165, overSince: null })).toBe(false);
  });
  it("requires an upgrade after 30 days above 150", () => {
    expect(evaluateCapacity({ ...base, activeLearners: 155, overSince: "2026-01-20T08:00:00Z" }).state).toBe("upgrade_required");
  });
  it("removes the warning when enrolment returns to 150", () => {
    const r = evaluateCapacity({ ...base, activeLearners: 150, overSince: "2026-01-20T08:00:00Z" });
    expect(["ok", "approaching"]).toContain(r.state);
    expect(r.excess).toBe(0);
    expect(r.overSince).toBeNull();
  });
});
