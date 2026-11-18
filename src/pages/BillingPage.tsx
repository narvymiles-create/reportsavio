import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBillingAdmin } from "@/hooks/useBillingAdmin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, CreditCard, Download, Loader2, MonitorDown, Receipt, RefreshCw, ShieldCheck, Ticket, Users } from "lucide-react";
import { CheckoutDialog, type CheckoutRequest } from "@/components/billing/CheckoutDialog";
import {
  ONLINE_TIERS, DESKTOP_TIERS, CREDIT_PACKS, annualPrice, creditsAmount, desktopTier, desktopUpgradeAmount, formatUGX, graceLimit,
  invokeBilling, kampalaToday, onlineTier, PRODUCT_LABELS, STATUS_LABELS, subscriptionState, diffDays, downloadText,
} from "@/lib/billing/api";
import { buildReceiptPdf } from "@/lib/billing/receipt";

type Row = Record<string, any>;

interface BillingData {
  school: { id: string; name: string } | null;
  settings: Row | null;
  calendar: Row[];
  profile: Row | null;
  subscriptions: Row[];
  termBilling: Row[];
  capacity: Row[];
  credits: Row | null;
  ledger: Row[];
  issues: Row[];
  issueCount: number;
  payments: Row[];
  upgrades: Row[];
  licences: Row[];
  devices: Row[];
  quotes: Row[];
  notifications: Row[];
  activeLearners: number;
  gateway: { configured: boolean; gateway_mode: string | null; platform_mode: string } | null;
}

const stateBadge: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  scheduled: { label: "Starts later", variant: "outline" }, active: { label: "Active", variant: "default" },
  grace: { label: "Renewal grace period", variant: "destructive" }, expired: { label: "Expired", variant: "secondary" }, cancelled: { label: "Cancelled", variant: "secondary" },
};

