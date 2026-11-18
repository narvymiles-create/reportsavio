import { describe, expect, it } from "vitest";
import { evaluateOfflineLicence, keysFromSeed, signLicence, verifyLicenceToken, type LicencePayload } from "../../supabase/functions/_shared/billing/licence";

const seed = "test-seed-for-licence-signing-0123456789abcdef";
const payload: LicencePayload = {
  v: 1, typ: "device-activation", licenceId: "lic-1", licenceKey: "SER-AAAA-BBBB-CCCC-DDDD", schoolId: "school-1", schoolName: "Test School",
  tier: "desktop_300", capacity: 300, graceLimit: 330, graceDays: 30, version: 1, issuedAt: "2026-01-01T00:00:00Z", deviceId: "device-123", maintenanceUntil: "2026-02-01",
};

describe("desktop lifetime licence certificates", () => {
  it("verifies offline with only the public key", async () => {
    const { privateKey, publicKey } = await keysFromSeed(seed);
    const token = await signLicence(payload, privateKey);
    const res = await verifyLicenceToken(token, publicKey);
    expect(res.valid).toBe(true);
    expect(res.payload?.capacity).toBe(300);
  });
  it("rejects edited capacity or a different signing key", async () => {
    const { privateKey, publicKey } = await keysFromSeed(seed);
    const token = await signLicence(payload, privateKey);
    const [p, body, sig] = token.split(".");
    const tampered = Buffer.from(body, "base64url").toString().replace('"capacity":300', '"capacity":3000');
    expect((await verifyLicenceToken(`${p}.${Buffer.from(tampered).toString("base64url")}.${sig}`, publicKey)).valid).toBe(false);
    const other = await keysFromSeed(seed + "x");
    expect((await verifyLicenceToken(token, other.publicKey)).valid).toBe(false);
  });
  it("keeps working without internet after maintenance ends, and keeps the original licence valid after an upgrade", async () => {
    const { privateKey, publicKey } = await keysFromSeed(seed);
    const v1 = await signLicence(payload, privateKey);
    const v2 = await signLicence({ ...payload, version: 2, tier: "desktop_600", capacity: 600, graceLimit: 660 }, privateKey);
    const later = new Date("2030-06-01T00:00:00Z");
    const r1 = await evaluateOfflineLicence({ token: v1, publicKey, deviceId: "device-123", activeLearners: 250, now: later });
    expect(r1.valid).toBe(true);
    const r2 = await evaluateOfflineLicence({ token: v2, publicKey, deviceId: "device-123", activeLearners: 500, now: later });
    expect(r2.valid).toBe(true);
    expect(r2.capacity?.state).toBe("ok");
  });
  it("binds activation certificates to one computer", async () => {
    const { privateKey, publicKey } = await keysFromSeed(seed);
    const token = await signLicence(payload, privateKey);
    expect((await evaluateOfflineLicence({ token, publicKey, deviceId: "other-device", activeLearners: 10 })).valid).toBe(false);
  });
  it("tracks the 30-day capacity grace locally and ignores clock rollback", async () => {
    const { privateKey, publicKey } = await keysFromSeed(seed);
    const token = await signLicence(payload, privateKey);
    const first = await evaluateOfflineLicence({ token, publicKey, deviceId: "device-123", activeLearners: 310, now: new Date("2026-03-01T00:00:00Z") });
    expect(first.capacity?.state).toBe("grace");
    const rolledBack = await evaluateOfflineLicence({
      token, publicKey, deviceId: "device-123", activeLearners: 310, now: new Date("2026-03-02T00:00:00Z"),
      state: { lastSeenAt: "2026-04-15T00:00:00Z", overSince: first.nextState.overSince },
    });
    expect(rolledBack.clockRollback).toBe(true);
    expect(rolledBack.capacity?.state).toBe("upgrade_required");
  });
});
