import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Loader2, Smartphone, ExternalLink, XCircle, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatUGX, invokeBilling } from "@/lib/billing/api";
import { SKAVIO_PAYMENT_NUMBER } from "@/lib/billing/manual";
import { ManualPaymentPanel, type ManualOrder } from "./ManualPaymentPanel";

export interface CheckoutRequest {
  product: "online_term" | "online_annual" | "online_upgrade" | "report_credits" | "desktop_licence" | "desktop_upgrade" | "quote";
  tier?: string; academic_year?: number; term_number?: number; subscription_id?: string; licence_id?: string; quantity?: number; quote_id?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  amount: number;
  lines?: { label: string; value: string }[];
  request: CheckoutRequest | null;
  onSettled?: () => void;
}

type Phase = "choose" | "starting" | "waiting" | "paid" | "failed" | "manual";
type Channel = "manual" | "hosted_checkout" | "mobile_money";

export function CheckoutDialog({ open, onOpenChange, title, amount, lines = [], request, onSettled }: Props) {
  const { schoolId } = useAuth();
  const [channel, setChannel] = useState<Channel>("manual");
  const [gateway, setGateway] = useState(false);
  const [order, setOrder] = useState<ManualOrder | null>(null);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [msisdn, setMsisdn] = useState("");
  const [phase, setPhase] = useState<Phase>("choose");
  const [message, setMessage] = useState("");
  const [requestId, setRequestId] = useState("");
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) { setPhase("choose"); setMessage(""); setRequestId(crypto.randomUUID()); setOrder(null); setChannel("manual"); }
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [open, request]);

  useEffect(() => {
    if (!open) return;
    // The automated gateway is offered only once it is configured; manual mobile money always works.
    invokeBilling<{ configured: boolean }>({ action: "status" }).then((s) => setGateway(!!s.configured)).catch(() => setGateway(false));
    if (schoolId) supabase.from("schools").select("name").eq("id", schoolId).maybeSingle().then(({ data }) => setSchoolName(data?.name ?? null));
  }, [open, schoolId]);

  const poll = (paymentId: string) => {
    const started = Date.now();
    pollRef.current = window.setInterval(async () => {
      try {
        const res = await invokeBilling<{ status: string; payment?: { failure_message?: string } }>({ action: "verify", payment_id: paymentId });
        if (res.status === "successful") {
          window.clearInterval(pollRef.current!); setPhase("paid"); onSettled?.();
        } else if (["failed", "cancelled", "mismatch"].includes(res.status)) {
          window.clearInterval(pollRef.current!); setPhase("failed");
          setMessage(res.payment?.failure_message || "The payment was not completed. Nothing was activated.");
          onSettled?.();
        } else if (Date.now() - started > 4 * 60_000) {
          window.clearInterval(pollRef.current!); setPhase("failed");
          setMessage("We have not received confirmation yet. If money left your account, it will be applied automatically once IntesaPay confirms it.");
        }
      } catch { /* keep polling */ }
    }, 4000);
  };

  const pay = async () => {
    if (!request) return;
    setPhase("starting"); setMessage("");
    if (channel === "manual") {
      try {
        const res = await invokeBilling<{ payment_id: string; reference: string; amount: number; description: string }>({
          action: "create", ...request, channel: "manual", client_request_id: requestId,
        });
        setOrder({ id: res.payment_id, reference: res.reference, amount: Number(res.amount), description: res.description, review_status: "awaiting_proof" });
        setPhase("manual"); onSettled?.();
      } catch (e) {
        setPhase("failed"); setMessage(e instanceof Error ? e.message : "The order could not be created.");
      }
      return;
    }
    try {
      const res = await invokeBilling<{ payment_id: string; checkout_url?: string | null; status: string }>({
        action: "create", ...request, channel, msisdn: channel === "mobile_money" ? msisdn : undefined,
        client_request_id: requestId, return_origin: window.location.origin,
      });
      if (res.status === "successful") { setPhase("paid"); onSettled?.(); return; }
      if (channel === "hosted_checkout" && res.checkout_url) { window.location.href = res.checkout_url; return; }
      setPhase("waiting");
      poll(res.payment_id);
    } catch (e) {
      setPhase("failed");
      setMessage(e instanceof Error ? e.message : "The payment could not be started.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (phase !== "starting") onOpenChange(o); }}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{channel === "manual"
            ? "Your package is activated only after Skavio verifies your payment and you enter the activation key you receive."
            : "Payments are processed securely by IntesaPay. Your service is activated only after IntesaPay confirms the payment."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-md border p-3 text-sm">
          {lines.map((l) => (
            <div key={l.label} className="flex justify-between gap-4"><span className="text-muted-foreground">{l.label}</span><span className="text-right">{l.value}</span></div>
          ))}
          <div className="flex justify-between gap-4 border-t pt-2 font-semibold"><span>Total</span><span>{formatUGX(amount)}</span></div>
        </div>

        {phase === "choose" || phase === "starting" ? (
          <div className="space-y-3">
            <RadioGroup value={channel} onValueChange={(v) => setChannel(v as Channel)} className="space-y-2">
              <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
                <RadioGroupItem value="manual" className="mt-1" />
                <span><span className="font-medium flex items-center gap-1">Mobile money to Skavio <Wallet className="h-3 w-3" /></span>
                  <span className="block text-xs text-muted-foreground">Pay {SKAVIO_PAYMENT_NUMBER}, send your proof, then activate with the key Skavio sends you.</span></span>
              </label>
              {gateway && <><label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
                <RadioGroupItem value="hosted_checkout" className="mt-1" />
                <span><span className="font-medium flex items-center gap-1">IntesaPay checkout page <ExternalLink className="h-3 w-3" /></span>
                  <span className="block text-xs text-muted-foreground">MTN Mobile Money, Airtel Money, or card where enabled.</span></span>
              </label>
              <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
                <RadioGroupItem value="mobile_money" className="mt-1" />
                <span><span className="font-medium flex items-center gap-1">Mobile money prompt <Smartphone className="h-3 w-3" /></span>
                  <span className="block text-xs text-muted-foreground">We send an approval prompt to your MTN or Airtel phone.</span></span>
              </label></>}
            </RadioGroup>
            {channel === "mobile_money" && (
              <div className="space-y-1">
                <Label htmlFor="msisdn">MTN or Airtel number</Label>
                <Input id="msisdn" inputMode="tel" placeholder="0772 123456" value={msisdn} onChange={(e) => setMsisdn(e.target.value)} />
              </div>
            )}
          </div>
        ) : null}

        {phase === "manual" && order && (
          <div className="space-y-2">
            <p className="text-sm">Order reference <strong className="font-mono">{order.reference}</strong> created. Nothing is activated until your payment is verified.</p>
            <ManualPaymentPanel order={order} schoolName={schoolName} onSubmitted={onSettled} />
          </div>
        )}
        {phase === "waiting" && (
          <Alert><Loader2 className="h-4 w-4 animate-spin" /><AlertDescription>Approve the payment prompt on your phone and enter your PIN. This window updates automatically.</AlertDescription></Alert>
        )}
        {phase === "paid" && (
          <Alert><CheckCircle2 className="h-4 w-4" /><AlertDescription>Payment confirmed. Your account has been updated and a receipt is available under Payments.</AlertDescription></Alert>
        )}
        {phase === "failed" && (
          <Alert variant="destructive"><XCircle className="h-4 w-4" /><AlertDescription>{message}</AlertDescription></Alert>
        )}

        <DialogFooter>
          {(phase === "choose" || phase === "starting") && (
            <Button onClick={pay} disabled={phase === "starting" || !request || (channel === "mobile_money" && msisdn.trim().length < 9)}>
              {phase === "starting" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {channel === "manual" ? `Get payment instructions · ${formatUGX(amount)}` : `Pay ${formatUGX(amount)}`}
            </Button>
          )}
          {phase === "failed" && <Button variant="outline" onClick={() => { setRequestId(crypto.randomUUID()); setPhase("choose"); }}>Try again</Button>}
          {(phase === "paid" || phase === "waiting" || phase === "manual") && <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