const dateText = (iso?: string | null) => (iso ? new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");

export default function BillingPage() {
  const { schoolId } = useAuth();
  const canManage = useBillingAdmin();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkout, setCheckout] = useState<{ title: string; amount: number; lines: { label: string; value: string }[]; request: CheckoutRequest } | null>(null);
  const today = kampalaToday();

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    await supabase.rpc("billing_refresh_my_capacity");
    const q = <T,>(p: PromiseLike<{ data: T | null }>) => p.then((r) => r.data);
    const [school, settings, calendar, profile, subscriptions, termBilling, capacity, credits, ledger, issues, issueCount, payments, upgrades, licences, devices, quotes, notifications, l1, l2] = await Promise.all([
      q(supabase.from("schools").select("id,name").eq("id", schoolId).maybeSingle()),
      q(supabase.from("billing_settings").select("*").eq("id", 1).maybeSingle()),
      q(supabase.from("billing_calendar").select("*").order("academic_year").order("term_number")),
      q(supabase.from("school_billing_profiles").select("*").eq("school_id", schoolId).maybeSingle()),
      q(supabase.from("school_subscriptions").select("*").eq("school_id", schoolId).order("expires_on", { ascending: false })),
      q(supabase.from("school_term_billing").select("*").eq("school_id", schoolId)),
      q(supabase.from("school_capacity_status").select("*").eq("school_id", schoolId)),
      q(supabase.from("report_credit_accounts").select("*").eq("school_id", schoolId).maybeSingle()),
      q(supabase.from("report_credit_ledger").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(200)),
      q(supabase.from("report_card_issues").select("id,level,learner_id,academic_year,term_number,method,issued_at,released_at").eq("school_id", schoolId).order("issued_at", { ascending: false }).limit(200)),
      supabase.from("report_card_issues").select("id", { count: "exact", head: true }).eq("school_id", schoolId).is("released_at", null).then((r) => r.count ?? 0),
      q(supabase.from("billing_payments").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(200)),
      q(supabase.from("billing_upgrades").select("*").eq("school_id", schoolId).order("created_at", { ascending: false })),
      q(supabase.from("desktop_licences").select("*").eq("school_id", schoolId).order("issued_at", { ascending: false })),
      q(supabase.from("desktop_licence_devices").select("*").eq("school_id", schoolId).order("activated_at", { ascending: false })),
      q(supabase.from("billing_quotes").select("*").eq("school_id", schoolId).order("created_at", { ascending: false })),
      q(supabase.from("billing_notifications").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(30)),
      supabase.from("learners").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "active").then((r) => r.count ?? 0),
      supabase.from("nursery_learners").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "active").then((r) => r.count ?? 0),
    ]);
    let gateway: BillingData["gateway"] = null;
    try { gateway = await invokeBilling({ action: "status" }); } catch { gateway = null; }
    setData({
      school: school as any, settings: settings as any, calendar: (calendar as any) ?? [], profile: profile as any, subscriptions: (subscriptions as any) ?? [],
      termBilling: (termBilling as any) ?? [], capacity: (capacity as any) ?? [], credits: credits as any, ledger: (ledger as any) ?? [], issues: (issues as any) ?? [],
      issueCount: issueCount as number, payments: (payments as any) ?? [], upgrades: (upgrades as any) ?? [], licences: (licences as any) ?? [], devices: (devices as any) ?? [],
      quotes: (quotes as any) ?? [], notifications: (notifications as any) ?? [], activeLearners: (l1 as number) + (l2 as number), gateway,
    });
    setLoading(false);
  }, [schoolId]);

  useEffect(() => { load(); }, [load]);

  // Returning from the IntesaPay checkout page: confirm with the server (never trust the redirect alone).
  useEffect(() => {
    const pid = params.get("payment");
    if (!pid) return;
    let tries = 0; let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const res = await invokeBilling<{ status: string }>({ action: "verify", payment_id: pid });
        if (res.status === "successful") { toast({ title: "Payment confirmed", description: "Your account has been updated." }); finish(); return; }
        if (["failed", "cancelled", "mismatch"].includes(res.status)) { toast({ title: "Payment not completed", description: "Nothing was activated.", variant: "destructive" }); finish(); return; }
      } catch { /* retry */ }
      if (++tries < 30) setTimeout(tick, 4000);
      else { toast({ title: "Still waiting for IntesaPay", description: "Your payment will be applied automatically once confirmed." }); finish(); }
    };
    const finish = () => { stop = true; params.delete("payment"); params.delete("cancelled"); setParams(params, { replace: true }); load(); };
    tick();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const derived = useMemo(() => {
    if (!data) return null;
    const grace = data.settings?.subscription_grace_days ?? 7;
    const subs: Row[] = data.subscriptions.map((s): Row => ({ ...s, state: subscriptionState(s, today, grace) }));
    const current = subs.find((s) => s.state === "active" || s.state === "grace") ?? null;
    const latest = subs[0] ?? null;
    const online = data.capacity.find((c) => c.edition === "online") ?? null;
    const desktop = data.capacity.find((c) => c.edition === "desktop") ?? null;
    const licence = data.licences.find((l) => l.status === "active") ?? null;
    const futureTerms = data.calendar.filter((c) => c.closes_on >= today || diffDays(today, c.closes_on) <= grace);
    const years = Array.from(new Set(futureTerms.map((c) => c.academic_year))).sort();
    const daysLeft = current ? diffDays(current.expires_on, today) : null;
    const balance = data.credits?.balance ?? 0;
    const lowCredits = (data.credits?.purchased ?? 0) > 0 && balance <= (data.settings?.low_credit_threshold ?? 10);
    return { grace, subs, current, latest, online, desktop, licence, futureTerms, years, daysLeft, balance, lowCredits };
  }, [data, today]);

  if (canManage === false) {
    return (
      <Card><CardHeader><CardTitle>Billing & Subscription</CardTitle><CardDescription>Only school administrators can view billing and payments.</CardDescription></CardHeader></Card>
    );
  }
  if (loading || !data || !derived) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const { current, online, desktop, licence, daysLeft, balance, lowCredits } = derived;
  const openCheckout = (title: string, amount: number, request: CheckoutRequest, lines: { label: string; value: string }[] = []) => setCheckout({ title, amount, request, lines });

  const warnings: { title: string; body: string; critical?: boolean }[] = [];
  if (current?.state === "active" && daysLeft !== null && daysLeft <= 14) warnings.push({ title: `Subscription expires in ${daysLeft} day(s)`, body: `Renew before ${dateText(current.expires_on)} to keep generating new report cards.` });
  if (current?.state === "grace") warnings.push({ title: "Subscription in renewal grace period", body: `It expired on ${dateText(current.expires_on)}. Renew within ${derived.grace} days of expiry to avoid interruption.`, critical: true });
  for (const c of [online, desktop].filter(Boolean) as Row[]) {
    const label = c.edition === "online" ? "Online" : "Desktop";
    if (c.state === "approaching") warnings.push({ title: `${label} capacity almost full`, body: `${c.active_learners} of ${c.licensed} learners are active.` });
    if (c.state === "grace") {
      const left = c.grace_ends_at ? Math.max(0, Math.ceil((Date.parse(c.grace_ends_at) - Date.now()) / 86_400_000)) : 0;
      warnings.push({ title: `${label} capacity grace allowance in use`, body: `${c.active_learners} active learners against ${c.licensed} (temporary limit ${c.grace_limit}). ${left} day(s) left to reduce enrolment or upgrade.`, critical: left <= 7 });
    }
    if (c.state === "exceeded" || c.state === "upgrade_required") warnings.push({ title: `${label} package upgrade needed`, body: `${c.active_learners} active learners exceed the ${c.licensed}-learner package${c.state === "exceeded" ? ` and its temporary limit of ${c.grace_limit}` : " after the 30-day grace period"}. Existing learners and records are not affected.`, critical: true });
  }
  if (lowCredits) warnings.push({ title: "Learners are running low", body: `${balance} learner(s) remain.` });

  const gatewayNotice = !data.gateway?.configured
    ? "Online payments are being set up. You can review prices now; payment buttons will work once the payment gateway is connected."
    : data.gateway.gateway_mode === "TEST" ? "Payments are in TEST mode — no real money is collected." : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Billing & Subscription</h1>
          <p className="text-muted-foreground">{data.school?.name} · School ID {data.school?.id.slice(0, 8)}</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      {gatewayNotice && <Alert><ShieldCheck className="h-4 w-4" /><AlertDescription>{gatewayNotice}</AlertDescription></Alert>}
      {warnings.map((w) => (
        <Alert key={w.title} variant={w.critical ? "destructive" : "default"}><AlertTriangle className="h-4 w-4" /><AlertTitle>{w.title}</AlertTitle><AlertDescription>{w.body}</AlertDescription></Alert>
      ))}

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="online">Online plans</TabsTrigger>
          <TabsTrigger value="credits">Pay per report card</TabsTrigger>
          <TabsTrigger value="desktop">Desktop licence</TabsTrigger>
          <TabsTrigger value="payments">Payments & receipts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2"><CardDescription>Current edition & package</CardDescription><CardTitle className="text-lg">{current ? `Online ${current.plan === "annual" ? "annual" : "termly"}` : licence ? "Desktop lifetime" : data.profile?.default_method === "per_report" ? "Pay per report card" : "No plan yet"}</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                {current && <p>{onlineTier(current.tier)?.label ?? `Custom ${current.capacity} learners`}</p>}
                {current && <Badge variant={stateBadge[current.state].variant}>{stateBadge[current.state].label}</Badge>}
                {licence && <p>Desktop: {desktopTier(licence.tier)?.label ?? `${licence.capacity} learners`}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardDescription>Learner capacity</CardDescription><CardTitle className="text-lg flex items-center gap-2"><Users className="h-4 w-4" />{data.activeLearners} active</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                {online ? (<>
                  <Progress value={Math.min(100, (online.active_learners / online.licensed) * 100)} />
                  <p>Licensed {online.licensed} · Temporary limit {online.grace_limit}</p>
                  {online.grace_ends_at && <p>Grace ends {dateText(online.grace_ends_at)}</p>}
                </>) : <p>Capacity applies to subscriptions and desktop licences. Archived, withdrawn and graduated learners never count.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardDescription>Subscription dates</CardDescription><CardTitle className="text-lg">{current ? `${Math.max(0, daysLeft ?? 0)} day(s) left` : "—"}</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                {current ? (<><p>Start {dateText(current.starts_on)}</p><p>Expiry {dateText(current.expires_on)}</p><p>Renew by {dateText(new Date(Date.parse(current.expires_on) + derived.grace * 86_400_000).toISOString())}</p></>) : <p>No active online subscription.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardDescription>Learners</CardDescription><CardTitle className="text-lg">{balance} remaining</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                <p>Purchased {data.credits?.purchased ?? 0} · Used {data.credits?.used ?? 0}</p>
                <p>{data.issueCount} report card(s) generated in total</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Subscription history</CardTitle></CardHeader>
            <CardContent>
              {derived.subs.length === 0 ? <p className="text-sm text-muted-foreground">No subscriptions yet.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Plan</TableHead><TableHead>Period</TableHead><TableHead>Package</TableHead><TableHead>Start</TableHead><TableHead>Expiry</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Paid</TableHead></TableRow></TableHeader>
                  <TableBody>{derived.subs.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="capitalize">{s.plan}</TableCell>
                      <TableCell>{s.plan === "annual" ? s.academic_year : `Term ${s.term_number} ${s.academic_year}`}</TableCell>
                      <TableCell>{onlineTier(s.tier)?.label ?? `Custom ${s.capacity}`}</TableCell>
                      <TableCell>{dateText(s.starts_on)}</TableCell><TableCell>{dateText(s.expires_on)}</TableCell>
                      <TableCell><Badge variant={stateBadge[s.state].variant}>{stateBadge[s.state].label}</Badge></TableCell>
                      <TableCell className="text-right">{formatUGX(Number(s.amount))}</TableCell>
                    </TableRow>))}</TableBody>
                </Table>
              )}
              {data.upgrades.length > 0 && (
                <div className="mt-4 text-sm"><p className="font-medium mb-1">Upgrade history</p>
                  {data.upgrades.map((u) => <p key={u.id} className="text-muted-foreground">{dateText(u.created_at)} — {u.edition === "online" ? "Online" : "Desktop"} {u.from_capacity} → {u.to_capacity} learners ({formatUGX(Number(u.amount))})</p>)}
                </div>
              )}
            </CardContent>
          </Card>

          {data.notifications.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Billing notices</CardTitle></CardHeader>
              <CardContent className="space-y-2">{data.notifications.map((n) => (
                <div key={n.id} className="rounded-md border p-3 text-sm"><div className="flex justify-between gap-2"><span className="font-medium">{n.title}</span><span className="text-xs text-muted-foreground">{dateText(n.created_at)}</span></div><p className="text-muted-foreground">{n.body}</p></div>
              ))}</CardContent>
            </Card>
          )}
          <QuotesCard data={data} onPay={(q) => openCheckout(`Pay quotation`, Number(q.amount), { product: "quote", quote_id: q.id }, [{ label: "Quotation", value: `${q.edition} · ${q.product.replace("_", " ")}` }])} onChanged={load} />
        </TabsContent>

        <TabsContent value="online" className="space-y-4">
          <OnlinePlans data={data} derived={derived} openCheckout={openCheckout} />
        </TabsContent>

        <TabsContent value="credits" className="space-y-4">
          <CreditsTab data={data} derived={derived} openCheckout={openCheckout} onChanged={load} />
        </TabsContent>

        <TabsContent value="desktop" className="space-y-4">
          <DesktopTab data={data} licence={licence} openCheckout={openCheckout} onChanged={load} />
        </TabsContent>

        <TabsContent value="payments">
          <PaymentsTab data={data} />
        </TabsContent>
      </Tabs>

      <CheckoutDialog open={!!checkout} onOpenChange={(o) => !o && setCheckout(null)} title={checkout?.title ?? ""} amount={checkout?.amount ?? 0}
        lines={checkout?.lines} request={checkout?.request ?? null} onSettled={load} />
    </div>
  );
}

