/**
 * Skavio EduReports commercial pricing (UGX). Pure functions shared by the
 * browser (display) and edge functions (authoritative amounts) — keep free of
 * runtime-specific APIs so both Deno and Vite can import it.
 */
export const CURRENCY = "UGX";
export const PER_REPORT_CARD_PRICE = 500;
export const ANNUAL_DISCOUNT_PERCENT = 8;
export const CAPACITY_GRACE_PERCENT = 10;
export const CAPACITY_GRACE_DAYS = 30;
export const SUBSCRIPTION_GRACE_DAYS = 7;
/** IntesaPay collection floor (BELOW_MINIMUM_AMOUNT below this). */
export const MIN_GATEWAY_AMOUNT = 500;
export const CREDIT_PACKS = [20, 50, 100] as const;

export type OnlineTierCode = "online_150" | "online_300" | "online_600" | "online_1000" | "online_1500";
export type DesktopTierCode = "desktop_300" | "desktop_600" | "desktop_1200" | "desktop_2000";

export interface OnlineTier { code: OnlineTierCode; label: string; min: number; max: number; perTerm: number }
export interface DesktopTier { code: DesktopTierCode; label: string; min: number; max: number; price: number }

export const ONLINE_TIERS: readonly OnlineTier[] = [
  { code: "online_150", label: "Up to 150 learners", min: 1, max: 150, perTerm: 65_000 },
  { code: "online_300", label: "151–300 learners", min: 151, max: 300, perTerm: 98_000 },
  { code: "online_600", label: "301–600 learners", min: 301, max: 600, perTerm: 163_000 },
  { code: "online_1000", label: "601–1,000 learners", min: 601, max: 1_000, perTerm: 238_000 },
  { code: "online_1500", label: "1,001–1,500 learners", min: 1_001, max: 1_500, perTerm: 325_000 },
];
/** Above this many learners the online edition is a custom quotation. */
export const ONLINE_CUSTOM_ABOVE = 1_500;

export const DESKTOP_TIERS: readonly DesktopTier[] = [
  { code: "desktop_300", label: "Up to 300 learners", min: 1, max: 300, price: 400_000 },
  { code: "desktop_600", label: "301–600 learners", min: 301, max: 600, price: 600_000 },
  { code: "desktop_1200", label: "601–1,200 learners", min: 601, max: 1_200, price: 800_000 },
  { code: "desktop_2000", label: "1,201–2,000 learners", min: 1_201, max: 2_000, price: 1_200_000 },
];
export const DESKTOP_CUSTOM_ABOVE = 2_000;

export const onlineTier = (code: string) => ONLINE_TIERS.find((t) => t.code === code) ?? null;
export const desktopTier = (code: string) => DESKTOP_TIERS.find((t) => t.code === code) ?? null;
export const onlineTierFor = (learners: number) => ONLINE_TIERS.find((t) => learners <= t.max) ?? null;
export const desktopTierFor = (learners: number) => DESKTOP_TIERS.find((t) => learners <= t.max) ?? null;

/** Temporary 10% allowance: 150→165, 300→330, 600→660, 1,000→1,100, 1,500→1,650. Integer maths avoids float drift. */
export function graceLimit(capacity: number, percent: number = CAPACITY_GRACE_PERCENT): number {
  return Math.ceil((capacity * (100 + percent)) / 100);
}

export interface AnnualPrice { normalTotal: number; discount: number; final: number }
export function annualPrice(tier: OnlineTier): AnnualPrice {
  const normalTotal = tier.perTerm * 3;
  const discount = Math.round((normalTotal * ANNUAL_DISCOUNT_PERCENT) / 100);
  return { normalTotal, discount, final: normalTotal - discount };
}

export const creditsAmount = (quantity: number) => quantity * PER_REPORT_CARD_PRICE;

/** Desktop licence upgrades charge only the difference between tiers. */
export function desktopUpgradeAmount(from: DesktopTier, to: DesktopTier): number {
  if (to.max <= from.max) throw new Error("Choose a larger licence than the current one");
  return to.price - from.price;
}

const DAY_MS = 86_400_000;
const toUtc = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
export const diffDays = (laterIso: string, earlierIso: string) => Math.round((toUtc(laterIso) - toUtc(earlierIso)) / DAY_MS);
export const addDays = (iso: string, days: number) => new Date(toUtc(iso) + days * DAY_MS).toISOString().slice(0, 10);
/** Today's date in Kampala (UTC+3, no daylight saving). */
export const kampalaToday = (now: Date = new Date()) => new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

/** Round to the nearest UGX 100 (half up) — the single rounding rule for prorated charges. */
export const roundUgx = (amount: number) => Math.round(amount / 100) * 100;

export interface ProrationQuote {
  fullDifference: number;
  totalDays: number;
  remainingDays: number;
  fraction: number;
  amount: number;
}

/**
 * Prorated online capacity upgrade. Remaining days count today and the closing day.
 * The expiry date never changes; only the price difference for the rest of the period is charged.
 */
export function onlineUpgradeQuote(args: {
  plan: "termly" | "annual";
  from: OnlineTier;
  to: OnlineTier;
  periodStart: string;
  periodEnd: string;
  today: string;
}): ProrationQuote {
  const { plan, from, to, periodStart, periodEnd, today } = args;
  if (to.max <= from.max) throw new Error("Choose a larger package than the current one");
  const fullDifference = plan === "termly" ? to.perTerm - from.perTerm : annualPrice(to).final - annualPrice(from).final;
  const totalDays = diffDays(periodEnd, periodStart) + 1;
  const remainingDays = Math.max(0, Math.min(totalDays, diffDays(periodEnd, today) + 1));
  const fraction = totalDays > 0 ? remainingDays / totalDays : 0;
  const raw = fullDifference * fraction;
  const amount = raw <= 0 ? 0 : Math.max(MIN_GATEWAY_AMOUNT, roundUgx(raw));
  return { fullDifference, totalDays, remainingDays, fraction, amount };
}

export const formatUGX = (amount: number) => `UGX ${Math.round(amount).toLocaleString("en-US")}`;
