import { supabase } from "@/integrations/supabase/client";

export * from "../../../supabase/functions/_shared/billing/pricing";
export { evaluateCapacity } from "../../../supabase/functions/_shared/billing/capacity";

export type ReportLevel = "primary" | "nursery";

export interface IssueQuote {
  method: "subscription" | "per_report" | "unbilled" | "none";
  requested: number;
  new: number;
  already_issued: number;
  credits_needed: number;
  balance: number;
  enforcement: boolean;
  allowed: boolean;
  reason?: "plan_required" | "not_generated" | "insufficient_credits";
  charged?: number;
  academic_year: number;
  term_number: number;
}

/** Turns database billing errors (e.g. "BILLING_INSUFFICIENT_CREDITS: …") into the readable sentence. */
export function billingErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error ?? "Unknown error");
  return raw.replace(/^BILLING_[A-Z_]+:\s*/, "");
}

export const isBillingError = (error: unknown) => /BILLING_[A-Z_]+/.test(error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error));

export async function quoteReportCards(level: ReportLevel, termId: string, learnerIds: string[]): Promise<IssueQuote> {
  const { data, error } = await supabase.rpc("billing_report_card_quote", { _level: level, _term_id: termId, _learner_ids: learnerIds });
  if (error) throw error;
  return data as unknown as IssueQuote;
}

export async function issueReportCards(level: ReportLevel, termId: string, learnerIds: string[], allowCharge = true): Promise<IssueQuote> {
  const { data, error } = await supabase.rpc("billing_issue_report_cards", { _level: level, _term_id: termId, _learner_ids: learnerIds, _allow_charge: allowCharge });
  if (error) throw error;
  return data as unknown as IssueQuote;
}

export async function releaseReportCards(level: ReportLevel, termId: string, learnerIds: string[]) {
  if (!learnerIds.length) return 0;
  const { data } = await supabase.rpc("billing_release_report_cards", { _level: level, _term_id: termId, _learner_ids: learnerIds });
  return Number(data ?? 0);
}

export function chargeConfirmText(q: IssueQuote): string {
  return `${q.new} new report card(s) will use ${q.credits_needed} report-card credit(s) (UGX ${(q.credits_needed * 500).toLocaleString("en-US")}). `
    + `You have ${q.balance} credit(s). Reprints and downloads of these cards stay free. Continue?`;
}

export function quoteBlockedText(q: IssueQuote): string {
  if (q.reason === "insufficient_credits") return `${q.credits_needed} credit(s) are needed but only ${q.balance} remain. Buy report-card credits in Billing & Subscription.`;
  if (q.reason === "not_generated") return "This report card has not been generated yet. Generate it from the report cards page first.";
  return `No subscription or pay-per-report-card plan covers Term ${q.term_number} of ${q.academic_year}. Choose one in Billing & Subscription.`;
}

/**
 * Makes sure the given learners' report cards are issued (charging credits once, after confirmation),
 * then runs the output. Failed outputs give the credits back.
 */
export async function withIssuedReportCards<T>(level: ReportLevel, termId: string, learnerIds: string[], run: () => Promise<T>, failedIds?: (result: T) => string[]): Promise<T | null> {
  const q = await quoteReportCards(level, termId, learnerIds);
  if (!q.allowed) throw new Error(quoteBlockedText(q));
  if (q.credits_needed > 0 && !window.confirm(chargeConfirmText(q))) return null;
  const issued = await issueReportCards(level, termId, learnerIds, true);
  try {
    const result = await run();
    if (failedIds && (issued.charged ?? 0) > 0) await releaseReportCards(level, termId, failedIds(result));
    return result;
  } catch (e) {
    if ((issued.charged ?? 0) > 0) await releaseReportCards(level, termId, learnerIds);
    throw e;
  }
}

export async function invokeBilling<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("billing-payments", { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") message = (await ctx.json())?.error ?? message;
    } catch { /* keep generic */ }
    throw new Error(message);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

export const PRODUCT_LABELS: Record<string, string> = {
  online_term: "Termly subscription",
  online_annual: "Annual subscription",
  online_upgrade: "Capacity upgrade",
  report_credits: "Report-card credits",
  desktop_licence: "Desktop lifetime licence",
  desktop_upgrade: "Desktop licence upgrade",
};

export const STATUS_LABELS: Record<string, string> = {
  pending: "Pending", successful: "Paid", failed: "Failed", cancelled: "Cancelled", mismatch: "Needs review",
  refunded: "Refunded", partially_refunded: "Partly refunded",
};

export type SubscriptionState = "scheduled" | "active" | "grace" | "expired" | "cancelled";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function subscriptionState(sub: Record<string, any>, today: string, graceDays: number): SubscriptionState {
  if (sub.status === "cancelled") return "cancelled";
  if (today < sub.starts_on) return "scheduled";
  if (today <= sub.expires_on) return "active";
  const graceEnd = new Date(Date.parse(sub.expires_on) + graceDays * 86_400_000).toISOString().slice(0, 10);
  return today <= graceEnd ? "grace" : "expired";
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => cell(r[h])).join(","))].join("\n");
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
