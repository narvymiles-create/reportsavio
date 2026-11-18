import { describe, expect, it } from "vitest";
import {
  ONLINE_TIERS, DESKTOP_TIERS, annualPrice, creditsAmount, desktopTier, desktopUpgradeAmount, graceLimit,
  onlineTier, onlineTierFor, desktopTierFor, onlineUpgradeQuote, PER_REPORT_CARD_PRICE, CREDIT_PACKS, recommendPlan,
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

describe("Growth Allowance and Learner packs", () => {
  it("adds a permanent 10% allowance to every package size", () => {
    expect([150, 300, 600, 1000, 1200, 1500, 2000].map((c) => graceLimit(c))).toEqual([165, 330, 660, 1100, 1320, 1650, 2200]);
  });
  it("offers 20, 50, 100 and 200 prepaid Learners", () => {
    expect([...CREDIT_PACKS]).toEqual([20, 50, 100, 200]);
    expect(CREDIT_PACKS.map(creditsAmount)).toEqual([10000, 25000, 50000, 100000]);
  });
});

describe("smart plan recommendation", () => {
  it("recommends pay per report card when few cards are needed", () => {
    const r = recommendPlan({ activeLearners: 120, reportCards: 40 });
    expect(r.recommended).toBe("per_report");
    expect(r.options.find((o) => o.code === "per_report")?.payNow).toBe(20000);
  });
  it("recommends the annual plan when it is cheapest per term", () => {
    // 150 cards = UGX 75,000; termly 65,000; annual 179,400 / 3 = 59,800 per term
    expect(recommendPlan({ activeLearners: 150, reportCards: 150 }).recommended).toBe("annual");
  });
  it("uses the Growth Allowance when choosing the package (160 learners fit the 150 package)", () => {
    expect(recommendPlan({ activeLearners: 160, reportCards: 160 }).options.find((o) => o.code === "termly")?.tier?.code).toBe("online_150");
    expect(recommendPlan({ activeLearners: 166, reportCards: 0 }).options.find((o) => o.code === "termly")?.tier?.code).toBe("online_300");
  });
  it("spends the existing Learners balance first", () => {
    const r = recommendPlan({ activeLearners: 100, reportCards: 30, learnerBalance: 20 });
    expect(r.options.find((o) => o.code === "per_report")?.payNow).toBe(5000);
  });
  it("asks for a custom quote above 1,650 learners and recommends nothing when already covered", () => {
    expect(recommendPlan({ activeLearners: 1651, reportCards: 10 }).customQuote).toBe(true);
    expect(recommendPlan({ activeLearners: 100, reportCards: 100, covered: true }).recommended).toBeNull();
  });
});
