import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { Download, Loader2, RefreshCw, Search } from "lucide-react";
import { formatUGX, invokeBilling, kampalaToday, onlineTier, desktopTier, PRODUCT_LABELS, STATUS_LABELS, subscriptionState, toCsv, downloadText, diffDays, graceLimit } from "@/lib/billing/api";

type Row = Record<string, any>;
const dateText = (iso?: string | null) => (iso ? new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");

interface AllData {
  schools: Row[]; profiles: Row[]; subs: Row[]; payments: Row[]; capacity: Row[]; credits: Row[]; licences: Row[]; devices: Row[];
  quotes: Row[]; calendar: Row[]; settings: Row | null; upgrades: Row[]; events: Row[]; termBilling: Row[];
  gateway: { configured: boolean; gateway_mode: string | null; platform_mode: string } | null;
}

export default function PlatformBillingPage() {
  const { isSuperAdmin } = useAuth();
  const [d, setD] = useState<AllData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const all = async (t: string, order = "created_at") => (await supabase.from(t as any).select("*").order(order, { ascending: false }).limit(2000)).data ?? [];
    const [schools, profiles, subs, payments, capacity, credits, licences, devices, quotes, calendar, settings, upgrades, events, termBilling] = await Promise.all([
      all("schools"), all("school_billing_profiles"), all("school_subscriptions"), all("billing_payments"), all("school_capacity_status", "updated_at"),
      all("report_credit_accounts", "updated_at"), all("desktop_licences", "issued_at"), all("desktop_licence_devices", "activated_at"), all("billing_quotes"),
      all("billing_calendar", "academic_year"), supabase.from("billing_settings").select("*").eq("id", 1).maybeSingle().then((r) => r.data),
      all("billing_upgrades"), all("billing_webhook_events", "received_at"), all("school_term_billing"),
    ]);
    let gateway = null;
    try { gateway = await invokeBilling({ action: "status" }); } catch { /* not configured */ }
    setD({ schools, profiles, subs, payments, capacity, credits, licences, devices, quotes, calendar, settings, upgrades, events: events.slice(0, 100), termBilling, gateway } as AllData);
    setLoading(false);
  }, []);
  useEffect(() => { if (isSuperAdmin) load(); }, [isSuperAdmin, load]);

  if (!isSuperAdmin) return <Card><CardHeader><CardTitle>Platform billing</CardTitle><CardDescription>Only Skavio platform administrators can open this page.</CardDescription></CardHeader></Card>;
  if (loading || !d) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Payments & Licence Management</h1>
          <p className="text-muted-foreground">All schools · gateway {d.gateway?.configured ? `connected (${d.gateway.gateway_mode})` : "not connected"} · platform mode {d.settings?.payment_mode}</p></div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>
      <Tabs defaultValue="schools">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="schools">Schools</TabsTrigger><TabsTrigger value="payments">Payments</TabsTrigger><TabsTrigger value="licences">Desktop licences</TabsTrigger>
          <TabsTrigger value="quotes">Quotations</TabsTrigger><TabsTrigger value="calendar">Academic calendar</TabsTrigger><TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="schools"><SchoolsTab d={d} reload={load} /></TabsContent>
        <TabsContent value="payments"><PaymentsTab d={d} reload={load} /></TabsContent>
        <TabsContent value="licences"><LicencesTab d={d} reload={load} /></TabsContent>
        <TabsContent value="quotes"><QuotesTab d={d} reload={load} /></TabsContent>
        <TabsContent value="calendar"><CalendarTab d={d} reload={load} /></TabsContent>
        <TabsContent value="settings"><SettingsTab d={d} reload={load} /></TabsContent>
      </Tabs>
    </div>
  );
}

