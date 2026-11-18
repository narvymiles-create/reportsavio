import { z } from "npm:zod@3.23.8";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  annualPrice, creditsAmount, desktopTier, desktopUpgradeAmount, graceLimit, kampalaToday, addDays, onlineTier, onlineUpgradeQuote,
  MIN_GATEWAY_AMOUNT, formatUGX,
} from "../_shared/billing/pricing.ts";
import { IntesaPayError, normaliseUgandaMsisdn } from "../_shared/billing/intesapay.ts";
import { adminClient, ALLOWED_RETURN_ORIGIN, corsHeaders, getCaller, intesaClient, json, syncPayment, type Caller, type PaymentRow } from "../_shared/billing/server.ts";

const Product = z.enum(["online_term", "online_annual", "online_upgrade", "report_credits", "desktop_licence", "desktop_upgrade", "quote"]);
const CreateBody = z.object({
  action: z.literal("create"),
  product: Product,
  tier: z.string().max(40).optional(),
  academic_year: z.number().int().min(2000).max(2100).optional(),
  term_number: z.number().int().min(1).max(3).optional(),
  subscription_id: z.string().uuid().optional(),
  licence_id: z.string().uuid().optional(),
  quantity: z.number().int().min(1).max(5000).optional(),
  quote_id: z.string().uuid().optional(),
  channel: z.enum(["hosted_checkout", "mobile_money"]),
  msisdn: z.string().max(20).optional(),
  client_request_id: z.string().uuid(),
  return_origin: z.string().max(200).optional(),
});
const Body = z.discriminatedUnion("action", [
  CreateBody,
  z.object({ action: z.literal("verify"), payment_id: z.string().uuid() }),
  z.object({ action: z.literal("upgrade_quote"), subscription_id: z.string().uuid(), tier: z.string().max(40) }),
  z.object({ action: z.literal("refund"), payment_id: z.string().uuid(), amount: z.number().positive() }),
  z.object({ action: z.literal("reconcile") }),
  z.object({ action: z.literal("status") }),
]);

class UserError extends Error { constructor(message: string, public status = 400) { super(message); } }

interface Priced { product: string; amount: number; description: string; details: Record<string, unknown> }

async function settings(admin: SupabaseClient) {
  const { data } = await admin.from("billing_settings").select("*").eq("id", 1).single();
  return data as { subscription_grace_days: number; capacity_grace_percent: number; payment_mode: string };
}

async function calendarTerm(admin: SupabaseClient, year: number, term: number) {
  const { data } = await admin.from("billing_calendar").select("*").eq("academic_year", year).eq("term_number", term).maybeSingle();
  if (!data) throw new UserError(`The academic calendar for Term ${term} ${year} has not been set yet. Please contact Skavio support.`);
  return data as { opens_on: string; closes_on: string };
}

