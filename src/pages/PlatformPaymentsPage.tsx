import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle2, Copy, Eye, KeyRound, Loader2, MessageCircle, RefreshCw, Search, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { formatUGX } from "@/lib/billing/api";
import { REVIEW_LABELS, activationKeyText, toWhatsAppNumber, whatsappLink, type ReviewStatus } from "@/lib/billing/manual";

type Row = Record<string, any>;
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const ACTION_LABELS: Record<string, string> = {
  order_created: "Order created", proof_submitted: "Proof submitted", payment_approved: "Payment approved", payment_rejected: "Payment rejected",
  key_generated: "Key generated", key_reissued: "Key reissued", key_revoked: "Key revoked", key_expired: "Key expired",
  package_activated: "Package activated", activation_failed: "Failed activation attempt", key_used_by_other_school: "Key tried by another school",
};
type Filter = "review" | "approved" | "activated" | "rejected" | "all";
const inFilter = (p: Row, f: Filter) => f === "all" || (f === "review" ? ["awaiting_proof", "submitted"].includes(p.review_status) : p.review_status === f);

interface IssuedKey { key: string; expires_at: string; payment: Row; school: Row | undefined }

export default function PlatformPaymentsPage() {
  const { isSuperAdmin } = useAuth();
  const [data, setData] = useState<{ payments: Row[]; schools: Row[]; info: Row[]; keys: Row[]; audit: Row[]; profiles: Row[] } | null>(null);
  const [filter, setFilter] = useState<Filter>("review");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<{ payment: Row; approve: boolean } | null>(null);
  const [note, setNote] = useState("");
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const [waNumber, setWaNumber] = useState("");

  const load = useCallback(async () => {
    const pick = async (p: PromiseLike<{ data: unknown }>) => ((await p).data ?? []) as Row[];
    const [payments, schools, info, keys, audit, profiles] = await Promise.all([
      pick(supabase.from("billing_payments").select("*").eq("channel", "manual").order("created_at", { ascending: false }).limit(1000)),
      pick(supabase.from("schools").select("id,name,phone,email")),
      pick(supabase.from("school_info").select("school_id,tel,email")),
      pick(supabase.from("billing_activation_keys").select("id,payment_id,school_id,key_hint,status,expires_at,created_at,used_at,revoked_at").order("created_at", { ascending: false })),
      pick(supabase.from("billing_audit_log").select("*").order("created_at", { ascending: false }).limit(500)),
      pick(supabase.from("profiles").select("id,email,full_name")),
    ]);
    setData({ payments, schools, info, keys, audit, profiles });
  }, []);
  useEffect(() => { if (isSuperAdmin) void load(); }, [isSuperAdmin, load]);

  const school = useCallback((id?: string | null) => data?.schools.find((s) => s.id === id), [data]);
  const schoolPhone = useCallback((p: Row) => p.payer_phone || school(p.school_id)?.phone || data?.info.find((i) => i.school_id === p.school_id)?.tel || "", [data, school]);
  const liveKey = useCallback((paymentId: string) => data?.keys.find((k) => k.payment_id === paymentId && k.status === "issued"), [data]);
  const rows = useMemo(() => (data?.payments ?? []).filter((p) => inFilter(p, filter)).filter((p) => {
    const s = q.trim().toLowerCase();
    return !s || [p.reference, p.description, p.payer_reference, p.payer_phone, school(p.school_id)?.name].some((v) => String(v ?? "").toLowerCase().includes(s));
  }), [data, filter, q, school]);
  const counts = useMemo(() => Object.fromEntries((["review", "approved", "activated", "rejected", "all"] as Filter[]).map((f) => [f, (data?.payments ?? []).filter((p) => inFilter(p, f)).length])), [data]);

  if (!isSuperAdmin) return <Alert><AlertDescription>Only Skavio platform administrators can open this page.</AlertDescription></Alert>;

  const viewProof = async (path: string) => {
    const tab = window.open("", "_blank");
    const { data: signed, error } = await supabase.storage.from("payment-proofs").createSignedUrl(path, 60);
    if (error || !signed) { tab?.close(); return toast({ title: "Could not open proof", description: error?.message, variant: "destructive" }); }
    if (tab) tab.location.href = signed.signedUrl; else window.location.href = signed.signedUrl;
  };

  const showKey = (payment: Row, k: { key: string; expires_at: string }) => {
    setIssued({ key: k.key, expires_at: k.expires_at, payment, school: school(payment.school_id) });
    setWaNumber(toWhatsAppNumber(schoolPhone(payment)) ?? "");
  };

  const review = async () => {
    if (!reviewing) return;
    const { payment, approve } = reviewing;
    if (!approve && !note.trim()) return toast({ title: "Give the school a reason", variant: "destructive" });
    setBusy(payment.id);
    const { data: res, error } = await supabase.rpc("billing_admin_review_payment", { _payment_id: payment.id, _approve: approve, _note: note });
    setBusy(null);
    if (error) return toast({ title: "Not saved", description: error.message, variant: "destructive" });
    setReviewing(null); setNote("");
    const r = res as { key?: string; expires_at?: string };
    if (approve && r.key) showKey(payment, { key: r.key, expires_at: r.expires_at! });
    else toast({ title: "Payment rejected", description: "The school sees the reason on its Activate Package page." });
    void load();
  };

  const reissue = async (payment: Row) => {
    if (!confirm("Issue a new key? The previous key for this payment stops working immediately.")) return;
    setBusy(payment.id);
    const { data: res, error } = await supabase.rpc("billing_admin_reissue_key", { _payment_id: payment.id });
    setBusy(null);
    if (error) return toast({ title: "Not issued", description: error.message, variant: "destructive" });
    const r = res as { key: string; expires_at: string };
    showKey(payment, r); void load();
  };

  const revoke = async (payment: Row) => {
    const k = liveKey(payment.id);
    if (!k || !confirm("Revoke this key? It will no longer activate anything. You can issue a new one later.")) return;
    setBusy(payment.id);
    const { error } = await supabase.rpc("billing_admin_revoke_key", { _key_id: k.id, _note: "Revoked by platform administrator" });
    setBusy(null);
    if (error) return toast({ title: "Not revoked", description: error.message, variant: "destructive" });
    toast({ title: "Key revoked" }); void load();
  };

  const keyMessage = issued ? activationKeyText({ schoolName: issued.school?.name, key: issued.key, description: issued.payment.description, reference: issued.payment.reference, expiresAt: issued.expires_at, activateUrl: `${window.location.origin}/activate` }) : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Payments &amp; Activation Keys</h1>
          <p className="text-muted-foreground">Verify mobile money payments, issue single-use activation keys and review the audit trail.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      {!data ? <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
        <Tabs defaultValue="payments">
          <TabsList><TabsTrigger value="payments">Payments</TabsTrigger><TabsTrigger value="audit">Audit log</TabsTrigger></TabsList>
          <TabsContent value="payments" className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {(["review", "approved", "activated", "rejected", "all"] as Filter[]).map((f) => (
                <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
                  {{ review: "To review", approved: "Key sent", activated: "Activated", rejected: "Rejected", all: "All" }[f]} ({counts[f]})
                </Button>
              ))}
              <div className="relative ml-auto w-full sm:w-72"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="School, reference, transaction ID…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            </div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>School</TableHead><TableHead>Package</TableHead><TableHead>Amount</TableHead><TableHead>Reference</TableHead>
                  <TableHead>Proof</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.length === 0 ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No payments here.</TableCell></TableRow> : rows.map((p) => {
                    const s = school(p.school_id); const k = liveKey(p.id);
                    return (
                      <TableRow key={p.id}>
                        <TableCell><p className="font-medium">{s?.name ?? "—"}</p><p className="text-xs text-muted-foreground">{schoolPhone(p) || s?.email || ""}</p></TableCell>
                        <TableCell className="max-w-[220px]"><p>{p.description}</p><p className="text-xs text-muted-foreground">Ordered {when(p.created_at)}</p></TableCell>
                        <TableCell className="whitespace-nowrap">{formatUGX(Number(p.amount))}</TableCell>
                        <TableCell><span className="font-mono text-xs">{p.reference}</span></TableCell>
                        <TableCell className="text-xs">
                          {p.payer_reference && <p>Txn: <span className="font-mono">{p.payer_reference}</span></p>}
                          {p.payer_phone && <p>From: {p.payer_phone}</p>}
                          {p.proof_path ? <Button size="sm" variant="link" className="h-auto p-0" onClick={() => viewProof(p.proof_path)}><Eye className="mr-1 h-3 w-3" />View screenshot</Button> : !p.payer_reference && <span className="text-muted-foreground">None in app</span>}
                          {p.proof_submitted_at && <p className="text-muted-foreground">{when(p.proof_submitted_at)}</p>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.review_status === "activated" ? "default" : p.review_status === "rejected" ? "destructive" : "outline"}>{REVIEW_LABELS[p.review_status as ReviewStatus] ?? p.review_status}</Badge>
                          {k && <p className="mt-1 text-xs text-muted-foreground">Key …{k.key_hint} · expires {when(k.expires_at)}</p>}
                          {p.review_note && <p className="mt-1 text-xs text-muted-foreground">Note: {p.review_note}</p>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex flex-wrap justify-end gap-1">
                            {["awaiting_proof", "submitted"].includes(p.review_status) && <>
                              <Button size="sm" disabled={busy === p.id} onClick={() => { setNote(""); setReviewing({ payment: p, approve: true }); }}><CheckCircle2 className="mr-1 h-4 w-4" />Approve</Button>
                              <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => { setNote(""); setReviewing({ payment: p, approve: false }); }}><XCircle className="mr-1 h-4 w-4" />Reject</Button>
                            </>}
                            {p.review_status === "approved" && <>
                              <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => reissue(p)}><KeyRound className="mr-1 h-4 w-4" />New key</Button>
                              {k && <Button size="sm" variant="ghost" disabled={busy === p.id} onClick={() => revoke(p)}><Ban className="mr-1 h-4 w-4" />Revoke</Button>}
                            </>}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
          <TabsContent value="audit">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Audit log</CardTitle><CardDescription>Latest 500 payment, key and activation events.</CardDescription></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Event</TableHead><TableHead>School</TableHead><TableHead>Order</TableHead><TableHead>By</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.audit.map((a) => {
                      const pay = data.payments.find((p) => p.id === a.payment_id);
                      const who = data.profiles.find((p) => p.id === a.actor);
                      return (
                        <TableRow key={a.id}>
                          <TableCell className="whitespace-nowrap text-xs">{when(a.created_at)}</TableCell>
                          <TableCell><Badge variant={a.action === "activation_failed" || a.action === "key_used_by_other_school" ? "destructive" : "outline"}>{ACTION_LABELS[a.action] ?? a.action}</Badge></TableCell>
                          <TableCell className="text-sm">{school(a.school_id)?.name ?? "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{pay?.reference ?? "—"}</TableCell>
                          <TableCell className="text-xs">{who?.email ?? (a.actor ? "User" : "System")}</TableCell>
                          <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground" title={JSON.stringify(a.details)}>
                            {a.details?.reason ? `Reason: ${a.details.reason}` : a.details?.note ? a.details.note : a.details?.hint ? `Key …${a.details.hint}` : a.details?.payer_reference ? `Txn ${a.details.payer_reference}` : ""}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewing?.approve ? "Approve payment and issue key" : "Reject payment"}</DialogTitle>
            <DialogDescription>{reviewing && `${school(reviewing.payment.school_id)?.name ?? ""} · ${reviewing.payment.description} · ${formatUGX(Number(reviewing.payment.amount))} · ${reviewing.payment.reference}`}</DialogDescription>
          </DialogHeader>
          {reviewing?.approve && <p className="text-sm">Only approve after confirming {formatUGX(Number(reviewing.payment.amount))} arrived on the Skavio line. A single-use key bound to this school and package is created and shown once.</p>}
          <div className="space-y-1"><Label htmlFor="review-note">{reviewing?.approve ? "Internal note (optional)" : "Reason shown to the school"}</Label>
            <Textarea id="review-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={reviewing?.approve ? "e.g. MTN txn 12345 confirmed" : "e.g. No payment with this transaction ID was received"} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(null)}>Cancel</Button>
            <Button variant={reviewing?.approve ? "default" : "destructive"} disabled={!!busy} onClick={review}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{reviewing?.approve ? "Approve & generate key" : "Reject payment"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!issued} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activation key for {issued?.school?.name ?? "the school"}</DialogTitle>
            <DialogDescription>This key is shown only now. Send it to the school; it works once, only for this school and package.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border bg-muted p-3">
            <code className="flex-1 break-all text-base font-semibold tracking-wider" data-testid="issued-key">{issued?.key}</code>
            <Button size="icon" variant="ghost" aria-label="Copy key" onClick={() => issued && navigator.clipboard?.writeText(issued.key).then(() => toast({ title: "Key copied" }))}><Copy className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-1"><Label htmlFor="wa-number">School WhatsApp number</Label>
            <Input id="wa-number" inputMode="tel" placeholder="2567XXXXXXXX" value={waNumber} onChange={(e) => setWaNumber(e.target.value)} />
            {!toWhatsAppNumber(waNumber) && <p className="text-xs text-muted-foreground">Enter a Ugandan mobile number (e.g. 0772 123456).</p>}</div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => navigator.clipboard?.writeText(keyMessage).then(() => toast({ title: "Message copied" }))}><Copy className="mr-2 h-4 w-4" />Copy message</Button>
            <Button asChild disabled={!toWhatsAppNumber(waNumber)}>
              <a href={toWhatsAppNumber(waNumber) ? whatsappLink(toWhatsAppNumber(waNumber)!, keyMessage) : undefined} target="_blank" rel="noopener noreferrer"
                aria-disabled={!toWhatsAppNumber(waNumber)} onClick={(e) => { if (!toWhatsAppNumber(waNumber)) e.preventDefault(); }}>
                <MessageCircle className="mr-2 h-4 w-4" />Send via WhatsApp
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
