import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, KeyRound, Loader2, Lock, ShieldCheck, Tags } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBillingAdmin } from "@/hooks/useBillingAdmin";
import { useSchoolEntitlement } from "@/hooks/useSchoolEntitlement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ManualPaymentPanel, type ManualOrder } from "@/components/billing/ManualPaymentPanel";
import { formatUGX } from "@/lib/billing/api";
import { CANCELLABLE_REVIEW_STATUSES, OPEN_REVIEW_STATUSES, REVIEW_LABELS, activateKey, cancelOrder, looksLikeActivationKey, type ReviewStatus } from "@/lib/billing/manual";
import { toast } from "@/hooks/use-toast";

type OrderRow = ManualOrder & { created_at: string; status: string };
const dateText = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default function ActivatePage() {
  const { schoolId } = useAuth();
  const billingAdmin = useBillingAdmin();
  const { entitlement, active } = useSchoolEntitlement();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!schoolId) return;
    const [{ data }, { data: school }] = await Promise.all([
      supabase.from("billing_payments").select("id,reference,description,amount,review_status,review_note,created_at,status")
        .eq("school_id", schoolId).eq("channel", "manual").order("created_at", { ascending: false }).limit(50),
      supabase.from("schools").select("name").eq("id", schoolId).maybeSingle(),
    ]);
    setOrders(((data ?? []) as unknown as OrderRow[]).map((o) => ({ ...o, amount: Number(o.amount) })));
    setSchoolName(school?.name ?? null);
  }, [schoolId]);
  useEffect(() => { void load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!looksLikeActivationKey(key)) return setResult({ ok: false, text: "An activation key looks like SKV-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX. Check it and try again." });
    setBusy(true); setResult(null);
    const r = await activateKey(key);
    setBusy(false);
    if (r.ok) { setKey(""); setResult({ ok: true, text: `${r.description ?? "Your package"} is now active. Open PDF, Download, Bulk Download, Print and Bulk Print are unlocked for the report cards it covers, without the unpaid watermark.` }); void load(); }
    else setResult({ ok: false, text: r.error ?? "Activation failed." });
  };

  if (billingAdmin === false) return <Alert><Lock className="h-4 w-4" /><AlertDescription>Only school administrators can activate packages.</AlertDescription></Alert>;

  const cancel = async (o: OrderRow) => {
    if (!confirm(`Cancel request ${o.reference}? If you have already paid for it, contact Skavio Technologies instead.`)) return;
    setBusy(true);
    try { await cancelOrder(o.id); toast({ title: "Request cancelled", description: "You can now choose another package." }); }
    catch (e) { toast({ title: "Not cancelled", description: e instanceof Error ? e.message : String(e), variant: "destructive" }); }
    setBusy(false); void load();
  };
  const openOrder = orders?.find((o) => o.status === "pending" && OPEN_REVIEW_STATUSES.includes(o.review_status as ReviewStatus));

  const sub = entitlement?.subscription; const lic = entitlement?.licence;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Activate Package</h1>
        <p className="text-muted-foreground">Enter the activation key Skavio Technologies sent you after verifying your payment.</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" />Current status</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {active === null ? <Loader2 className="h-4 w-4 animate-spin" /> : active ? (
            <>
              <p className="font-medium text-success">Active — report cards can be downloaded and printed.</p>
              {sub && <p>{sub.plan === "annual" ? `Annual subscription ${sub.academic_year}` : `Term ${sub.term_number} ${sub.academic_year} subscription`} · up to {sub.capacity.toLocaleString("en-US")} learners · ends {dateText(sub.expires_on)}{sub.state === "grace" ? " (renewal grace)" : ""}</p>}
              {lic && <p>Desktop lifetime licence · up to {lic.capacity.toLocaleString("en-US")} learners</p>}
            </>
          ) : (
            <>
              <p className="font-medium">No active package — previews carry the “SKAVIO EDUREPORTS – UNPAID PREVIEW” watermark and download and printing are locked.</p>
              {!!entitlement?.learner_balance && <p>{entitlement.learner_balance} prepaid Learner(s) available for pay-per-report-card printing.</p>}
              <Button asChild size="sm" variant="outline" className="mt-2"><Link to="/pricing"><Tags className="mr-2 h-4 w-4" />Choose a package</Link></Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" />Enter activation key</CardTitle>
          <CardDescription>Each key works once and only for the school whose payment it was issued for.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1"><Label htmlFor="activation-key">Activation key</Label>
              <Input id="activation-key" autoComplete="off" spellCheck={false} className="font-mono uppercase tracking-wider" placeholder="SKV-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
                maxLength={60} value={key} onChange={(e) => setKey(e.target.value)} /></div>
            <Button type="submit" disabled={busy || !key.trim()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Activate</Button>
          </form>
          {result && (
            <Alert variant={result.ok ? "default" : "destructive"} className="mt-3">
              {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              <AlertTitle>{result.ok ? "Package activated" : "Not activated"}</AlertTitle>
              <AlertDescription>{result.text}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Your mobile money orders</CardTitle>
          <CardDescription>{openOrder
            ? <>Request <span className="font-mono">{openOrder.reference}</span> is in progress. Only one package request is allowed at a time, so finish or cancel it before choosing another package.</>
            : <>Choose a package on the <Link to="/pricing" className="underline">Pricing</Link> page to create an order with its own reference.</>}</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {orders === null ? <Loader2 className="h-4 w-4 animate-spin" /> : orders.length === 0 ? <p className="text-sm text-muted-foreground">No orders yet.</p> : orders.map((o) => (
            <div key={o.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{o.description}</p>
                  <p className="text-xs text-muted-foreground"><span className="font-mono">{o.reference}</span> · {formatUGX(o.amount)} · {dateText(o.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={o.review_status === "activated" ? "default" : o.review_status === "rejected" ? "destructive" : "outline"}>{o.review_status ? REVIEW_LABELS[o.review_status as ReviewStatus] : o.status}</Badge>
                  {o.status === "pending" && CANCELLABLE_REVIEW_STATUSES.includes(o.review_status as ReviewStatus) && <>
                    <Button size="sm" variant="ghost" onClick={() => setOpen(open === o.id ? null : o.id)}>{open === o.id ? "Hide" : "Pay / send proof"}</Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => cancel(o)}>Cancel request</Button>
                  </>}
                </div>
              </div>
              {(o.review_status === "rejected" || o.review_status === "cancelled") && o.review_note && <p className={`mt-2 text-sm ${o.review_status === "rejected" ? "text-destructive" : "text-muted-foreground"}`}>{o.review_status === "rejected" ? "Reason" : "Note"}: {o.review_note}</p>}
              {open === o.id && <div className="mt-3 border-t pt-3"><ManualPaymentPanel order={o} schoolName={schoolName} onSubmitted={load} /></div>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