type OpenCheckout = (title: string, amount: number, request: CheckoutRequest, lines?: { label: string; value: string }[]) => void;

function OnlinePlans({ data, derived, openCheckout }: { data: BillingData; derived: any; openCheckout: OpenCheckout }) {
  const [year, setYear] = useState<number | null>(derived.years[0] ?? null);
  const [term, setTerm] = useState<number | null>(null);
  const [upgradeTier, setUpgradeTier] = useState<string>("");
  const [upgradeQuote, setUpgradeQuote] = useState<any>(null);
  const terms = derived.futureTerms.filter((c: Row) => c.academic_year === year);
  useEffect(() => { setTerm(terms[0]?.term_number ?? null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [year, data.calendar.length]);
  const current = derived.current as Row | null;
  const perReportTerm = (y: number, t: number) => data.termBilling.find((b) => b.academic_year === y && b.term_number === t && b.method === "per_report");
  const coveredTerm = (y: number, t: number) => derived.subs.some((s: Row) => ["active", "grace", "scheduled"].includes(s.state) && s.academic_year === y && (s.plan === "annual" || s.term_number === t));
  const cal = (t: number) => data.calendar.find((c) => c.academic_year === year && c.term_number === t);

  useEffect(() => {
    setUpgradeQuote(null);
    if (!current || !upgradeTier) return;
    invokeBilling({ action: "upgrade_quote", subscription_id: current.id, tier: upgradeTier }).then(setUpgradeQuote).catch((e) => toast({ title: "Upgrade", description: e.message, variant: "destructive" }));
  }, [current, upgradeTier]);

  return (
    <>
      {!data.calendar.length && <Alert><AlertDescription>The academic calendar has not been published yet, so subscriptions cannot be bought. Skavio will set the term dates shortly.</AlertDescription></Alert>}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Online subscription</CardTitle>
          <CardDescription>Termly plans expire on the term's closing date; annual plans cover all three terms and expire when Term 3 closes. Annual payments get 8% off automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="w-40"><Label>Academic year</Label>
              <Select value={year ? String(year) : ""} onValueChange={(v) => setYear(Number(v))}><SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                <SelectContent>{derived.years.map((y: number) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select></div>
            <div className="w-56"><Label>Term (for termly plans)</Label>
              <Select value={term ? String(term) : ""} onValueChange={(v) => setTerm(Number(v))}><SelectTrigger><SelectValue placeholder="Term" /></SelectTrigger>
                <SelectContent>{terms.map((c: Row) => <SelectItem key={c.term_number} value={String(c.term_number)}>Term {c.term_number} · closes {dateText(c.closes_on)}</SelectItem>)}</SelectContent></Select></div>
          </div>
          {year && term && coveredTerm(year, term) && <p className="text-sm text-muted-foreground">Term {term} {year} is already covered — you will not be charged again for it.</p>}
          {year && term && perReportTerm(year, term) && <p className="text-sm text-muted-foreground">Term {term} {year} uses pay-per-report-card billing.</p>}
          <Table>
            <TableHeader><TableRow><TableHead>Learners</TableHead><TableHead className="text-right">Per term</TableHead><TableHead className="text-right">Annual (normal)</TableHead><TableHead className="text-right">8% discount</TableHead><TableHead className="text-right">Annual price</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {ONLINE_TIERS.map((t) => {
                const a = annualPrice(t);
                const tooSmall = data.activeLearners > graceLimit(t.max);
                const c = term ? cal(term) : null;
                return (
                  <TableRow key={t.code}>
                    <TableCell>{t.label}{tooSmall && <span className="block text-xs text-muted-foreground">Too small for {data.activeLearners} learners</span>}</TableCell>
                    <TableCell className="text-right">{formatUGX(t.perTerm)}</TableCell>
                    <TableCell className="text-right">{formatUGX(a.normalTotal)}</TableCell>
                    <TableCell className="text-right">−{formatUGX(a.discount)}</TableCell>
                    <TableCell className="text-right font-medium">{formatUGX(a.final)}</TableCell>
                    <TableCell className="text-right space-x-2 whitespace-nowrap">
                      <Button size="sm" variant="outline" disabled={tooSmall || !year || !term || coveredTerm(year, term) || !!perReportTerm(year, term)}
                        onClick={() => openCheckout(current ? "Renew subscription" : "Termly subscription", t.perTerm, { product: "online_term", tier: t.code, academic_year: year!, term_number: term! },
                          [{ label: "Package", value: t.label }, { label: "Covers", value: `Term ${term} ${year}` }, { label: "Expires", value: dateText(c?.closes_on) }])}>Pay term</Button>
                      <Button size="sm" disabled={tooSmall || !year}
                        onClick={() => openCheckout("Annual subscription", a.final, { product: "online_annual", tier: t.code, academic_year: year! },
                          [{ label: "Package", value: t.label }, { label: "Covers", value: `Terms 1–3, ${year}` }, { label: "Normal price", value: formatUGX(a.normalTotal) }, { label: "Annual discount (8%)", value: `−${formatUGX(a.discount)}` }])}>Pay year</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow><TableCell>Above 1,500</TableCell><TableCell colSpan={5} className="text-right text-muted-foreground">Custom quotation — request one in Overview</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {current && (
        <Card>
          <CardHeader><CardTitle className="text-base">Upgrade package</CardTitle>
            <CardDescription>Pay only the difference for the rest of the current {current.plan === "annual" ? "year" : "term"}. Your expiry date stays {dateText(current.expires_on)}.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="w-64"><Label>New package</Label>
              <Select value={upgradeTier} onValueChange={setUpgradeTier}><SelectTrigger><SelectValue placeholder="Choose a larger package" /></SelectTrigger>
                <SelectContent>{ONLINE_TIERS.filter((t) => t.max > current.capacity).map((t) => <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>)}</SelectContent></Select></div>
            {upgradeQuote && (
              <div className="rounded-md border p-3 text-sm space-y-1">
                <p>Full {current.plan === "annual" ? "annual" : "term"} difference: {formatUGX(upgradeQuote.fullDifference)}</p>
                <p>Remaining: {upgradeQuote.remainingDays} of {upgradeQuote.totalDays} days ({Math.round(upgradeQuote.fraction * 100)}%)</p>
                <p className="font-medium">Upgrade charge: {formatUGX(upgradeQuote.amount)} <span className="text-muted-foreground font-normal">(rounded to the nearest UGX 100)</span></p>
                <Button size="sm" className="mt-2" onClick={() => openCheckout("Upgrade package", upgradeQuote.amount, { product: "online_upgrade", subscription_id: current.id, tier: upgradeTier },
                  [{ label: "From", value: onlineTier(current.tier)?.label ?? `${current.capacity} learners` }, { label: "To", value: onlineTier(upgradeTier)?.label ?? "" },
                    { label: "Full difference", value: formatUGX(upgradeQuote.fullDifference) }, { label: "Remaining period", value: `${upgradeQuote.remainingDays}/${upgradeQuote.totalDays} days` }])}>Upgrade</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function CreditsTab({ data, derived, openCheckout, onChanged }: { data: BillingData; derived: any; openCheckout: OpenCheckout; onChanged: () => void }) {
  const [custom, setCustom] = useState("30");
  const [saving, setSaving] = useState(false);
  const usePerReport = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("billing_set_default_method", { _method: "per_report" });
    setSaving(false);
    if (error) return toast({ title: "Could not update", description: error.message, variant: "destructive" });
    toast({ title: "Pay per report card selected", description: "Terms without a subscription will use prepaid learners." });
    onChanged();
  };
  const buy = (qty: number) => openCheckout(`${qty} learners`, creditsAmount(qty), { product: "report_credits", quantity: qty }, [{ label: "Learners", value: String(qty) }, { label: "Price each", value: "UGX 500" }]);
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Ticket className="h-4 w-4" />UGX 500 per report card</CardTitle>
          <CardDescription>For schools that prefer not to subscribe. One learner is used the first time a learner's report card is generated for a term. Reprints, downloads and regenerating after corrections are free. A term is billed either by subscription or per report card — never both.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {data.profile?.default_method === "per_report" ? <Badge>Pay per report card is your default for unsubscribed terms</Badge> :
              <Button variant="outline" onClick={usePerReport} disabled={saving}>Use pay per report card for unsubscribed terms</Button>}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Purchased</p><p className="text-xl font-semibold">{data.credits?.purchased ?? 0}</p></div>
            <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Used</p><p className="text-xl font-semibold">{data.credits?.used ?? 0}</p></div>
            <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Remaining</p><p className="text-xl font-semibold">{derived.balance}</p></div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {CREDIT_PACKS.map((n) => <Button key={n} onClick={() => buy(n)}><CreditCard className="mr-2 h-4 w-4" />{n} Learners · {formatUGX(creditsAmount(n))}</Button>)}
            <div className="flex items-end gap-2">
              <div className="w-28"><Label htmlFor="custom-credits">Custom</Label><Input id="custom-credits" type="number" min={1} max={5000} value={custom} onChange={(e) => setCustom(e.target.value)} /></div>
              <Button variant="outline" disabled={!(Number(custom) >= 1 && Number(custom) <= 5000)} onClick={() => buy(Math.floor(Number(custom)))}>Buy {formatUGX(creditsAmount(Math.max(0, Math.floor(Number(custom) || 0))))}</Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Learner transactions</CardTitle></CardHeader>
          <CardContent className="max-h-96 overflow-auto">
            {data.ledger.length === 0 ? <p className="text-sm text-muted-foreground">No transactions yet.</p> : (
              <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Learners</TableHead></TableRow></TableHeader>
                <TableBody>{data.ledger.map((l) => <TableRow key={l.id}><TableCell>{dateText(l.created_at)}</TableCell><TableCell className="capitalize">{l.kind === "release" ? "Returned (generation failed)" : l.kind}</TableCell><TableCell className="text-right">{l.delta > 0 ? `+${l.delta}` : l.delta}</TableCell></TableRow>)}</TableBody></Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Report cards generated</CardTitle><CardDescription>{data.issueCount} in total (latest 200 shown)</CardDescription></CardHeader>
          <CardContent className="max-h-96 overflow-auto">
            {data.issues.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : (
              <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Level</TableHead><TableHead>Period</TableHead><TableHead>Billing</TableHead></TableRow></TableHeader>
                <TableBody>{data.issues.map((i) => <TableRow key={i.id} className={i.released_at ? "opacity-50" : ""}><TableCell>{dateText(i.issued_at)}</TableCell><TableCell className="capitalize">{i.level}</TableCell><TableCell>{i.term_number ? `Term ${i.term_number} ${i.academic_year}` : i.academic_year}</TableCell><TableCell>{({ subscription: "Subscription", per_report: "1 learner", unbilled: "Free (setup period)", legacy: "Before billing" } as Record<string, string>)[i.method]}{i.released_at ? " · returned" : ""}</TableCell></TableRow>)}</TableBody></Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function DesktopTab({ data, licence, openCheckout, onChanged }: { data: BillingData; licence: Row | null; openCheckout: OpenCheckout; onChanged: () => void }) {
  const devices = data.devices.filter((d) => licence && d.licence_id === licence.id);
  const downloadLicence = async () => {
    try {
      const { data: res, error } = await supabase.functions.invoke("desktop-licence", { body: { action: "certificate", licence_id: licence!.id } });
      if (error || !res?.certificate) throw new Error(error?.message ?? "Certificate unavailable");
      downloadText(`skavio-licence-${licence!.licence_key}.serlicence`, JSON.stringify({ licence_key: licence!.licence_key, certificate: res.certificate, public_key: res.public_key }, null, 2), "application/json");
    } catch (e) { toast({ title: "Download failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }); }
  };
  const deactivate = async (deviceId: string) => {
    if (!window.confirm("Deactivate this computer? The licence can then be activated on another computer.")) return;
    const { error } = await supabase.functions.invoke("desktop-licence", { body: { action: "deactivate", device_id: deviceId } });
    if (error) return toast({ title: "Could not deactivate", description: error.message, variant: "destructive" });
    toast({ title: "Computer deactivated" }); onChanged();
  };
  const from = licence ? desktopTier(licence.tier) : null;
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><MonitorDown className="h-4 w-4" />Desktop Edition — lifetime licence</CardTitle>
          <CardDescription>Pay once and keep using your licensed edition indefinitely, offline, within its learner capacity. No compulsory renewals; optional maintenance (updates and support) is offered separately.</CardDescription>
        </CardHeader>
        <CardContent>
          {licence ? (
            <div className="space-y-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <p><span className="text-muted-foreground">Licence key:</span> <span className="font-mono">{licence.licence_key}</span></p>
                <p><span className="text-muted-foreground">Capacity:</span> {licence.capacity} learners (temporary limit {licence.grace_limit})</p>
                <p><span className="text-muted-foreground">Issued:</span> {dateText(licence.issued_at)} · version {licence.version}</p>
                <p><span className="text-muted-foreground">Maintenance:</span> {licence.maintenance_until ? `until ${dateText(licence.maintenance_until)}` : "not purchased (optional)"}</p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadLicence}><Download className="mr-2 h-4 w-4" />Download licence file</Button>
              <div><p className="font-medium mb-1">Activated computers ({devices.filter((d) => !d.deactivated_at).length} of {licence.max_devices})</p>
                {devices.length === 0 ? <p className="text-muted-foreground">Not activated yet. Enter the licence key in the desktop app when it is connected to the internet once.</p> :
                  devices.map((d) => (
                    <div key={d.id} className="flex items-center justify-between border-b py-1">
                      <span>{d.device_name ?? "Computer"} · activated {dateText(d.activated_at)}{d.deactivated_at ? ` · deactivated ${dateText(d.deactivated_at)}` : ""}</span>
                      {!d.deactivated_at && <Button size="sm" variant="ghost" onClick={() => deactivate(d.id)}>Deactivate / transfer</Button>}
                    </div>))}
              </div>
              {from && (
                <div><p className="font-medium mb-1">Upgrade capacity (pay only the difference)</p>
                  <div className="flex flex-wrap gap-2">{DESKTOP_TIERS.filter((t) => t.max > from.max).map((t) => (
                    <Button key={t.code} size="sm" variant="outline" onClick={() => openCheckout("Desktop licence upgrade", desktopUpgradeAmount(from, t), { product: "desktop_upgrade", licence_id: licence.id, tier: t.code },
                      [{ label: "Current", value: `${from.label} (${formatUGX(from.price)})` }, { label: "New", value: `${t.label} (${formatUGX(t.price)})` }])}>
                      {t.label} · {formatUGX(desktopUpgradeAmount(from, t))}</Button>))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Your existing licence stays valid; a new signed licence with the larger capacity is issued after payment.</p>
                </div>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Learner capacity</TableHead><TableHead className="text-right">One-time licence</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {DESKTOP_TIERS.map((t) => (
                  <TableRow key={t.code}><TableCell>{t.label}</TableCell><TableCell className="text-right">{formatUGX(t.price)}</TableCell>
                    <TableCell className="text-right"><Button size="sm" disabled={data.activeLearners > graceLimit(t.max)} onClick={() => openCheckout("Desktop lifetime licence", t.price, { product: "desktop_licence", tier: t.code }, [{ label: "Capacity", value: t.label }, { label: "Type", value: "Lifetime, one-time payment" }])}>Buy</Button></TableCell></TableRow>
                ))}
                <TableRow><TableCell>Above 2,000</TableCell><TableCell colSpan={2} className="text-right text-muted-foreground">Custom quotation</TableCell></TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function PaymentsTab({ data }: { data: BillingData }) {
  const receipt = async (p: Row) => {
    const bytes = await buildReceiptPdf({ ...p, amount: Number(p.amount), refunded_amount: Number(p.refunded_amount) } as any, { name: data.school?.name ?? "", id: data.school?.id ?? "" });
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
    const a = document.createElement("a"); a.href = url; a.download = `receipt-${p.receipt_no ?? p.reference}.pdf`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Payment history</CardTitle></CardHeader>
      <CardContent className="overflow-auto">
        {data.payments.length === 0 ? <p className="text-sm text-muted-foreground">No payments yet.</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Item</TableHead><TableHead>Reference</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{data.payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{dateText(p.created_at)}</TableCell>
                <TableCell><span className="block">{PRODUCT_LABELS[p.product] ?? p.product}</span><span className="text-xs text-muted-foreground">{p.description}</span></TableCell>
                <TableCell className="font-mono text-xs">{p.reference}{p.mode === "TEST" && <Badge variant="outline" className="ml-1">TEST</Badge>}</TableCell>
                <TableCell><Badge variant={p.status === "successful" ? "default" : ["failed", "cancelled", "mismatch"].includes(p.status) ? "destructive" : "secondary"}>{STATUS_LABELS[p.status] ?? p.status}</Badge></TableCell>
                <TableCell className="text-right">{formatUGX(Number(p.amount))}</TableCell>
                <TableCell className="text-right">{["successful", "refunded", "partially_refunded"].includes(p.status) && <Button size="sm" variant="ghost" onClick={() => receipt(p)}><Receipt className="mr-1 h-4 w-4" />Receipt</Button>}</TableCell>
              </TableRow>))}</TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function QuotesCard({ data, onPay, onChanged }: { data: BillingData; onPay: (q: Row) => void; onChanged: () => void }) {
  const [edition, setEdition] = useState<"online" | "desktop">("online");
  const [capacity, setCapacity] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const request = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("billing_request_quote", { _edition: edition, _product: edition === "online" ? "online_term" : "desktop_licence", _capacity: Number(capacity) || null, _note: note });
    setBusy(false);
    if (error) return toast({ title: "Could not send request", description: error.message, variant: "destructive" });
    toast({ title: "Quotation requested", description: "Skavio will prepare your custom price." });
    setCapacity(""); setNote(""); onChanged();
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Custom quotations</CardTitle><CardDescription>For more than 1,500 learners online or 2,000 on desktop.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {data.quotes.map((q) => (
          <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
            <span>{q.edition === "online" ? "Online" : "Desktop"} · {q.learner_capacity ?? "—"} learners · <Badge variant="outline">{q.status}</Badge>{q.amount && <> · {formatUGX(Number(q.amount))}</>}{q.valid_until && <> · valid until {dateText(q.valid_until)}</>}</span>
            {q.status === "open" && q.amount && <Button size="sm" onClick={() => onPay(q)}>Pay</Button>}
          </div>
        ))}
        <div className="grid gap-2 sm:grid-cols-4">
          <Select value={edition} onValueChange={(v) => setEdition(v as typeof edition)}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="online">Online edition</SelectItem><SelectItem value="desktop">Desktop edition</SelectItem></SelectContent></Select>
          <Input type="number" placeholder="Number of learners" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          <Textarea className="sm:col-span-2 min-h-10" placeholder="Anything we should know (optional)" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button variant="outline" onClick={request} disabled={busy || !(Number(capacity) > 0)}>Request quotation</Button>
      </CardContent>
    </Card>
  );
}
