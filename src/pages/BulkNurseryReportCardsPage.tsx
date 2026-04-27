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
  const sheetsRef = useRef<HTMLDivElement>(null);
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (!termId || !classId) return;
    (async () => {
      let q = supabase.from("nursery_learners" as any).select("id,full_name,stream_id").eq("class_id", classId).order("full_name");
      if (streamId) q = q.eq("stream_id", streamId);
      const { data } = await q;
      setLearners((data ?? []) as any);
      setLoading(false);
    })();
  }, [termId, classId, streamId]);

  useEffect(() => {
    if (loading || learners.length === 0) return;
    if (readyCount < learners.length) return;
    if (triggeredRef.current) return;
    if (mode === "preview") return;
    triggeredRef.current = true;
    const t = setTimeout(() => {
      if (mode === "print") window.print();
      else runBulkDownload();
    }, 800);
    return () => clearTimeout(t);
  }, [readyCount, learners.length, loading, mode]);

  const runBulkDownload = async () => {
    if (!sheetsRef.current) return;
    setWorking(true);
    setProgress(0);
    try {
      const pages = Array.from(sheetsRef.current.querySelectorAll<HTMLDivElement>(".nrc-page"));
      const zip = new JSZip();
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const learner = learners[i];
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
        const blob = pdf.output("blob");
        const safe = (learner?.full_name ?? `report-${i + 1}`).replace(/[^a-z0-9_\-\s]/gi, "_");
        zip.file(`${safe}.pdf`, blob);
        setProgress(Math.round(((i + 1) / pages.length) * 100));
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nursery-report-cards-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Download ready", description: `${pages.length} report card(s) packaged.` });
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (learners.length === 0) return <div className="p-8 text-center text-muted-foreground">No learners found for this class/stream.</div>;

  const allReady = readyCount >= learners.length;

  return (
    <div>
      <div className="no-print sticky top-0 z-10 bg-background border-b p-3 flex items-center justify-between gap-2">
        <div className="text-sm">
          <strong>{learners.length}</strong> nursery report(s) — {allReady ? "ready" : `loading ${readyCount}/${learners.length}…`}
          {working && <span className="ml-3 text-muted-foreground">Generating PDFs… {progress}%</span>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!allReady || working} onClick={() => window.print()}>
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
            onReady={() => setReadyCount(c => c + 1)}
          />
        ))}
      </div>
    </div>
  );
}
