import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Copy, KeyRound, Loader2, MessageCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { formatUGX } from "@/lib/billing/api";
import {
  SKAVIO_PAYMENT_NUMBER, SKAVIO_WHATSAPP, paymentConfirmationText, submitPaymentProof, validateProofFile, whatsappLink, type ReviewStatus,
} from "@/lib/billing/manual";

export interface ManualOrder { id: string; reference: string; description: string; amount: number; review_status: ReviewStatus | null; review_note?: string | null }

const copy = (text: string, what: string) => navigator.clipboard?.writeText(text).then(() => toast({ title: `${what} copied` }), () => undefined);

/** Payment instructions for a manual order, plus the in-app proof form (transaction ID and/or screenshot). */
export function ManualPaymentPanel({ order, schoolName, onSubmitted }: { order: ManualOrder; schoolName?: string | null; onSubmitted?: () => void }) {
  const { schoolId } = useAuth();
  const [payerReference, setPayerReference] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(order.review_status === "submitted");
  const canEdit = order.review_status === "awaiting_proof" || order.review_status === "submitted";

  const submit = async () => {
    if (!schoolId) return;
    if (!payerReference.trim() && !file) return toast({ title: "Add your proof", description: "Enter the transaction ID or attach the screenshot.", variant: "destructive" });
    setBusy(true);
    try {
      await submitPaymentProof({ schoolId, paymentId: order.id, payerReference, payerPhone, file });
      setSent(true); setFile(null); setPayerReference("");
      toast({ title: "Proof sent", description: "Skavio will verify your payment and send your activation key by WhatsApp." });
      onSubmitted?.();
    } catch (e) {
      toast({ title: "Could not send proof", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 text-sm">
      <ol className="list-decimal space-y-2 pl-5">
        <li>Send <strong>{formatUGX(order.amount)}</strong> by mobile money to <strong className="whitespace-nowrap">{SKAVIO_PAYMENT_NUMBER}</strong>
          <Button type="button" variant="ghost" size="icon" className="ml-1 h-6 w-6" aria-label="Copy payment number" onClick={() => copy(SKAVIO_PAYMENT_NUMBER, "Payment number")}><Copy className="h-3 w-3" /></Button>
          <span className="block text-xs text-muted-foreground">Use your order reference <strong className="font-mono">{order.reference}</strong> as the payment reason if your network allows it.</span></li>
        <li>Send the confirmation and a screenshot of the transaction to Skavio Technologies on WhatsApp, or attach it below.</li>
        <li>Skavio verifies the payment and sends you a single-use activation key. Enter it on the <Link to="/activate" className="underline">Activate Package</Link> page.</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={whatsappLink(SKAVIO_WHATSAPP, paymentConfirmationText({ schoolName, reference: order.reference, description: order.description, amount: order.amount }))} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="mr-2 h-4 w-4" />WhatsApp Skavio Technologies
          </a>
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => copy(order.reference, "Reference")}><Copy className="mr-2 h-4 w-4" />Copy reference</Button>
      </div>

      {canEdit && (
        <div className="space-y-2 rounded-md border p-3">
          <p className="font-medium">Submit your payment proof in the app</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor={`ref-${order.id}`}>Transaction ID</Label>
              <Input id={`ref-${order.id}`} maxLength={80} placeholder="e.g. 123456789" value={payerReference} onChange={(e) => setPayerReference(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor={`phone-${order.id}`}>Number you paid from</Label>
              <Input id={`phone-${order.id}`} inputMode="tel" maxLength={20} placeholder="07XX XXXXXX" value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label htmlFor={`file-${order.id}`}>Transaction screenshot (PNG, JPG or PDF, up to 5 MB)</Label>
            <Input id={`file-${order.id}`} type="file" accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(e) => { const f = e.target.files?.[0] ?? null; const problem = f && validateProofFile(f); if (problem) { toast({ title: problem, variant: "destructive" }); e.target.value = ""; setFile(null); } else setFile(f); }} /></div>
          <Button type="button" size="sm" onClick={submit} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}{sent ? "Send more proof" : "Send proof"}</Button>
          {sent && <p className="flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="h-3 w-3" />Proof received. You'll get your activation key by WhatsApp once Skavio verifies the payment.</p>}
        </div>
      )}
      {order.review_status === "approved" && (
        <Alert><KeyRound className="h-4 w-4" /><AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>Payment verified. Enter the activation key Skavio sent you.</span>
          <Button asChild size="sm"><Link to="/activate">Activate package</Link></Button></AlertDescription></Alert>
      )}
    </div>
  );
}
