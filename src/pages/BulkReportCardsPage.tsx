import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";
import { ReportCardSheet } from "@/components/ReportCardSheet";
import { waitForImagesAndFonts } from "@/lib/reportAssets";
import { toast } from "@/hooks/use-toast";
import "./PrintReportCard.css";

type Learner = { id: string; full_name: string };

export default function BulkReportCardsPage() {
  const { termId, classId } = useParams<{ termId: string; classId: string }>();
  const [params] = useSearchParams();
  const autoPrint = params.get("mode") === "print";

  const [learners, setLearners] = useState<Learner[]>([]);
  const [readyCount, setReadyCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const sheetsRef = useRef<HTMLDivElement>(null);
  const triggeredRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!termId || !classId) return;
    (async () => {
      try {
        const { data: rcs, error: e1 } = await supabase
          .from("report_cards")
          .select("learner_id")
          .eq("term_id", termId)
          .eq("class_id", classId);
        if (e1) throw e1;
        const ids = (rcs ?? []).map((r: any) => r.learner_id);
        if (ids.length === 0) {
          if (mountedRef.current) { setLearners([]); setLoading(false); }
          return;
        }
        const { data: ls, error: e2 } = await supabase
          .from("learners")
          .select("id,full_name")
          .in("id", ids)
          .order("full_name");
        if (e2) throw e2;
        if (!mountedRef.current) return;
        setLearners((ls ?? []) as Learner[]);
      } catch (err: any) {
        if (mountedRef.current) setErrorMsg(err.message || "Failed to load learners");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
  }, [termId, classId]);

  useEffect(() => {
    if (loading || learners.length === 0) return;
    if (readyCount < learners.length) return;
    if (triggeredRef.current) return;
    if (!autoPrint) return;
    triggeredRef.current = true;
    const t = setTimeout(() => { if (mountedRef.current) runBulkPrint(); }, 1000);
    return () => clearTimeout(t);
  }, [readyCount, learners.length, loading, autoPrint]);

  const runBulkPrint = async () => {
    if (!learners.length) return toast({ title: "No learners available", variant: "destructive" });
    if (readyCount < learners.length || !sheetsRef.current) return toast({ title: "Please wait, report still loading" });
    try {
      await waitForImagesAndFonts(sheetsRef.current);
      document.body.classList.add("bulk-report-printing");
      const cleanup = () => {
        document.body.classList.remove("bulk-report-printing");
        window.removeEventListener("afterprint", cleanup);
      };
      window.addEventListener("afterprint", cleanup);
      setTimeout(() => window.print(), 100);
    } catch (e: any) {
      document.body.classList.remove("bulk-report-printing");
      toast({ title: "Print failed", description: e.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    return () => { document.body.classList.remove("bulk-report-printing"); };
  }, []);

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (errorMsg) return <div className="p-8 text-center text-destructive">{errorMsg}</div>;
  if (learners.length === 0) return <div className="p-8 text-center text-muted-foreground">No generated report cards found for this class & term.</div>;

  const allReady = readyCount >= learners.length;

  return (
    <div className="print-root">
      <div className="no-print sticky top-0 z-10 bg-background border-b p-3 flex items-center justify-between gap-2">
        <div className="text-sm">
          <strong>{learners.length}</strong> report card(s) — {allReady ? "ready" : `loading ${readyCount}/${learners.length}…`}
        </div>
        <Button disabled={!allReady} onClick={runBulkPrint}>
          <Printer className="mr-2 h-4 w-4" /> Print
        </Button>
      </div>

      <div ref={sheetsRef}>
        {learners.map((l, i) => (
          <ReportCardSheet
            key={l.id}
            learnerId={l.id}
            termId={termId!}
            pageBreak={i < learners.length - 1}
            onReady={() => { if (mountedRef.current) setReadyCount(c => c + 1); }}
          />
        ))}
      </div>
    </div>
  );
}