function schoolSummary(d: AllData, today: string) {
  const grace = d.settings?.subscription_grace_days ?? 7;
  return d.schools.map((s) => {
    const profile = d.profiles.find((p) => p.school_id === s.id);
    const subs: Row[] = d.subs.filter((x) => x.school_id === s.id).map((x): Row => ({ ...x, state: subscriptionState(x, today, grace) }));
    const current = subs.find((x) => x.state === "active" || x.state === "grace") ?? subs[0] ?? null;
    const cap = d.capacity.find((c) => c.school_id === s.id && c.edition === "online");
    const dcap = d.capacity.find((c) => c.school_id === s.id && c.edition === "desktop");
    const lic = d.licences.find((l) => l.school_id === s.id && l.status === "active");
    const lastPay = d.payments.find((p) => p.school_id === s.id && p.status === "successful");
    const credits = d.credits.find((c) => c.school_id === s.id);
    const nextTerm = current?.plan === "termly" ? d.calendar.find((c) => c.academic_year === current.academic_year && c.term_number === current.term_number + 1) : null;
    return {
      id: s.id, name: s.name,
      edition: lic && current ? "online + desktop" : lic ? "desktop" : current ? "online" : "—",
      method: profile?.default_method === "per_report" ? "pay per report card" : current ? "subscription" : "—",
      package: current ? (onlineTier(current.tier)?.label ?? `custom ${current.capacity}`) : lic ? (desktopTier(lic.tier)?.label ?? `custom ${lic.capacity}`) : "—",
      purchased_capacity: cap?.licensed ?? dcap?.licensed ?? "",
      active_learners: cap?.active_learners ?? dcap?.active_learners ?? "",
      grace_capacity: cap?.grace_limit ?? dcap?.grace_limit ?? "",
      capacity_state: cap?.state ?? dcap?.state ?? "",
      subscription_status: current?.state ?? (lic ? "lifetime" : "none"),
      start: current?.starts_on ?? lic?.issued_at?.slice(0, 10) ?? "",
      expiry: current?.expires_on ?? "",
      next_renewal: current ? (nextTerm?.renewal_due_on ?? current.expires_on) : "",
      last_payment_amount: lastPay ? Number(lastPay.amount) : "",
      last_payment_reference: lastPay?.reference ?? "",
      learners_remaining: credits?.balance ?? "",
      upgrades: d.upgrades.filter((u) => u.school_id === s.id).length,
      days_to_expiry: current ? diffDays(current.expires_on, today) : null,
    };
  });
}

function SchoolsTab({ d, reload }: { d: AllData; reload: () => void }) {
  const today = kampalaToday();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => schoolSummary(d, today), [d, today]);
  const shown = rows.filter((r) => (!q || `${r.name} ${r.id}`.toLowerCase().includes(q.toLowerCase())) && (
    filter === "all" || (filter === "expiring" && r.subscription_status === "active" && (r.days_to_expiry ?? 99) <= 14)
    || (filter === "grace" && r.subscription_status === "grace") || (filter === "expired" && r.subscription_status === "expired")
    || (filter === "capacity" && ["approaching", "allowance", "exceeded"].includes(String(r.capacity_state)))
    || (filter === "per_report" && r.method === "pay per report card") || (filter === "desktop" && r.edition.includes("desktop"))));
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">School billing profiles</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8 w-64" placeholder="Search school or ID" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All schools</SelectItem><SelectItem value="expiring">Expiring within 14 days</SelectItem><SelectItem value="grace">In renewal grace</SelectItem>
              <SelectItem value="expired">Expired</SelectItem><SelectItem value="capacity">Approaching / over capacity</SelectItem><SelectItem value="per_report">Pay per report card</SelectItem><SelectItem value="desktop">Desktop licences</SelectItem></SelectContent></Select>
          <Button variant="outline" onClick={() => downloadText(`school-billing-${today}.csv`, toCsv(shown.map(({ days_to_expiry, ...r }) => r)))}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
        </div>
        <div className="overflow-auto">
          <Table>
            <TableHeader><TableRow><TableHead>School</TableHead><TableHead>Edition</TableHead><TableHead>Method</TableHead><TableHead>Package</TableHead><TableHead>Learners</TableHead><TableHead>Status</TableHead><TableHead>Expiry</TableHead><TableHead>Learners left</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{shown.map((r) => (
              <TableRow key={r.id}>
                <TableCell><span className="block font-medium">{r.name}</span><span className="text-xs text-muted-foreground font-mono">{r.id.slice(0, 8)}</span></TableCell>
                <TableCell>{r.edition}</TableCell><TableCell>{r.method}</TableCell><TableCell>{r.package}</TableCell>
                <TableCell>{r.active_learners !== "" ? `${r.active_learners} / ${r.purchased_capacity} (≤${r.grace_capacity})` : "—"}{r.capacity_state && r.capacity_state !== "ok" && <Badge variant="outline" className="ml-1">{r.capacity_state}</Badge>}</TableCell>
                <TableCell><Badge variant={r.subscription_status === "active" || r.subscription_status === "lifetime" ? "default" : r.subscription_status === "grace" ? "destructive" : "secondary"}>{r.subscription_status}</Badge></TableCell>
                <TableCell>{dateText(r.expiry || null)}</TableCell><TableCell>{r.learners_remaining}</TableCell>
                <TableCell><Button size="sm" variant="ghost" onClick={() => setOpen(r.id)}>Details</Button></TableCell>
              </TableRow>))}</TableBody>
          </Table>
        </div>
      </CardContent>
      <SchoolDetail d={d} schoolId={open} onClose={() => setOpen(null)} reload={reload} />
    </Card>
  );
}

