import { describe, expect, it } from "vitest";
import { resolveFeature } from "@/lib/features";

describe("feature switches", () => {
  it("uses the global default when a school has no own setting", () => {
    expect(resolveFeature(false, null)).toBe(false);
    expect(resolveFeature(true, undefined)).toBe(true);
  });
  it("lets the school-specific setting win over the global default", () => {
    expect(resolveFeature(false, true)).toBe(true);
    expect(resolveFeature(true, false)).toBe(false);
  });
  it("keeps unknown features on", () => {
    expect(resolveFeature(undefined, null)).toBe(true);
  });
});