async function activeLearners(admin: SupabaseClient, schoolId: string) {
  const { data, error } = await admin.rpc("billing_active_learner_count", { _school: schoolId });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

async function perReportIssues(admin: SupabaseClient, schoolId: string, year: number, term?: number) {
  let q = admin.from("report_card_issues").select("id", { count: "exact", head: true })
    .eq("school_id", schoolId).eq("academic_year", year).eq("method", "per_report").is("released_at", null);
  if (term) q = q.eq("term_number", term);
  const { count } = await q;
  return count ?? 0;
}

async function existingCoverage(admin: SupabaseClient, schoolId: string, year: number, graceDays: number, today: string, term?: number) {
  const { data } = await admin.from("school_subscriptions").select("id, plan, term_number, expires_on")
    .eq("school_id", schoolId).eq("academic_year", year).eq("status", "active");
  return (data ?? []).filter((s: { plan: string; term_number: number | null; expires_on: string }) =>
    addDays(s.expires_on, graceDays) >= today && (term === undefined || s.plan === "annual" || s.term_number === term));
}

async function priceSubscription(admin: SupabaseClient, schoolId: string, plan: "termly" | "annual", year: number, term: number | undefined,
  capacity: number, grace: number, tierCode: string, tierLabel: string, amount: number, extra: Record<string, unknown> = {}): Promise<Priced> {
  const cfg = await settings(admin);
  const today = kampalaToday();
  const active = await activeLearners(admin, schoolId);
  if (active > grace) throw new UserError(`Your school has ${active} active learners. Choose a package that fits them (this one allows up to ${capacity}).`);
  if (plan === "termly") {
    const cal = await calendarTerm(admin, year, term!);
    if (addDays(cal.closes_on, cfg.subscription_grace_days) < today) throw new UserError(`Term ${term} ${year} has already ended.`);
    if ((await existingCoverage(admin, schoolId, year, cfg.subscription_grace_days, today, term)).length) throw new UserError(`Term ${term} ${year} is already covered by your subscription.`);
    if (await perReportIssues(admin, schoolId, year, term)) throw new UserError(`Term ${term} ${year} is already billed per report card. You can subscribe from the next term.`);
    return {
      product: "online_term", amount, description: `Online subscription — Term ${term} ${year} (${tierLabel})`,
      details: { tier: tierCode, capacity, grace_limit: grace, academic_year: year, term_number: term, starts_on: cal.opens_on, expires_on: cal.closes_on, ...extra },
    };
  }
  const cals = await Promise.all([1, 2, 3].map((t) => calendarTerm(admin, year, t)));
  if (addDays(cals[2].closes_on, cfg.subscription_grace_days) < today) throw new UserError(`The ${year} academic year has already ended.`);
  if ((await existingCoverage(admin, schoolId, year, cfg.subscription_grace_days, today)).length) {
    throw new UserError(`You already have a subscription in ${year}. Renew term by term this year, or choose the annual plan for next year.`);
  }
  if (await perReportIssues(admin, schoolId, year)) throw new UserError(`Part of ${year} is billed per report card. Choose termly subscriptions for the remaining terms.`);
  return {
    product: "online_annual", amount, description: `Online annual subscription — ${year} (${tierLabel})`,
    details: { tier: tierCode, capacity, grace_limit: grace, academic_year: year, starts_on: cals[0].opens_on, expires_on: cals[2].closes_on, ...extra },
  };
}

async function upgradeQuote(admin: SupabaseClient, schoolId: string, subscriptionId: string, toCode: string) {
  const { data: sub } = await admin.from("school_subscriptions").select("*").eq("id", subscriptionId).eq("school_id", schoolId).eq("status", "active").maybeSingle();
  if (!sub) throw new UserError("Subscription not found");
  const today = kampalaToday();
  if (sub.expires_on < today) throw new UserError("This subscription has expired. Renew it instead of upgrading.");
  const from = onlineTier(sub.tier); const to = onlineTier(toCode);
  if (!from || !to) throw new UserError("Custom packages are upgraded through a quotation.");
  const startCal = await calendarTerm(admin, sub.academic_year, sub.plan === "annual" ? 1 : sub.term_number);
  const q = onlineUpgradeQuote({ plan: sub.plan, from, to, periodStart: startCal.opens_on, periodEnd: sub.expires_on, today });
  if (q.amount <= 0) throw new UserError("Nothing to pay for this upgrade.");
  return { sub, from, to, quote: q };
}

async function price(admin: SupabaseClient, caller: Caller, body: z.infer<typeof CreateBody>): Promise<Priced> {
  const schoolId = caller.schoolId!;
  const cfg = await settings(admin);
  switch (body.product) {
    case "online_term":
    case "online_annual": {
      const tier = onlineTier(body.tier ?? "");
      if (!tier) throw new UserError("Choose a package. Schools above 1,500 learners can request a custom quotation.");
      if (!body.academic_year || (body.product === "online_term" && !body.term_number)) throw new UserError("Choose the academic year and term");
      const plan = body.product === "online_term" ? "termly" : "annual";
      const a = annualPrice(tier);
      return priceSubscription(admin, schoolId, plan, body.academic_year, body.term_number, tier.max, graceLimit(tier.max, cfg.capacity_grace_percent),
        tier.code, tier.label, plan === "termly" ? tier.perTerm : a.final, plan === "annual" ? { normal_total: a.normalTotal, discount: a.discount } : { per_term: tier.perTerm });
    }
    case "online_upgrade": {
      if (!body.subscription_id || !body.tier) throw new UserError("Choose the new package");
      const { sub, from, to, quote } = await upgradeQuote(admin, schoolId, body.subscription_id, body.tier);
      return {
        product: "online_upgrade", amount: quote.amount, description: `Capacity upgrade — ${from.label} to ${to.label}`,
        details: { subscription_id: sub.id, plan: sub.plan, from_tier: from.code, to_tier: to.code, from_capacity: sub.capacity, to_capacity: to.max,
          to_grace_limit: graceLimit(to.max, cfg.capacity_grace_percent), full_difference: quote.fullDifference, remaining_days: quote.remainingDays,
          total_days: quote.totalDays, expires_on: sub.expires_on },
      };
    }
    case "report_credits": {
      const qty = body.quantity ?? 0;
      if (qty < 1) throw new UserError("Choose how many learners to buy");
      return { product: "report_credits", amount: creditsAmount(qty), description: `${qty} learner(s) (pay per report card)`, details: { quantity: qty, unit_price: 500 } };
    }
    case "desktop_licence": {
      const tier = desktopTier(body.tier ?? "");
      if (!tier) throw new UserError("Choose a licence. Schools above 2,000 learners can request a custom quotation.");
      const { count } = await admin.from("desktop_licences").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "active");
      if (count) throw new UserError("Your school already owns a desktop licence. Use Upgrade to increase its capacity.");
      return { product: "desktop_licence", amount: tier.price, description: `Desktop lifetime licence — ${tier.label}`,
        details: { tier: tier.code, capacity: tier.max, grace_limit: graceLimit(tier.max, cfg.capacity_grace_percent) } };
    }
    case "desktop_upgrade": {
      const { data: lic } = await admin.from("desktop_licences").select("*").eq("id", body.licence_id ?? "").eq("school_id", schoolId).eq("status", "active").maybeSingle();
      if (!lic) throw new UserError("Licence not found");
      const from = desktopTier(lic.tier); const to = desktopTier(body.tier ?? "");
      if (!from || !to) throw new UserError("Custom licences are upgraded through a quotation.");
      return { product: "desktop_upgrade", amount: desktopUpgradeAmount(from, to), description: `Desktop licence upgrade — ${from.label} to ${to.label}`,
        details: { licence_id: lic.id, from_tier: from.code, to_tier: to.code, from_capacity: lic.capacity, to_capacity: to.max, to_grace_limit: graceLimit(to.max, cfg.capacity_grace_percent) } };
    }
    case "quote": {
      const { data: q } = await admin.from("billing_quotes").select("*").eq("id", body.quote_id ?? "").eq("school_id", schoolId).eq("status", "open").maybeSingle();
      if (!q || !q.amount) throw new UserError("This quotation is not available for payment");
      if (q.valid_until && q.valid_until < kampalaToday()) throw new UserError("This quotation has expired. Please request a new one.");
      const amount = Number(q.amount);
      const cap = q.learner_capacity as number | null;
      const grace = (q.grace_limit as number | null) ?? (cap ? graceLimit(cap, cfg.capacity_grace_percent) : null);
      const extra = { quote_id: q.id };
      if (q.product === "online_term" || q.product === "online_annual") {
        if (!cap || !q.academic_year || (q.product === "online_term" && !q.term_number)) throw new UserError("This quotation is incomplete. Please contact Skavio support.");
        return priceSubscription(admin, schoolId, q.product === "online_term" ? "termly" : "annual", q.academic_year, q.term_number ?? undefined, cap, grace!, "custom", `Custom ${cap} learners`, amount, extra);
      }
      if (q.product === "desktop_licence") {
        if (!cap) throw new UserError("This quotation is incomplete.");
        return { product: "desktop_licence", amount, description: `Desktop lifetime licence — custom ${cap} learners`, details: { tier: "custom", capacity: cap, grace_limit: grace, ...extra } };
      }
      if (q.product === "desktop_upgrade") {
        const { data: lic } = await admin.from("desktop_licences").select("*").eq("school_id", schoolId).eq("status", "active").order("capacity", { ascending: false }).limit(1).maybeSingle();
        if (!lic || !cap) throw new UserError("No desktop licence to upgrade");
        return { product: "desktop_upgrade", amount, description: `Desktop licence upgrade — custom ${cap} learners`,
          details: { licence_id: lic.id, from_tier: lic.tier, to_tier: "custom", from_capacity: lic.capacity, to_capacity: cap, to_grace_limit: grace, ...extra } };
      }
      const qty = q.quantity as number | null;
      if (!qty) throw new UserError("This quotation is incomplete.");
      return { product: "report_credits", amount, description: `${qty} learner(s) (pay per report card, quotation)`, details: { quantity: qty, ...extra } };
    }
  }
  throw new UserError("Unknown product");
}

