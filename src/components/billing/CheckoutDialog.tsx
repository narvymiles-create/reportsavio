import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Loader2, Smartphone, ExternalLink, XCircle } from "lucide-react";
import { formatUGX, invokeBilling } from "@/lib/billing/api";

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

type Phase = "choose" | "starting" | "waiting" | "paid" | "failed";

export function CheckoutDialog({ open, onOpenChange, title, amount, lines = [], request, onSettled }: Props) {
  const [channel, setChannel] = useState<"hosted_checkout" | "mobile_money">("hosted_checkout");
  const [msisdn, setMsisdn] = useState("");
  const [phase, setPhase] = useState<Phase>("choose");
  const [message, setMessage] = useState("");
  const [requestId, setRequestId] = useState("");
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) { setPhase("choose"); setMessage(""); setRequestId(crypto.randomUUID()); }
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [open, request]);

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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Payments are processed securely by IntesaPay. Your service is activated only after IntesaPay confirms the payment.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-md border p-3 text-sm">
          {lines.map((l) => (
            <div key={l.label} className="flex justify-between gap-4"><span className="text-muted-foreground">{l.label}</span><span className="text-right">{l.value}</span></div>
          ))}
          <div className="flex justify-between gap-4 border-t pt-2 font-semibold"><span>Total</span><span>{formatUGX(amount)}</span></div>
        </div>

        {phase === "choose" || phase === "starting" ? (
          <div className="space-y-3">
            <RadioGroup value={channel} onValueChange={(v) => setChannel(v as typeof channel)} className="space-y-2">
              <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
                <RadioGroupItem value="hosted_checkout" className="mt-1" />
                <span><span className="font-medium flex items-center gap-1">IntesaPay checkout page <ExternalLink className="h-3 w-3" /></span>
                  <span className="block text-xs text-muted-foreground">MTN Mobile Money, Airtel Money, or card where enabled.</span></span>
              </label>
              <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
                <RadioGroupItem value="mobile_money" className="mt-1" />
                <span><span className="font-medium flex items-center gap-1">Mobile money prompt <Smartphone className="h-3 w-3" /></span>
                  <span className="block text-xs text-muted-foreground">We send an approval prompt to your MTN or Airtel phone.</span></span>
              </label>
            </RadioGroup>
            {channel === "mobile_money" && (
              <div className="space-y-1">
                <Label htmlFor="msisdn">MTN or Airtel number</Label>
                <Input id="msisdn" inputMode="tel" placeholder="0772 123456" value={msisdn} onChange={(e) => setMsisdn(e.target.value)} />
              </div>
            )}
          </div>
        ) : null}

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
              {phase === "starting" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Pay {formatUGX(amount)}
            </Button>
          )}
          {phase === "failed" && <Button variant="outline" onClick={() => { setRequestId(crypto.randomUUID()); setPhase("choose"); }}>Try again</Button>}
          {(phase === "paid" || phase === "waiting") && <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
