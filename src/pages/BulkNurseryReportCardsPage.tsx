import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, Download } from "lucide-react";
import { NurseryReportSheet } from "@/components/NurseryReportSheet";
import { downloadElementsAsZip, safeFileName } from "@/lib/pdfExport";
import { waitForImagesAndFonts } from "@/lib/reportAssets";
import { toast } from "@/hooks/use-toast";

type Learner = { id: string; full_name: string; stream_id: string | null };

const BATCH_SIZE = 5;

export default function BulkNurseryReportCardsPage() {
  const { termId, classId } = useParams<{ termId: string; classId: string }>();
  const [params] = useSearchParams();
  const mode = (params.get("mode") as "preview" | "print" | "download") || "preview";
  const streamId = params.get("stream") || "";

  const [learners, setLearners] = useState<Learner[]>([]);
  const [readyCount, setReadyCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const sheetsRef = useRef<HTMLDivElement>(null);
  const triggeredRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

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
        let q = supabase.from("nursery_learners" as any).select("id,full_name,stream_id").eq("class_id", classId).order("full_name");
        if (streamId) q = q.eq("stream_id", streamId);
        const { data, error } = await q;
        if (error) throw error;
        if (!mountedRef.current) return;
        setLearners((data ?? []) as any);
      } catch (err: any) {
        console.error("[BulkNursery] load failed", err);
        if (mountedRef.current) setErrorMsg(err.message || "Failed to load learners");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
  }, [termId, classId, streamId]);

  useEffect(() => {
    if (loading || learners.length === 0) return;
    if (readyCount < learners.length) return;
    if (triggeredRef.current) return;
    if (mode === "preview") return;
    triggeredRef.current = true;
    const t = setTimeout(() => {
      if (!mountedRef.current) return;
      if (mode === "print") {
        runBulkPrint();
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
      const pages = Array.from(sheetsRef.current.querySelectorAll<HTMLDivElement>(".nrc-page"));
      await waitForImagesAndFonts(sheetsRef.current);
      console.log(`[BulkNursery] Starting ZIP for ${pages.length} learner(s)`);
      const jobs = pages.map((element, j) => {
        const safe = safeFileName(learners[j]?.full_name ?? `report-${j + 1}`, `report-${j + 1}`);
        return { element, filename: `${safe}.pdf` };
      });
      const { failures } = await downloadElementsAsZip(
        jobs,
        `nursery-report-cards-${new Date().toISOString().slice(0, 10)}.zip`,
        (done, total, current) => {
          if (!mountedRef.current) return;
          setStatusMsg(`Processing ${done} of ${total}: ${current}`);
          setProgress(Math.round((done / total) * 100));
        }
      );
      if (failures.length > 0) {
        toast({ title: "Some reports failed", description: `${failures.length} failed`, variant: "destructive" });
      } else {
        toast({ title: "Download ready", description: `${pages.length} report card(s) packaged.` });
      }
    } catch (e: any) {
      console.error("[BulkNursery] fatal", e);
      if (mountedRef.current) setErrorMsg(e.message || "Bulk download failed");
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    } finally {
      if (mountedRef.current) {
        setWorking(false);
        setStatusMsg("");
      }
    }
  };

  const runBulkPrint = async () => {
    if (!learners || learners.length === 0) {
      toast({ title: "No learners available for report generation", variant: "destructive" });
      return;
    }
    if (readyCount < learners.length || !sheetsRef.current) {
      toast({ title: "Please wait, report still loading" });
      return;
    }
    try {
      await waitForImagesAndFonts(sheetsRef.current);
      window.print();
    } catch (e: any) {
      toast({ title: "Print failed", description: e.message, variant: "destructive" });
    }
  };

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (errorMsg) return <div className="p-8 text-center text-destructive">{errorMsg}</div>;
  if (learners.length === 0) return <div className="p-8 text-center text-muted-foreground">No learners found for this class/stream.</div>;

  const allReady = readyCount >= learners.length;

  return (
    <div>
      <div className="no-print sticky top-0 z-10 bg-background border-b p-3 flex items-center justify-between gap-2">
        <div className="text-sm">
          <strong>{learners.length}</strong> nursery report(s) — {allReady ? "ready" : `loading ${readyCount}/${learners.length}…`}
          {working && <span className="ml-3 text-muted-foreground">{statusMsg || "Working..."} {progress}%</span>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!allReady || working} onClick={runBulkPrint}>
            <Printer className="mr-2 h-4 w-4" /> Print All
          </Button>
          <Button disabled={!allReady || working} onClick={runBulkDownload}>
            {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download ZIP
          </Button>
        </div>
      </div>

      <div ref={sheetsRef}>
        {learners.map((l, i) => (
          <NurseryReportSheet
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
