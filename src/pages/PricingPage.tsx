import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Lightbulb, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "@/hooks/use-toast";
import { CheckoutDialog, type CheckoutRequest } from "@/components/billing/CheckoutDialog";
import { DesktopPackages, OnlinePackages, PerReportPackages, desktopPackageName, onlinePackageName, type BillingPeriod } from "@/components/billing/PricingCards";
import {
  CREDIT_PACKS, annualPrice, creditsAmount, desktopTier, desktopUpgradeAmount, diffDays, formatUGX, graceLimit, invokeBilling, kampalaToday,
  onlineTier, recommendPlan, subscriptionState, type PlanOptionCode,
} from "@/lib/billing/api";

type Row = Record<string, any>;
type Tab = "online" | "desktop" | "per_report";
const dateText = (iso?: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const termNumber = (name?: string | null) => { const m = /term\s*([123])/i.exec(name ?? ""); return m ? Number(m[1]) : null; };
/** Only same-site paths are accepted as a return target. */
const safeReturn = (v: string | null) => (v && v.startsWith("/") && !v.startsWith("//") ? v : null);

interface Snapshot {
  activeLearners: number; calendar: Row[]; subs: Row[]; licence: Row | null; balance: number; graceDays: number;
  gateway: { configured: boolean; gateway_mode: string | null } | null; term: { year: number; number: number | null; name: string } | null;
}

export default function PricingPage({ signedIn = true }: { signedIn?: boolean }) {
  const { schoolId } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const from = safeReturn(params.get("from"));
  const requested = Math.max(0, Number(params.get("count")) || 0);
  const termId = params.get("term");
  const [tab, setTab] = useState<Tab>("online");
  const [period, setPeriod] = useState<BillingPeriod>("termly");
  const [selected, setSelected] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(signedIn);
  const [year, setYear] = useState<number | null>(null);
  const [termNo, setTermNo] = useState<number | null>(null);
  const [checkout, setCheckout] = useState<{ title: string; amount: number; lines: { label: string; value: string }[]; request: CheckoutRequest } | null>(null);
  const today = kampalaToday();

  const load = useCallback(async () => {
    if (!signedIn || !schoolId) return;
    setLoading(true);
    const q = <T,>(p: PromiseLike<{ data: T | null }>) => p.then((r) => r.data);
    const [calendar, subs, licences, credits, settings, term, l1, l2] = await Promise.all([
      q(supabase.from("billing_calendar").select("*").order("academic_year").order("term_number")),
      q(supabase.from("school_subscriptions").select("*").eq("school_id", schoolId).order("expires_on", { ascending: false })),
      q(supabase.from("desktop_licences").select("*").eq("school_id", schoolId).eq("status", "active").order("capacity", { ascending: false })),
      q(supabase.from("report_credit_accounts").select("balance").eq("school_id", schoolId).maybeSingle()),
      q(supabase.from("billing_settings").select("subscription_grace_days").eq("id", 1).maybeSingle()),
      termId ? q(supabase.from("terms").select("name,year").eq("id", termId).maybeSingle()) : Promise.resolve(null),
      supabase.from("learners").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "active").then((r) => r.count ?? 0),
      supabase.from("nursery_learners").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "active").then((r) => r.count ?? 0),
    ]);
    let gateway: Snapshot["gateway"] = null;
    try { gateway = await invokeBilling({ action: "status" }); } catch { gateway = null; }
    const t = term as Row | null;
    setSnap({
      activeLearners: (l1 as number) + (l2 as number), calendar: (calendar as Row[]) ?? [], subs: (subs as Row[]) ?? [],
      licence: ((licences as Row[]) ?? [])[0] ?? null, balance: Number((credits as Row | null)?.balance ?? 0),
      graceDays: Number((settings as Row | null)?.subscription_grace_days ?? 7), gateway,
      term: t ? { year: Number(t.year), number: termNumber(t.name), name: String(t.name) } : null,
    });
    setLoading(false);
  }, [signedIn, schoolId, termId]);
  useEffect(() => { void load(); }, [load]);

  const futureTerms = useMemo(() => (snap?.calendar ?? []).filter((c) => c.closes_on >= today || diffDays(today, c.closes_on) <= (snap?.graceDays ?? 7)), [snap, today]);
  const years = useMemo(() => Array.from(new Set(futureTerms.map((c) => Number(c.academic_year)))).sort(), [futureTerms]);
  useEffect(() => {
    if (!snap || year !== null) return;
    const wanted = snap.term && futureTerms.some((c) => c.academic_year === snap.term!.year && c.term_number === snap.term!.number) ? snap.term : null;
    setYear(wanted?.year ?? years[0] ?? null);
    setTermNo(wanted?.number ?? futureTerms.find((c) => c.academic_year === (years[0] ?? null))?.term_number ?? null);
  }, [snap, futureTerms, years, year]);

  const subs = useMemo<Row[]>(() => (snap?.subs ?? []).map((s): Row => ({ ...s, state: subscriptionState(s, today, snap?.graceDays ?? 7) })), [snap, today]);
  const covers = (y: number | null, t: number | null) => !!y && subs.some((s) => ["active", "grace", "scheduled"].includes(s.state) && s.academic_year === y && (s.plan === "annual" || s.term_number === t));
  const coveredNow = !!snap?.licence || covers(snap?.term?.year ?? null, snap?.term?.number ?? null);
  const rec = useMemo(() => recommendPlan({ activeLearners: snap?.activeLearners ?? 0, reportCards: requested || snap?.activeLearners || 0, learnerBalance: snap?.balance ?? 0, covered: coveredNow }), [snap, requested, coveredNow]);

  const pick = (code: PlanOptionCode) => {
    if (code === "per_report") {
      const need = rec.options.find((o) => o.code === "per_report")?.payNow ?? 0;
      const pack = CREDIT_PACKS.find((n) => creditsAmount(n) >= need) ?? CREDIT_PACKS[CREDIT_PACKS.length - 1];
      setTab("per_report"); setSelected(String(pack));
    } else {
      setTab("online"); setPeriod(code === "annual" ? "annual" : "termly");
      setSelected(rec.options.find((o) => o.code === code)?.tier?.code ?? null);
    }
  };

  const requireSignIn = () => { navigate("/auth"); return true; };
  const quotation = () => {
    if (!signedIn) return requireSignIn();
    toast({ title: "Custom quotation", description: "Tell us your number of learners under Custom quotations." });
    navigate("/billing");
  };

  const chooseOnline = (code: string) => {
    setSelected(code);
    if (code === "custom") return quotation();
    if (!signedIn) return requireSignIn();
    const t = onlineTier(code)!;
    const current = subs.find((s) => s.state === "active" || s.state === "grace");
    if (current && current.capacity < t.max && covers(year, termNo)) {
      toast({ title: "Upgrade your package", description: "You only pay the prorated difference, and your expiry date stays the same." });
      return navigate("/billing");
    }
    if (!year || (period === "termly" && !termNo)) return toast({ title: "Term dates not published yet", description: "Skavio will publish the academic calendar shortly." });
    const cal = futureTerms.find((c) => c.academic_year === year && c.term_number === termNo);
    if (period === "termly") {
      setCheckout({ title: `${onlinePackageName(code)} · termly`, amount: t.perTerm, request: { product: "online_term", tier: code, academic_year: year, term_number: termNo! },
        lines: [{ label: "Package", value: `${onlinePackageName(code)} (${t.label})` }, { label: "Growth Allowance", value: `Up to ${graceLimit(t.max).toLocaleString("en-US")} learners` }, { label: "Covers", value: `Term ${termNo} ${year}` }, { label: "Expires", value: dateText(cal?.closes_on) }] });
    } else {
      const a = annualPrice(t);
      setCheckout({ title: `${onlinePackageName(code)} · annual`, amount: a.final, request: { product: "online_annual", tier: code, academic_year: year },
        lines: [{ label: "Package", value: `${onlinePackageName(code)} (${t.label})` }, { label: "Covers", value: `Terms 1–3, ${year}` }, { label: "Normal price", value: formatUGX(a.normalTotal) }, { label: "Annual discount (8%)", value: `−${formatUGX(a.discount)}` }] });
    }
  };

  const chooseDesktop = (code: string) => {
    setSelected(code);
    if (code === "custom") return quotation();
    if (!signedIn) return requireSignIn();
    const t = desktopTier(code)!;
    const lic = snap?.licence; const cur = lic ? desktopTier(lic.tier) : null;
    if (cur) {
      setCheckout({ title: "Desktop licence upgrade", amount: desktopUpgradeAmount(cur, t), request: { product: "desktop_upgrade", licence_id: lic!.id, tier: code },
        lines: [{ label: "Current", value: `${desktopPackageName(cur.code)} (${formatUGX(cur.price)})` }, { label: "New", value: `${desktopPackageName(code)} (${formatUGX(t.price)})` }, { label: "You pay", value: "Only the difference" }] });
    } else {
      setCheckout({ title: `${desktopPackageName(code)} · lifetime licence`, amount: t.price, request: { product: "desktop_licence", tier: code },
        lines: [{ label: "Capacity", value: t.label }, { label: "Growth Allowance", value: `Up to ${graceLimit(t.max).toLocaleString("en-US")} learners` }, { label: "Type", value: "Lifetime, one-time payment" }] });
    }
  };

  const choosePack = (n: string) => {
    setSelected(n);
    if (!signedIn) return requireSignIn();
    const qty = Number(n);
    setCheckout({ title: `${qty} Learners`, amount: creditsAmount(qty), request: { product: "report_credits", quantity: qty },
      lines: [{ label: "Learners", value: String(qty) }, { label: "Price each", value: "UGX 500" }] });
  };

  const active = snap?.activeLearners ?? 0;
  const onlineDisabled = (code: string) => {
    if (!signedIn) return null;
    const t = onlineTier(code)!;
    if (active > graceLimit(t.max)) return `Too small for ${active} active learners`;
    const currentCapacity = Number(subs.find((s) => s.state === "active" || s.state === "grace")?.capacity ?? 0);
    if (covers(year, period === "termly" ? termNo : null) && !(currentCapacity > 0 && currentCapacity < t.max)) return "This period is already covered";
    return null;
  };
  const licenceTier = snap?.licence ? desktopTier(snap.licence.tier) : null;
  const desktopDisabled = (code: string) => {
    if (!signedIn) return null;
    const t = desktopTier(code)!;
    if (licenceTier && t.max <= licenceTier.max) return t.code === licenceTier.code ? "Your current licence" : "Smaller than your licence";
    if (!licenceTier && active > graceLimit(t.max)) return `Too small for ${active} active learners`;
    return null;
  };

  const gatewayNotice = signedIn && snap && (!snap.gateway?.configured
    ? "Online payments are being set up. You can review and choose packages now; payment will work once the payment gateway is connected."
    : snap.gateway.gateway_mode === "TEST" ? "Payments are in TEST mode — no real money is collected." : null);

  return (
    <div className="space-y-6">
      {from && (
        <Button asChild variant="ghost" size="sm" className="-ml-2"><Link to={from}><ArrowLeft className="mr-1 h-4 w-4" />Back to report cards (your selection is kept)</Link></Button>
      )}
      <div className="rounded-xl bg-[image:var(--gradient-primary)] p-6 text-primary-foreground md:p-8">
        <p className="text-sm font-medium text-accent">Skavio EduReports pricing</p>
        <h1 className="mt-1 text-2xl font-bold md:text-3xl">Choose the reporting solution that fits your school</h1>
        <p className="mt-2 max-w-2xl text-sm opacity-90">All prices in UGX. Registering learners, entering marks and previewing report cards is free — pay only to download and print.
          Online and Desktop packages include a permanent 10% Growth Allowance.</p>
      </div>

      {gatewayNotice && <Alert><ShieldCheck className="h-4 w-4" /><AlertDescription>{gatewayNotice}</AlertDescription></Alert>}

      {signedIn && (loading || !snap ? <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
        <Card className="border-accent/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="h-4 w-4 text-accent" />Smart recommendation</CardTitle>
            <CardDescription>
              {active} active learner(s){requested ? ` · ${requested} report card(s) requested${snap.term ? ` for ${snap.term.name} ${snap.term.year}` : ""}` : ""}{snap.balance ? ` · ${snap.balance} Learner(s) in your balance` : ""}
              {snap.licence ? ` · Desktop licence: ${desktopPackageName(snap.licence.tier)}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rec.covered ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-success/10 p-3 text-sm">
                <span>You're already covered{snap.licence ? " by your lifetime licence" : " by your subscription"} — downloads and printing are unlocked.</span>
                {from && <Button asChild size="sm"><Link to={from}>Return to report cards</Link></Button>}
              </div>
            ) : rec.customQuote ? (
              <p className="text-sm">With more than 1,650 active learners you need a custom quotation. <Button variant="link" className="h-auto p-0" onClick={quotation}>Request one</Button></p>
            ) : (
              <div className="grid gap-3 md:grid-cols-3">
                {rec.options.map((o) => (
                  <button key={o.code} type="button" onClick={() => o.eligible && pick(o.code)} disabled={!o.eligible}
                    className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted ${rec.recommended === o.code ? "border-primary ring-1 ring-primary" : ""} disabled:opacity-50`}>
                    <div className="flex items-center justify-between gap-2"><span className="font-medium">{o.label}</span>{rec.recommended === o.code && <Badge><Sparkles className="mr-1 h-3 w-3" />Best value</Badge>}</div>
                    <p className="mt-1 text-xl font-semibold text-primary">{formatUGX(o.payNow)}</p>
                    <p className="text-xs text-muted-foreground">{o.code === "annual" ? `≈ ${formatUGX(o.perTerm)} per term · ` : ""}{o.note}</p>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">Recommendation compares the cost of covering one term. You can choose any package below.</p>
          </CardContent>
        </Card>
      ))}

      <Tabs value={tab} onValueChange={(v) => { setTab(v as Tab); setSelected(null); }}>
        <TabsList className="grid h-auto w-full grid-cols-3 md:w-[520px]">
          <TabsTrigger value="online">Online</TabsTrigger>
          <TabsTrigger value="desktop">Desktop Offline</TabsTrigger>
          <TabsTrigger value="per_report">Pay Per Report</TabsTrigger>
        </TabsList>

        <TabsContent value="online" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-lg font-semibold">Online Subscription</h2><p className="text-sm text-muted-foreground">Termly or annual · Annual saves 8% and covers all three terms</p></div>
            <ToggleGroup type="single" value={period} onValueChange={(v) => v && setPeriod(v as BillingPeriod)} className="rounded-md border p-1" aria-label="Billing period">
              <ToggleGroupItem value="termly" className="px-4">Termly</ToggleGroupItem>
              <ToggleGroupItem value="annual" className="px-4">Annual · save 8%</ToggleGroupItem>
            </ToggleGroup>
          </div>
          {signedIn && snap && (futureTerms.length ? (
            <div className="flex flex-wrap gap-3">
              <div className="w-36"><Label>Academic year</Label>
                <Select value={year ? String(year) : ""} onValueChange={(v) => { setYear(Number(v)); setTermNo(futureTerms.find((c) => c.academic_year === Number(v))?.term_number ?? null); }}>
                  <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                  <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select></div>
              {period === "termly" && <div className="w-60"><Label>Term</Label>
                <Select value={termNo ? String(termNo) : ""} onValueChange={(v) => setTermNo(Number(v))}>
                  <SelectTrigger><SelectValue placeholder="Term" /></SelectTrigger>
                  <SelectContent>{futureTerms.filter((c) => c.academic_year === year).map((c) => <SelectItem key={c.term_number} value={String(c.term_number)}>Term {c.term_number} · closes {dateText(c.closes_on)}</SelectItem>)}</SelectContent></Select></div>}
            </div>
          ) : <Alert><AlertDescription>Term dates for subscriptions have not been published yet. You can compare packages now; buying opens once Skavio publishes the academic calendar.</AlertDescription></Alert>)}
          <OnlinePackages period={period} selected={tab === "online" ? selected : null} onChoose={chooseOnline} disabledFor={onlineDisabled} />
        </TabsContent>

        <TabsContent value="desktop" className="space-y-4">
          <div><h2 className="text-lg font-semibold">Desktop Offline Packages</h2><p className="text-sm text-muted-foreground">One-time payment · Lifetime licence · No compulsory renewal</p></div>
          <DesktopPackages selected={tab === "desktop" ? selected : null} onChoose={chooseDesktop} disabledFor={desktopDisabled}
            actionLabel={(code) => (licenceTier && desktopTier(code)!.max > licenceTier.max ? "Upgrade" : "Choose package")}
            priceFor={(t) => (licenceTier && t.max > licenceTier.max ? { price: formatUGX(desktopUpgradeAmount(licenceTier, t)), note: `Upgrade · full price ${formatUGX(t.price)}` } : null)} />
        </TabsContent>

        <TabsContent value="per_report" className="space-y-4">
          <div><h2 className="text-lg font-semibold">Pay Per Report Card</h2>
            <p className="text-sm text-muted-foreground">UGX 500 per unique report card (one learner, one term) · No fixed subscription · Reprinting, downloading and regenerating paid cards is free · No Growth Allowance (you pay only for cards you use)</p></div>
          <PerReportPackages selected={tab === "per_report" ? selected : null} onChoose={choosePack} />
        </TabsContent>
      </Tabs>

      <CheckoutDialog open={!!checkout} onOpenChange={(o) => !o && setCheckout(null)} title={checkout?.title ?? ""} amount={checkout?.amount ?? 0}
        lines={checkout?.lines} request={checkout?.request ?? null} onSettled={load} />
    </div>
  );
}
