import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normaliseUgandaMsisdn, ugandaNetwork, verifyIntesaSignature } from "../../supabase/functions/_shared/billing/intesapay";

const secret = "whsec_test";
const body = JSON.stringify({ id: "evt_1", type: "payment.successful", data: { reference: "pay_1", amount: "1500.00" } });
const sign = (t: number, raw = body) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;

describe("IntesaPay webhook signatures", () => {
  it("accepts a valid recent signature", async () => {
    const now = 1_800_000_000;
    expect(await verifyIntesaSignature(secret, sign(now), body, now)).toBe(true);
  });
  it("rejects tampered bodies, wrong secrets, stale timestamps and missing headers", async () => {
    const now = 1_800_000_000;
    expect(await verifyIntesaSignature(secret, sign(now), body.replace("1500.00", "9500.00"), now)).toBe(false);
    expect(await verifyIntesaSignature("whsec_other", sign(now), body, now)).toBe(false);
    expect(await verifyIntesaSignature(secret, sign(now - 600), body, now)).toBe(false);
    expect(await verifyIntesaSignature(secret, null, body, now)).toBe(false);
  });
});

describe("Uganda mobile money numbers", () => {
  it("normalises local formats to E.164", () => {
    expect(normaliseUgandaMsisdn("0772 123456")).toBe("+256772123456");
    expect(normaliseUgandaMsisdn("+256 700 000 001")).toBe("+256700000001");
    expect(normaliseUgandaMsisdn("12345")).toBeNull();
  });
  it("labels MTN and Airtel numbers", () => {
    expect(ugandaNetwork("+256772123456")).toBe("MTN");
    expect(ugandaNetwork("+256752123456")).toBe("Airtel");
  });
});
