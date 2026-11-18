import { describe, expect, it } from "vitest";
import { deviceClockWrong, tokenTimes } from "@/lib/clockSkew";

const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (iat: number) => `${b64url({ alg: "HS256" })}.${b64url({ sub: "u", iat, exp: iat + 3600 })}.sig`;
const at = (s: number) => s * 1000;

describe("device clock check", () => {
  const issued = Date.UTC(2026, 10, 18, 16, 15, 48) / 1000;

  it("reads when the token was issued and expires", () => {
    expect(tokenTimes(token(issued))).toEqual({ iat: issued, exp: issued + 3600 });
    expect(tokenTimes("garbage")).toBeNull();
  });

  it("flags the reported case: device clock about a day ahead", () => {
    expect(deviceClockWrong(token(issued), Date.UTC(2026, 10, 19, 17, 0, 58))).toBe(true);
  });

  it("flags a device clock more than five minutes behind", () => {
    expect(deviceClockWrong(token(issued), at(issued - 600))).toBe(true);
  });

  it("accepts a correct clock, including an older stored sign-in", () => {
    expect(deviceClockWrong(token(issued), at(issued + 5))).toBe(false);
    expect(deviceClockWrong(token(issued), at(issued + 3500))).toBe(false);
    expect(deviceClockWrong(token(issued), at(issued - 120))).toBe(false);
    expect(deviceClockWrong(null)).toBe(false);
  });
});