function SchoolDetail({ d, schoolId, onClose, reload }: { d: AllData; schoolId: string | null; onClose: () => void; reload: () => void }) {
  const school = d.schools.find((s) => s.id === schoolId);
  const profile = d.profiles.find((p) => p.school_id === schoolId);
  const [form, setForm] = useState({ edition: "online", custom_capacity: "", custom_grace_limit: "", notes: "" });
  useEffect(() => { setForm({ edition: profile?.edition ?? "online", custom_capacity: profile?.custom_capacity?.toString() ?? "", custom_grace_limit: profile?.custom_grace_limit?.toString() ?? "", notes: profile?.notes ?? "" }); }, [schoolId, profile]);
  if (!school) return null;
  const save = async () => {
    const payload = { school_id: school.id, edition: form.edition, custom_capacity: form.custom_capacity ? Number(form.custom_capacity) : null,
      custom_grace_limit: form.custom_grace_limit ? Number(form.custom_grace_limit) : null, notes: form.notes || null };
    const { error } = profile ? await supabase.from("school_billing_profiles").update(payload).eq("school_id", school.id) : await supabase.from("school_billing_profiles").insert(payload);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: "Profile saved" }); reload();
  };
  const subs = d.subs.filter((s) => s.school_id === school.id);
  const pays = d.payments.filter((p) => p.school_id === school.id);
  const ups = d.upgrades.filter((u) => u.school_id === school.id);
  return (
    <Dialog open={!!schoolId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader><DialogTitle>{school.name}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground font-mono">School ID {school.id}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><Label>Edition</Label><Select value={form.edition} onValueChange={(v) => setForm({ ...form, edition: v })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="online">Online</SelectItem><SelectItem value="desktop">Desktop</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent></Select></div>
          <div><Label>Custom capacity (above 1,500)</Label><Input type="number" value={form.custom_capacity} onChange={(e) => setForm({ ...form, custom_capacity: e.target.value })} /></div>
          <div><Label>Custom Growth Allowance limit</Label><Input type="number" placeholder={form.custom_capacity ? String(graceLimit(Number(form.custom_capacity))) : ""} value={form.custom_grace_limit} onChange={(e) => setForm({ ...form, custom_grace_limit: e.target.value })} /></div>
        </div>
        <div><Label>Internal notes</Label><Textarea value={form.notes} maxLength={2000} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        <Button onClick={save}>Save profile</Button>
        <div className="text-sm space-y-1"><p className="font-medium">Subscriptions</p>{subs.length === 0 ? <p className="text-muted-foreground">None</p> : subs.map((s) => <p key={s.id}>{s.plan} · {s.plan === "annual" ? s.academic_year : `Term ${s.term_number} ${s.academic_year}`} · {s.capacity} learners · {dateText(s.starts_on)} → {dateText(s.expires_on)} · {formatUGX(Number(s.amount))}</p>)}</div>
        <div className="text-sm space-y-1"><p className="font-medium">Upgrades</p>{ups.length === 0 ? <p className="text-muted-foreground">None</p> : ups.map((u) => <p key={u.id}>{dateText(u.created_at)} · {u.edition} {u.from_capacity} → {u.to_capacity} · {formatUGX(Number(u.amount))}</p>)}</div>
        <div className="text-sm space-y-1"><p className="font-medium">Payments</p>{pays.length === 0 ? <p className="text-muted-foreground">None</p> : pays.map((p) => <p key={p.id}>{dateText(p.created_at)} · {p.reference} · {PRODUCT_LABELS[p.product]} · {STATUS_LABELS[p.status]} · {formatUGX(Number(p.amount))}</p>)}</div>
      </DialogContent>
    </Dialog>
  );
}

