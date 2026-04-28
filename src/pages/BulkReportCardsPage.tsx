import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, Download } from "lucide-react";
import { ReportCardSheet } from "@/components/ReportCardSheet";
import { downloadElementsAsZip, safeFileName } from "@/lib/pdfExport";
import { toast } from "@/hooks/use-toast";
import "./PrintReportCard.css";

type Learner = { id: string; full_name: string };

const BATCH_SIZE = 5;

export default function BulkReportCardsPage() {
  const { termId, classId } = useParams<{ termId: string; classId: string }>();
  const [params] = useSearchParams();
  const mode = params.get("mode") === "download" ? "download" : "print";

  const [learners, setLearners] = useState<Learner[]>([]);
  const [readyCount, setReadyCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const sheetsRef = useRef<HTMLDivElement>(null);
  const triggeredRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Block accidental tab close while working
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (working) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [working]);

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
        console.error("[BulkReports] load failed", err);
        if (mountedRef.current) setErrorMsg(err.message || "Failed to load learners");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
  }, [termId, classId]);

  // Auto-trigger only after ALL sheets are ready, and only once
  useEffect(() => {
    if (loading || learners.length === 0) return;
    if (readyCount < learners.length) return;
    if (triggeredRef.current) return;
    triggeredRef.current = true;

    const t = setTimeout(() => {
      if (!mountedRef.current) return;
      if (mode === "print") {
        try { window.print(); } catch (e) { console.error(e); }
      } else {
        runBulkDownload();
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [readyCount, learners.length, loading, mode]);

  const runBulkDownload = async () => {
    if (!sheetsRef.current) return;
    if (!learners || learners.length === 0) {
      toast({ title: "No learners available for report generation", variant: "destructive" });
      return;
    }
    setWorking(true);
    setProgress(0);
    setErrorMsg("");
    setStatusMsg("Generating reports, please wait...");
    try {
      const pages = Array.from(sheetsRef.current.querySelectorAll<HTMLDivElement>(".report-page"));
      console.log(`[BulkReports] Starting ZIP for ${pages.length} learner(s)`);
      const jobs = pages.map((element, j) => {
        const safeName = safeFileName(learners[j]?.full_name ?? `report-${j + 1}`, `report-${j + 1}`);
        return { element, filename: `${safeName}.pdf` };
      });
      const { failures } = await downloadElementsAsZip(
        jobs,
        `report-cards-${new Date().toISOString().slice(0, 10)}.zip`,
        (done, total, current) => {
          if (!mountedRef.current) return;
          setStatusMsg(`Processing ${done} of ${total}: ${current}`);
          setProgress(Math.round((done / total) * 100));
        }
      );
      console.log("[BulkReports] ZIP delivered");
      if (failures.length > 0) {
        toast({
          title: "Some reports failed",
          description: `${failures.length} failed: ${failures.slice(0, 3).join(", ")}${failures.length > 3 ? "…" : ""}`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Download ready", description: `${pages.length} report card(s) packaged.` });
      }
    } catch (e: any) {
      console.error("[BulkReports] fatal", e);
      if (mountedRef.current) setErrorMsg(e.message || "Bulk download failed");
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    } finally {
      if (mountedRef.current) {
        setWorking(false);
        setStatusMsg("");
      }
    }
  };

  const runBulkPrint = () => {
    if (!learners || learners.length === 0) {
      toast({ title: "No learners available for report generation", variant: "destructive" });
      return;
    }
    try { window.print(); } catch (e: any) {
      toast({ title: "Print failed", description: e.message, variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (errorMsg) {
    return <div className="p-8 text-center text-destructive">{errorMsg}</div>;
  }
  if (learners.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">No generated report cards found for this class & term.</div>;
  }

  const allReady = readyCount >= learners.length;

  return (
    <div className="print-root">
      <div className="no-print sticky top-0 z-10 bg-background border-b p-3 flex items-center justify-between gap-2">
        <div className="text-sm">
          <strong>{learners.length}</strong> report card(s) — {allReady ? "ready" : `loading ${readyCount}/${learners.length}…`}
          {working && (
            <span className="ml-3 text-muted-foreground">
              {statusMsg || "Working..."} {progress}%
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!allReady || working} onClick={runBulkPrint}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
          <Button disabled={!allReady || working} onClick={runBulkDownload}>
            {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download ZIP
          </Button>
        </div>
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
