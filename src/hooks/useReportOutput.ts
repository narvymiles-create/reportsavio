import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { useFeatures } from "@/contexts/FeaturesContext";
import { featureOffText, type FeatureKey } from "@/lib/features";
import {
  billingErrorMessage, chargeConfirmText, isBillingError, isFeatureDisabledError, pricingUrl, quoteReportCards, releaseReportCards,
  unlockReportOutput, type IssueQuote, type OutputAction, type ReportLevel,
} from "@/lib/billing/api";

export interface OutputRequest {
  level: ReportLevel;
  termId: string;
  learnerIds: string[];
  action: OutputAction;
  classId?: string;
  streamId?: string;
  /** Where "Back to report cards" returns after paying (defaults to the current page). */
  from?: string;
}

/**
 * Download / Print gate shared by every report-card page. Locked actions go to the pricing page with the
 * school's selection preserved; pay-per-report schools confirm before Learners are used; feature switches
 * are checked here and again in the database.
 */
export function useReportOutput() {
  const navigate = useNavigate();
  const location = useLocation();
  const { enabled } = useFeatures();

  const goToPricing = useCallback((r: OutputRequest, reason?: string) => {
    toast({ title: "Unpaid preview", description: "Choose a package to unlock download and printing. Your selection is kept." });
    navigate(pricingUrl({ level: r.level, termId: r.termId, count: r.learnerIds.length, classId: r.classId, streamId: r.streamId,
      from: r.from ?? `${location.pathname}${location.search}`, reason }));
  }, [navigate, location.pathname, location.search]);

  const ensure = useCallback(async (r: OutputRequest): Promise<IssueQuote | null> => {
    for (const key of [`${r.level}_reports`, r.action] as FeatureKey[]) {
      if (!enabled(key)) { toast({ title: "Not available", description: featureOffText(key), variant: "destructive" }); return null; }
    }
    if (!r.termId || !r.learnerIds.length) return null;
    try {
      const q = await quoteReportCards(r.level, r.termId, r.learnerIds);
      if (!q.allowed) { goToPricing(r, q.reason); return null; }
      if (q.credits_needed > 0 && !window.confirm(chargeConfirmText(q))) return null;
      return await unlockReportOutput(r.level, r.termId, r.learnerIds, r.action);
    } catch (e) {
      if (isBillingError(e) && !isFeatureDisabledError(e)) { goToPricing(r); return null; }
      toast({ title: "Not available", description: billingErrorMessage(e), variant: "destructive" });
      return null;
    }
  }, [enabled, goToPricing]);

  /** Unlocks, runs the output, and gives Learners back for any cards that failed to produce. */
  const run = useCallback(async <T,>(r: OutputRequest, output: () => Promise<T>, failedIds?: (result: T) => string[]): Promise<T | null> => {
    const issued = await ensure(r);
    if (!issued) return null;
    try {
      const result = await output();
      if (failedIds && (issued.charged ?? 0) > 0) await releaseReportCards(r.level, r.termId, failedIds(result));
      return result;
    } catch (e) {
      if ((issued.charged ?? 0) > 0) await releaseReportCards(r.level, r.termId, r.learnerIds);
      throw e;
    }
  }, [ensure]);

  return { ensure, run, goToPricing };
}

/** Whether an on-screen preview must carry the unpaid watermark (null while checking). */
export function useReportAccess(level: ReportLevel, termId: string | undefined, learnerIds: string[]) {
  const key = `${level}|${termId}|${learnerIds.join(",")}`;
  const [state, setState] = useState<{ key: string; quote: IssueQuote | null; watermark: boolean | null }>({ key: "", quote: null, watermark: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if (!termId || !learnerIds.length) { setState({ key, quote: null, watermark: false }); return; }
    setState((s) => ({ ...s, watermark: s.key === key ? s.watermark : null }));
    quoteReportCards(level, termId, learnerIds)
      .then((quote) => { if (!cancelled) setState({ key, quote, watermark: !quote.paid }); })
      // If the check itself fails, downloads stay locked by the database anyway.
      .catch(() => { if (!cancelled) setState({ key, quote: null, watermark: false }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  const current = state.key === key ? state : { quote: null, watermark: null };
  return { ...current, refresh: () => setTick((t) => t + 1) };
}
