import { ReactNode, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { billingErrorMessage, issueReportCards, quoteBlockedText, quoteReportCards, type IssueQuote, type ReportLevel } from "@/lib/billing/api";

interface Props {
  level: ReportLevel;
  termId: string;
  learnerIds: string[];
  /** When false, only already-generated (or free) report cards are shown — never charges. */
  allowCharge?: boolean;
  children: ReactNode;
}

/**
 * Shows report output only for report cards that are issued for this term. Already generated
 * cards (reprints/downloads) are always free; new pay-per-report cards ask before using credits.
 */
export function ReportIssueGate({ level, termId, learnerIds, allowCharge = true, children }: Props) {
  const key = `${level}|${termId}|${learnerIds.join(",")}`;
  const [state, setState] = useState<"checking" | "confirm" | "blocked" | "ready" | "error">("checking");
  const [quote, setQuote] = useState<IssueQuote | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    setState("checking");
    try {
      if (!learnerIds.length) { setState("ready"); return; }
      const q = await quoteReportCards(level, termId, learnerIds);
      setQuote(q);
      if (!q.allowed) { setMessage(quoteBlockedText(q)); setState("blocked"); return; }
      if (q.credits_needed > 0) {
        if (!allowCharge) { setMessage(quoteBlockedText({ ...q, reason: "not_generated" })); setState("blocked"); return; }
        setState("confirm"); return;
      }
      if (q.new > 0) await issueReportCards(level, termId, learnerIds, false);
      setState("ready");
    } catch (e) {
      setMessage(billingErrorMessage(e));
      setState("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, allowCharge]);

  useEffect(() => { check(); }, [check]);

  const confirm = async () => {
    setBusy(true);
    try { await issueReportCards(level, termId, learnerIds, true); setState("ready"); }
    catch (e) { setMessage(billingErrorMessage(e)); setState("blocked"); }
    finally { setBusy(false); }
  };

  if (state === "ready") return <>{children}</>;
  if (state === "checking") return <div className="flex items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  return (
    <div className="no-print mx-auto my-6 max-w-lg rounded-md border p-4 text-sm space-y-3">
      <p className="flex items-center gap-2 font-medium"><Ticket className="h-4 w-4" />{state === "confirm" ? "Generate new report card(s)" : "Report card not available yet"}</p>
      {state === "confirm" && quote ? (
        <>
          <p className="text-muted-foreground">
            {quote.new} new report card(s) for Term {quote.term_number} {quote.academic_year} will use {quote.credits_needed} credit(s) (UGX {(quote.credits_needed * 500).toLocaleString("en-US")}).
            You have {quote.balance} credit(s). {quote.already_issued > 0 && `${quote.already_issued} card(s) are already generated and stay free.`}
          </p>
          <Button onClick={confirm} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Generate and use {quote.credits_needed} credit(s)</Button>
        </>
      ) : (
        <>
          <p className="text-muted-foreground">{message}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={check}>Try again</Button>
            <Button asChild size="sm"><Link to="/billing">Billing & Subscription</Link></Button>
          </div>
        </>
      )}
    </div>
  );
}