function PaymentsTab({ d, reload }: { d: AllData; reload: () => void }) {
  const [q, setQ] = useState(""); const [status, setStatus] = useState("all"); const [busy, setBusy] = useState<string | null>(null);
  const name = (id: string) => d.schools.find((s) => s.id === id)?.name ?? id.slice(0, 8);
  const shown = d.payments.filter((p) => (status === "all" || p.status === status) && (!q || `${p.reference} ${p.gateway_reference ?? ""} ${name(p.school_id)}`.toLowerCase().includes(q.toLowerCase())));
  const act = async (id: string, body: Record<string, unknown>, done: string) => {
    setBusy(id);
    try { await invokeBilling(body); toast({ title: done }); reload(); } catch (e) { toast({ title: "Failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }); }
    finally { setBusy(null); }
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Payment history</CardTitle><CardDescription>Successful, pending, failed, mismatched and refunded transactions.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input className="w-64" placeholder="Search reference or school" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All statuses</SelectItem>{Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            <Button variant="outline" onClick={() => downloadText(`payments-${kampalaToday()}.csv`, toCsv(shown.map((p) => ({ date: p.created_at, school: name(p.school_id), school_id: p.school_id, product: p.product, description: p.description, amount: p.amount, currency: p.currency, status: p.status, reference: p.reference, gateway_reference: p.gateway_reference, provider: p.provider, mode: p.mode, receipt: p.receipt_no, refunded: p.refunded_amount, failure: p.failure_message }))))}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
            <Button variant="outline" disabled={busy === "reconcile"} onClick={() => act("reconcile", { action: "reconcile" }, "Pending payments re-checked")}>Re-check pending with IntesaPay</Button>
          </div>
          <div className="overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>School</TableHead><TableHead>Item</TableHead><TableHead>Reference</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{shown.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{dateText(p.created_at)}</TableCell><TableCell>{name(p.school_id)}</TableCell>
                  <TableCell><span className="block">{PRODUCT_LABELS[p.product]}</span><span className="text-xs text-muted-foreground">{p.description}</span>{p.details?.possible_duplicate && <Badge variant="destructive" className="ml-1">Possible duplicate</Badge>}</TableCell>
                  <TableCell className="font-mono text-xs">{p.reference}<span className="block">{p.gateway_reference}</span></TableCell>
                  <TableCell><Badge variant={p.status === "successful" ? "default" : ["failed", "cancelled", "mismatch"].includes(p.status) ? "destructive" : "secondary"}>{STATUS_LABELS[p.status]}</Badge>{p.failure_message && <span className="block text-xs text-muted-foreground max-w-48">{p.failure_message}</span>}</TableCell>
                  <TableCell className="text-right">{formatUGX(Number(p.amount))}{Number(p.refunded_amount) > 0 && <span className="block text-xs text-muted-foreground">refunded {formatUGX(Number(p.refunded_amount))}</span>}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {p.status === "pending" && <Button size="sm" variant="ghost" disabled={busy === p.id} onClick={() => act(p.id, { action: "verify", payment_id: p.id }, "Status re-checked")}>Re-check</Button>}
                    {["successful", "partially_refunded"].includes(p.status) && <Button size="sm" variant="ghost" disabled={busy === p.id} onClick={() => {
                      const remaining = Number(p.amount) - Number(p.refunded_amount);
                      const v = window.prompt(`Refund amount in UGX (up to ${remaining}). Services are not removed automatically.`, String(remaining));
                      if (v && Number(v) > 0) act(p.id, { action: "refund", payment_id: p.id, amount: Number(v) }, "Refund requested");
                    }}>Refund</Button>}
                  </TableCell>
                </TableRow>))}</TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Gateway notifications (latest 100)</CardTitle></CardHeader>
        <CardContent className="overflow-auto max-h-80">
          <Table><TableHeader><TableRow><TableHead>Received</TableHead><TableHead>Event</TableHead><TableHead>Reference</TableHead><TableHead>Signature</TableHead><TableHead>Result</TableHead></TableRow></TableHeader>
            <TableBody>{d.events.map((e) => <TableRow key={e.id}><TableCell>{new Date(e.received_at).toLocaleString("en-GB")}</TableCell><TableCell>{e.event_type}</TableCell><TableCell className="font-mono text-xs">{e.payment_reference}</TableCell><TableCell>{e.signature_valid ? "valid" : "rejected"}</TableCell><TableCell>{e.result}</TableCell></TableRow>)}</TableBody></Table>
        </CardContent>
      </Card>
    </div>
  );
}

function LicencesTab({ d, reload }: { d: AllData; reload: () => void }) {
  const name = (id: string) => d.schools.find((s) => s.id === id)?.name ?? id.slice(0, 8);
  const update = async (id: string, patch: Row, msg: string) => {
    const { error } = await supabase.from("desktop_licences").update(patch as any).eq("id", id);
    if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
    toast({ title: msg }); reload();
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Desktop lifetime licences</CardTitle><CardDescription>Lifetime licences never expire; maintenance dates only cover updates and support.</CardDescription></CardHeader>
      <CardContent className="overflow-auto">
        {d.licences.length === 0 ? <p className="text-sm text-muted-foreground">No desktop licences yet.</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>School</TableHead><TableHead>Key</TableHead><TableHead>Capacity</TableHead><TableHead>Version</TableHead><TableHead>Computers</TableHead><TableHead>Maintenance until</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{d.licences.map((l) => {
              const devs = d.devices.filter((x) => x.licence_id === l.id && !x.deactivated_at);
              return (
                <TableRow key={l.id}>
                  <TableCell>{name(l.school_id)}</TableCell><TableCell className="font-mono text-xs">{l.licence_key}</TableCell>
                  <TableCell>{l.capacity} (≤{l.grace_limit})</TableCell><TableCell>{l.version}</TableCell>
                  <TableCell><Input type="number" className="w-16 inline-block" defaultValue={l.max_devices} min={1} max={20} onBlur={(e) => Number(e.target.value) !== l.max_devices && update(l.id, { max_devices: Number(e.target.value) }, "Device limit updated")} /> <span className="text-xs text-muted-foreground">{devs.length} active</span></TableCell>
                  <TableCell><Input type="date" className="w-40" defaultValue={l.maintenance_until ?? ""} onBlur={(e) => (e.target.value || null) !== l.maintenance_until && update(l.id, { maintenance_until: e.target.value || null }, "Maintenance updated")} /></TableCell>
                  <TableCell><Badge variant={l.status === "active" ? "default" : "destructive"}>{l.status}</Badge></TableCell>
                  <TableCell>{l.status === "active"
                    ? <Button size="sm" variant="ghost" onClick={() => window.confirm("Revoke this licence? Only do this for fraud or a full refund.") && update(l.id, { status: "revoked" }, "Licence revoked")}>Revoke</Button>
                    : <Button size="sm" variant="ghost" onClick={() => update(l.id, { status: "active" }, "Licence restored")}>Restore</Button>}</TableCell>
                </TableRow>);
            })}</TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function QuotesTab({ d, reload }: { d: AllData; reload: () => void }) {
  const name = (id: string) => d.schools.find((s) => s.id === id)?.name ?? id.slice(0, 8);
  const blank = { school_id: "", edition: "online", product: "online_term", learner_capacity: "", academic_year: "", term_number: "", quantity: "", amount: "", valid_until: "", admin_note: "" };
  const [form, setForm] = useState<Record<string, string>>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const edit = (q: Row) => { setEditing(q.id); setForm(Object.fromEntries(Object.keys(blank).map((k) => [k, q[k] === null || q[k] === undefined ? "" : String(q[k])]))); };
  const save = async () => {
    const num = (v: string) => (v ? Number(v) : null);
    const payload = { school_id: form.school_id, edition: form.edition, product: form.product, learner_capacity: num(form.learner_capacity), academic_year: num(form.academic_year),
      term_number: num(form.term_number), quantity: num(form.quantity), amount: num(form.amount), valid_until: form.valid_until || null, admin_note: form.admin_note || null, status: "open" };
    if (!payload.school_id || !payload.amount || payload.amount < 500) return toast({ title: "Choose a school and an amount of at least UGX 500", variant: "destructive" });
    const { error } = editing ? await supabase.from("billing_quotes").update(payload).eq("id", editing) : await supabase.from("billing_quotes").insert(payload);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: "Quotation published to the school" }); setEditing(null); setForm(blank); reload();
  };
  const f = (k: string) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) });
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">{editing ? "Edit quotation" : "New custom quotation"}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div><Label>School</Label><Select value={form.school_id} onValueChange={(v) => setForm({ ...form, school_id: v })}><SelectTrigger><SelectValue placeholder="School" /></SelectTrigger>
            <SelectContent>{d.schools.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Product</Label><Select value={form.product} onValueChange={(v) => setForm({ ...form, product: v, edition: v.startsWith("desktop") ? "desktop" : "online" })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["online_term", "online_annual", "desktop_licence", "desktop_upgrade", "report_credits"].map((p) => <SelectItem key={p} value={p}>{PRODUCT_LABELS[p] ?? p}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Amount (UGX)</Label><Input type="number" {...f("amount")} /></div>
          <div><Label>Learner capacity</Label><Input type="number" {...f("learner_capacity")} /></div>
          <div><Label>Academic year</Label><Input type="number" {...f("academic_year")} /></div>
          <div><Label>Term (termly only)</Label><Input type="number" min={1} max={3} {...f("term_number")} /></div>
          <div><Label>Learners (pay-per-report quotes)</Label><Input type="number" {...f("quantity")} /></div>
          <div><Label>Valid until</Label><Input type="date" {...f("valid_until")} /></div>
          <div><Label>Note to school</Label><Input {...f("admin_note")} /></div>
          <div className="sm:col-span-3 flex gap-2"><Button onClick={save}>{editing ? "Save & publish" : "Publish quotation"}</Button>{editing && <Button variant="ghost" onClick={() => { setEditing(null); setForm(blank); }}>Cancel</Button>}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Quotations</CardTitle></CardHeader>
        <CardContent className="overflow-auto">
          <Table><TableHeader><TableRow><TableHead>School</TableHead><TableHead>Product</TableHead><TableHead>Learners</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Request note</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{d.quotes.map((q) => (
              <TableRow key={q.id}><TableCell>{name(q.school_id)}</TableCell><TableCell>{PRODUCT_LABELS[q.product] ?? q.product}</TableCell><TableCell>{q.learner_capacity ?? "—"}</TableCell>
                <TableCell>{q.amount ? formatUGX(Number(q.amount)) : "—"}</TableCell><TableCell><Badge variant="outline">{q.status}</Badge></TableCell><TableCell className="max-w-56 text-xs">{q.request_note}</TableCell>
                <TableCell className="whitespace-nowrap">{q.status !== "paid" && <><Button size="sm" variant="ghost" onClick={() => edit(q)}>Edit</Button>
                  {q.status !== "cancelled" && <Button size="sm" variant="ghost" onClick={async () => { await supabase.from("billing_quotes").update({ status: "cancelled" }).eq("id", q.id); reload(); }}>Cancel</Button>}</>}</TableCell></TableRow>))}</TableBody></Table>
        </CardContent>
      </Card>
    </div>
  );
}

function CalendarTab({ d, reload }: { d: AllData; reload: () => void }) {
  const years = Array.from(new Set(d.calendar.map((c) => c.academic_year))).sort((a, b) => b - a);
  const [newYear, setNewYear] = useState(String(new Date().getFullYear() + (years.includes(new Date().getFullYear()) ? 1 : 0)));
  const [rows, setRows] = useState<Record<number, { opens_on: string; closes_on: string; renewal_due_on: string }>>({ 1: { opens_on: "", closes_on: "", renewal_due_on: "" }, 2: { opens_on: "", closes_on: "", renewal_due_on: "" }, 3: { opens_on: "", closes_on: "", renewal_due_on: "" } });
  const saveRow = async (row: Row, patch: Row) => {
    const { error } = await supabase.from("billing_calendar").update(patch as any).eq("id", row.id);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: "Calendar updated", description: "Subscription expiry dates follow the new closing date." }); reload();
  };
  const addYear = async () => {
    const y = Number(newYear);
    const payload = [1, 2, 3].map((t) => ({ academic_year: y, term_number: t, opens_on: rows[t].opens_on, closes_on: rows[t].closes_on, renewal_due_on: rows[t].renewal_due_on || null }));
    if (payload.some((p) => !p.opens_on || !p.closes_on || p.closes_on <= p.opens_on)) return toast({ title: "Enter valid opening and closing dates for all three terms", variant: "destructive" });
    const { error } = await supabase.from("billing_calendar").insert(payload);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: `Calendar for ${y} published` }); reload();
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Add academic year</CardTitle><CardDescription>Termly subscriptions expire on the term's closing date; annual subscriptions on Term 3's closing date.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="w-32"><Label>Year</Label><Input type="number" value={newYear} onChange={(e) => setNewYear(e.target.value)} /></div>
          {[1, 2, 3].map((t) => (
            <div key={t} className="grid gap-2 sm:grid-cols-4 items-end">
              <p className="font-medium">Term {t}</p>
              {(["opens_on", "closes_on", "renewal_due_on"] as const).map((k) => (
                <div key={k}><Label className="text-xs">{k === "opens_on" ? "Opens" : k === "closes_on" ? "Closes" : "Renewal due (optional)"}</Label>
                  <Input type="date" value={rows[t][k]} onChange={(e) => setRows({ ...rows, [t]: { ...rows[t], [k]: e.target.value } })} /></div>))}
            </div>))}
          <Button onClick={addYear}>Publish calendar</Button>
        </CardContent>
      </Card>
      {years.map((y) => (
        <Card key={y}>
          <CardHeader><CardTitle className="text-base">{y}</CardTitle></CardHeader>
          <CardContent className="space-y-2">{d.calendar.filter((c) => c.academic_year === y).sort((a, b) => a.term_number - b.term_number).map((c) => (
            <div key={c.id} className="grid gap-2 sm:grid-cols-4 items-end">
              <p className="font-medium">Term {c.term_number}</p>
              <div><Label className="text-xs">Opens</Label><Input type="date" defaultValue={c.opens_on} onBlur={(e) => e.target.value && e.target.value !== c.opens_on && saveRow(c, { opens_on: e.target.value })} /></div>
              <div><Label className="text-xs">Closes</Label><Input type="date" defaultValue={c.closes_on} onBlur={(e) => e.target.value && e.target.value !== c.closes_on && saveRow(c, { closes_on: e.target.value })} /></div>
              <div><Label className="text-xs">Renewal due</Label><Input type="date" defaultValue={c.renewal_due_on ?? ""} onBlur={(e) => (e.target.value || null) !== c.renewal_due_on && saveRow(c, { renewal_due_on: e.target.value || null })} /></div>
            </div>))}</CardContent>
        </Card>))}
    </div>
  );
}

