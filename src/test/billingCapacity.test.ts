import { describe, expect, it } from "vitest";
import { canAddActiveLearner, evaluateCapacity } from "../../supabase/functions/_shared/billing/capacity";

const base = { licensed: 150, graceLimit: 165, now: new Date("2026-03-01T08:00:00Z") };

describe("permanent 10% Growth Allowance", () => {
  it("is within the package at 150 learners", () => {
    expect(evaluateCapacity({ ...base, activeLearners: 150, overSince: null }).state).toBe("approaching");
    expect(evaluateCapacity({ ...base, activeLearners: 100, overSince: null }).state).toBe("ok");
  });
  it("uses the allowance from 151 to 165 learners", () => {
    const r = evaluateCapacity({ ...base, activeLearners: 151, overSince: null });
    expect(r.state).toBe("allowance");
    expect(r.remaining).toBe(14);
  });
  it("never expires, even a year after going above the package", () => {
    expect(evaluateCapacity({ ...base, activeLearners: 165, overSince: "2025-01-01T08:00:00Z" }).state).toBe("allowance");
    expect(canAddActiveLearner({ ...base, activeLearners: 164, overSince: "2025-01-01T08:00:00Z" })).toBe(true);
  });
  it("needs an upgrade only above the allowance (166+)", () => {
    expect(evaluateCapacity({ ...base, activeLearners: 166, overSince: null }).state).toBe("exceeded");
    expect(canAddActiveLearner({ ...base, activeLearners: 165, overSince: null })).toBe(false);
  });
  it("clears the notice when enrolment returns to 150", () => {
    const r = evaluateCapacity({ ...base, activeLearners: 150, overSince: "2026-01-20T08:00:00Z" });
    expect(r.excess).toBe(0);
    expect(r.overSince).toBeNull();
  });
});
