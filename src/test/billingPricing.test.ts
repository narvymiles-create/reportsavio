import { describe, expect, it } from "vitest";
import {
  ONLINE_TIERS, DESKTOP_TIERS, annualPrice, creditsAmount, desktopTier, desktopUpgradeAmount, graceLimit,
  onlineTier, onlineTierFor, desktopTierFor, onlineUpgradeQuote, PER_REPORT_CARD_PRICE,
} from "../../supabase/functions/_shared/billing/pricing";

describe("online subscription prices (UGX)", () => {
  it("charges the agreed termly price per tier", () => {
    expect(ONLINE_TIERS.map((t) => [t.max, t.perTerm])).toEqual([[150, 65000], [300, 98000], [600, 163000], [1000, 238000], [1500, 325000]]);
  });
  it("applies an automatic 8% annual discount", () => {
    expect(ONLINE_TIERS.map((t) => annualPrice(t).final)).toEqual([179400, 270480, 449880, 656880, 897000]);
    expect(annualPrice(onlineTier("online_150")!)).toEqual({ normalTotal: 195000, discount: 15600, final: 179400 });
  });
  it("sends more than 1,500 learners to a custom quotation", () => {
    expect(onlineTierFor(150)?.code).toBe("online_150");
    expect(onlineTierFor(151)?.code).toBe("online_300");
    expect(onlineTierFor(1501)).toBeNull();
  });
});

describe("desktop lifetime licences", () => {
  it("uses the agreed one-time prices", () => {
    expect(DESKTOP_TIERS.map((t) => [t.max, t.price])).toEqual([[300, 400000], [600, 600000], [1200, 800000], [2000, 1200000]]);
    expect(desktopTierFor(2001)).toBeNull();
  });
  it("charges only the difference on upgrade", () => {
    expect(desktopUpgradeAmount(desktopTier("desktop_300")!, desktopTier("desktop_600")!)).toBe(200000);
    expect(desktopUpgradeAmount(desktopTier("desktop_600")!, desktopTier("desktop_1200")!)).toBe(200000);
    expect(desktopUpgradeAmount(desktopTier("desktop_1200")!, desktopTier("desktop_2000")!)).toBe(400000);
    expect(() => desktopUpgradeAmount(desktopTier("desktop_600")!, desktopTier("desktop_300")!)).toThrow();
  });
});

describe("pay per report card", () => {
  it("costs UGX 500 per report card", () => {
    expect(PER_REPORT_CARD_PRICE).toBe(500);
    expect([5, 10, 20, 30, 50, 100, 150, 200].map(creditsAmount)).toEqual([2500, 5000, 10000, 15000, 25000, 50000, 75000, 100000]);
  });
});

describe("capacity grace allowance", () => {
  it("allows a temporary 10% above each package", () => {
    expect([150, 300, 600, 1000, 1500].map((c) => graceLimit(c))).toEqual([165, 330, 660, 1100, 1650]);
  });
});

describe("prorated online upgrades", () => {
  it("charges half the difference when half the term remains (65,000 → 98,000 = 16,500)", () => {
    const q = onlineUpgradeQuote({ plan: "termly", from: onlineTier("online_150")!, to: onlineTier("online_300")!, periodStart: "2026-01-01", periodEnd: "2026-01-10", today: "2026-01-06" });
    expect(q.fullDifference).toBe(33000);
    expect(q.remainingDays).toBe(5);
    expect(q.amount).toBe(16500);
  });
  it("prorates annual upgrades on the discounted annual difference", () => {
    const q = onlineUpgradeQuote({ plan: "annual", from: onlineTier("online_150")!, to: onlineTier("online_300")!, periodStart: "2026-01-01", periodEnd: "2026-12-31", today: "2026-01-01" });
    expect(q.fullDifference).toBe(270480 - 179400);
    expect(q.amount).toBe(91100);
  });
  it("rounds to the nearest UGX 100 and never charges below the gateway minimum", () => {
    const q = onlineUpgradeQuote({ plan: "termly", from: onlineTier("online_150")!, to: onlineTier("online_300")!, periodStart: "2026-01-01", periodEnd: "2026-03-31", today: "2026-03-31" });
    expect(q.remainingDays).toBe(1);
    expect(q.amount).toBe(500);
  });
  it("rejects downgrades", () => {
    expect(() => onlineUpgradeQuote({ plan: "termly", from: onlineTier("online_300")!, to: onlineTier("online_150")!, periodStart: "2026-01-01", periodEnd: "2026-01-10", today: "2026-01-02" })).toThrow();
  });
});