function reference() {
  const d = kampalaToday().replace(/-/g, "");
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  return `SER-${d}-${rand}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const admin = adminClient();
  try {
    const caller = await getCaller(req, admin);
    if (!caller) return json({ error: "Please sign in again." }, 401);
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "Invalid request", details: parsed.error.flatten().fieldErrors }, 400);
    const body = parsed.data;
    const client = intesaClient();

    if (body.action === "status") {
      const cfg = await settings(admin);
      return json({ configured: !!client, gateway_mode: client?.mode ?? null, platform_mode: cfg.payment_mode });
    }

    if (body.action === "upgrade_quote") {
      if (!caller.isSchoolBillingAdmin || !caller.schoolId) return json({ error: "Only school administrators can manage billing." }, 403);
      const { from, to, quote, sub } = await upgradeQuote(admin, caller.schoolId, body.subscription_id, body.tier);
      return json({ from: from.code, to: to.code, plan: sub.plan, expires_on: sub.expires_on, ...quote });
    }

    if (body.action === "verify") {
      const { data: p } = await admin.from("billing_payments").select("*").eq("id", body.payment_id).maybeSingle();
      if (!p || !(caller.isSuperAdmin || (caller.isSchoolBillingAdmin && p.school_id === caller.schoolId))) return json({ error: "Payment not found" }, 404);
      if (p.status !== "pending" || !client) return json({ status: p.status, payment: p });
      const result = await syncPayment(admin, client, p as PaymentRow);
      const { data: fresh } = await admin.from("billing_payments").select("*").eq("id", p.id).single();
      return json({ status: fresh?.status, result, payment: fresh });
    }

    if (body.action === "refund") {
      if (!caller.isSuperAdmin) return json({ error: "Only platform administrators can refund payments." }, 403);
      if (!client) return json({ error: "Payments are not configured." }, 503);
      const { data: p } = await admin.from("billing_payments").select("*").eq("id", body.payment_id).maybeSingle();
      if (!p || !p.gateway_reference || !["successful", "partially_refunded"].includes(p.status)) return json({ error: "Only successful payments can be refunded." }, 400);
      const remaining = Number(p.amount) - Number(p.refunded_amount);
      if (body.amount > remaining) return json({ error: `At most ${formatUGX(remaining)} can still be refunded.` }, 400);
      await client.refund(p.gateway_reference, body.amount);
      const gp = await client.getPayment(p.gateway_reference);
      await admin.rpc("billing_record_refund", { _payment_id: p.id, _refunded: Number(p.refunded_amount) + body.amount, _status: gp.status });
      return json({ ok: true, gateway_status: gp.status });
    }

    if (body.action === "reconcile") {
      if (!caller.isSuperAdmin) return json({ error: "Only platform administrators can reconcile payments." }, 403);
      if (!client) return json({ error: "Payments are not configured." }, 503);
      const { data: pending } = await admin.from("billing_payments").select("*").eq("status", "pending")
        .lt("created_at", new Date(Date.now() - 60_000).toISOString()).order("created_at").limit(50);
      const results: Record<string, unknown>[] = [];
      for (const p of pending ?? []) {
        try { results.push({ id: p.id, ...(await syncPayment(admin, client, p as PaymentRow)) }); }
        catch (e) { results.push({ id: p.id, error: e instanceof Error ? e.message : String(e) }); }
      }
      return json({ checked: results.length, results });
    }

    // ---- create ----
    if (!caller.schoolId || !caller.isSchoolBillingAdmin) return json({ error: "Only school administrators can make payments." }, 403);
    if (!client) return json({ error: "Online payments are not configured yet. Please contact Skavio support." }, 503);
    const cfg = await settings(admin);
    if (cfg.payment_mode !== client.mode) {
      return json({ error: `Payments are paused: the platform is in ${cfg.payment_mode} mode but the gateway is configured for ${client.mode}.` }, 503);
    }

    const { data: existing } = await admin.from("billing_payments").select("*").eq("school_id", caller.schoolId).eq("client_request_id", body.client_request_id).maybeSingle();
    if (existing) {
      return json({ payment_id: existing.id, reference: existing.reference, status: existing.status, checkout_url: existing.checkout_url, amount: existing.amount, reused: true });
    }

    let msisdn: string | null = null;
    if (body.channel === "mobile_money") {
      msisdn = normaliseUgandaMsisdn(body.msisdn ?? "");
      if (!msisdn) throw new UserError("Enter a valid MTN or Airtel number, e.g. 0772 123456.");
    }
    const priced = await price(admin, caller, body);
    if (priced.amount < MIN_GATEWAY_AMOUNT) throw new UserError(`The minimum payment is ${formatUGX(MIN_GATEWAY_AMOUNT)}.`);

    const ref = reference();
    const { data: inserted, error: insErr } = await admin.from("billing_payments").insert({
      school_id: caller.schoolId, reference: ref, client_request_id: body.client_request_id, product: priced.product,
      description: priced.description, amount: priced.amount, channel: body.channel, msisdn, details: priced.details,
      created_by: caller.userId, mode: client.mode,
    }).select("*").single();
    if (insErr) {
      if (insErr.code === "23505") {
        const { data: again } = await admin.from("billing_payments").select("*").eq("school_id", caller.schoolId).eq("client_request_id", body.client_request_id).single();
        return json({ payment_id: again?.id, reference: again?.reference, status: again?.status, checkout_url: again?.checkout_url, reused: true });
      }
      throw new Error(insErr.message);
    }

    const origin = body.return_origin && ALLOWED_RETURN_ORIGIN.test(body.return_origin) ? body.return_origin : "https://skavioedureports.dev";
    const { data: school } = await admin.from("schools").select("name").eq("id", caller.schoolId).single();
    try {
      if (body.channel === "hosted_checkout") {
        const session = await client.createCheckoutSession({
          reference: ref, amount: priced.amount, description: `${priced.description} [${ref}]`,
          successUrl: `${origin}/billing?payment=${inserted.id}`, cancelUrl: `${origin}/billing?payment=${inserted.id}&cancelled=1`,
          customerEmail: caller.email, customerName: (school as { name?: string } | null)?.name ?? null,
        });
        await admin.from("billing_payments").update({ checkout_session_id: session.id, checkout_url: session.url }).eq("id", inserted.id);
        return json({ payment_id: inserted.id, reference: ref, status: "pending", checkout_url: session.url, amount: priced.amount });
      }
      const gp = await client.collectMobileMoney({ reference: ref, amount: priced.amount, msisdn: msisdn!, description: `${priced.description} [${ref}]`, customerName: (school as { name?: string } | null)?.name ?? null });
      await admin.from("billing_payments").update({ gateway_reference: gp.reference, provider: gp.provider ?? null }).eq("id", inserted.id);
      return json({ payment_id: inserted.id, reference: ref, status: "pending", gateway_status: gp.status, amount: priced.amount });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await admin.from("billing_payments").update({ status: "failed", failure_message: message.slice(0, 500) }).eq("id", inserted.id).eq("status", "pending");
      const friendly = e instanceof IntesaPayError && e.code === "BELOW_MINIMUM_AMOUNT" ? "The amount is below the payment minimum." :
        e instanceof IntesaPayError && e.code === "KYC_REQUIRED" ? "Live payments are not yet enabled for this merchant account." :
        "The payment could not be started. Nothing was charged — please try again.";
      return json({ error: friendly, gateway_error: message }, 502);
    }
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, e.status);
    console.error("billing-payments error", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