function SettingsTab({ d, reload }: { d: AllData; reload: () => void }) {
  const s = d.settings ?? {};
  const [form, setForm] = useState({
    enforcement_enabled: !!s.enforcement_enabled, payment_mode: s.payment_mode ?? "TEST", subscription_grace_days: String(s.subscription_grace_days ?? 7),
    capacity_grace_days: String(s.capacity_grace_days ?? 30), capacity_grace_percent: String(s.capacity_grace_percent ?? 10),
    reminder_days: (s.reminder_days ?? [14, 7, 0]).join(", "), grace_reminder_days: (s.grace_reminder_days ?? [1, 6]).join(", "),
    low_credit_threshold: String(s.low_credit_threshold ?? 10), default_max_devices: String(s.default_max_devices ?? 1),
  });
  const ints = (v: string) => v.split(",").map((x) => parseInt(x.trim(), 10)).filter((n) => Number.isFinite(n) && n >= 0 && n <= 60);
  const save = async () => {
    if (form.payment_mode === "LIVE" && s.payment_mode !== "LIVE" && !window.confirm("Switch to LIVE payments? Only do this after IntesaPay merchant verification, LIVE credentials are installed and a live test succeeded.")) return;
    const { error } = await supabase.from("billing_settings").update({
      enforcement_enabled: form.enforcement_enabled, payment_mode: form.payment_mode, subscription_grace_days: Number(form.subscription_grace_days),
      capacity_grace_percent: Number(form.capacity_grace_percent), reminder_days: ints(form.reminder_days),
      grace_reminder_days: ints(form.grace_reminder_days), low_credit_threshold: Number(form.low_credit_threshold), default_max_devices: Number(form.default_max_devices),
    }).eq("id", 1);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: "Settings saved" }); reload();
  };
  const num = (k: keyof typeof form) => ({ value: String(form[k]), onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Billing settings</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Alert><AlertDescription>While this is off, every school can download and print freely; schools still see prices and can pay. When it is on, unpaid schools keep free previews (with the “SKAVIO EDUREPORTS – UNPAID PREVIEW” watermark) but Download, Bulk Download, Print and Bulk Print stay locked until they pay. Turn it on only after the academic calendar is published and payments work.</AlertDescription></Alert>
        <div className="flex items-center gap-3"><Switch id="enforce" checked={form.enforcement_enabled} onCheckedChange={(v) => setForm({ ...form, enforcement_enabled: v })} /><Label htmlFor="enforce">Lock downloads and printing for unpaid schools (and enforce learner limits)</Label></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><Label>Payment mode</Label><Select value={form.payment_mode} onValueChange={(v) => setForm({ ...form, payment_mode: v })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="TEST">TEST (sandbox)</SelectItem><SelectItem value="LIVE">LIVE</SelectItem></SelectContent></Select></div>
          <div><Label>Renewal grace (days)</Label><Input type="number" {...num("subscription_grace_days")} /></div>
          <div><Label>Growth Allowance (%, permanent)</Label><Input type="number" {...num("capacity_grace_percent")} /></div>
          <div><Label>Reminders before expiry (days)</Label><Input {...num("reminder_days")} /></div>
          <div><Label>Reminders during grace (days after expiry)</Label><Input {...num("grace_reminder_days")} /></div>
          <div><Label>Low-learners warning at</Label><Input type="number" {...num("low_credit_threshold")} /></div>
          <div><Label>Computers per new desktop licence</Label><Input type="number" {...num("default_max_devices")} /></div>
        </div>
        <Button onClick={save}>Save settings</Button>
      </CardContent>
    </Card>
  );
}
