import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, Download } from "lucide-react";
import { NurseryReportSheet } from "@/components/NurseryReportSheet";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import JSZip from "jszip";
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
        try { window.print(); } catch (e) { console.error(e); }
      } else {
        runBulkDownload();
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [readyCount, learners.length, loading, mode]);

  const renderPageToPdfBlob = async (page: HTMLDivElement): Promise<Blob> => {
    const canvas = await html2canvas(page, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    const ratio = canvas.width / canvas.height;
    let w = pageW, h = pageW / ratio;
    if (h > pageH) { h = pageH; w = pageH * ratio; }
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    pdf.addImage(imgData, "JPEG", x, y, w, h, undefined, "FAST");
    return pdf.output("blob");
  };

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
    const failures: string[] = [];
    try {
      const pages = Array.from(sheetsRef.current.querySelectorAll<HTMLDivElement>(".nrc-page"));
      console.log(`[BulkNursery] Starting ZIP for ${pages.length} learner(s)`);
      const zip = new JSZip();

      for (let i = 0; i < pages.length; i += BATCH_SIZE) {
        const batchEnd = Math.min(i + BATCH_SIZE, pages.length);
        setStatusMsg(`Processing ${i + 1}–${batchEnd} of ${pages.length}...`);
        for (let j = i; j < batchEnd; j++) {
          if (!mountedRef.current) return;
          const page = pages[j];
          const learner = learners[j];
          try {
            const blob = await renderPageToPdfBlob(page);
            const safe = (learner?.full_name ?? `report-${j + 1}`).replace(/[^a-z0-9_\-\s]/gi, "_");
            zip.file(`${safe}.pdf`, blob);
            console.log(`[BulkNursery] ✓ ${safe}`);
          } catch (err) {
            console.error(`[BulkNursery] ✗ Failed for ${learner?.full_name}`, err);
            failures.push(learner?.full_name ?? `#${j + 1}`);
          }
          setProgress(Math.round(((j + 1) / pages.length) * 100));
          await new Promise(r => setTimeout(r, 30));
        }
      }

      setStatusMsg("Packaging ZIP...");
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nursery-report-cards-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

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

  const runBulkPrint = () => {
    if (!learners || learners.length === 0) {
      toast({ title: "No learners available for report generation", variant: "destructive" });
      return;
    }
    try { window.print(); } catch (e: any) {
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
