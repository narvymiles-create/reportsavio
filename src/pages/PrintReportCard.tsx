import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Printer, Download, Loader2 } from "lucide-react";
import { ReportCardSheet } from "@/components/ReportCardSheet";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import "./PrintReportCard.css";

export default function PrintReportCard() {
  const { learnerId, termId } = useParams<{ learnerId: string; termId: string }>();
  const [params] = useSearchParams();
  const mode = (params.get("mode") as "preview" | "print" | "download") || "preview";

  const sheetRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [learnerName, setLearnerName] = useState<string>("report-card");
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (!learnerId) return;
    supabase.from("learners").select("full_name").eq("id", learnerId).maybeSingle()
      .then(({ data }) => { if (data?.full_name) setLearnerName(data.full_name); });
  }, [learnerId]);

  const runDownload = async () => {
    const root = sheetRef.current?.querySelector<HTMLDivElement>(".report-page");
    if (!root) return;
    setWorking(true);
    try {
      const canvas = await html2canvas(root, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
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
      const safe = learnerName.replace(/[^a-z0-9_\-\s]/gi, "_");
      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safe}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Download ready", description: `${safe}.pdf` });
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    } finally {
      setWorking(false);
    }
  };

  useEffect(() => {
    if (!ready || triggeredRef.current) return;
    if (mode === "preview") return;
    triggeredRef.current = true;
    const t = setTimeout(() => {
      if (mode === "print") window.print();
      else if (mode === "download") runDownload();
    }, 600);
    return () => clearTimeout(t);
  }, [ready, mode]);

  if (!learnerId || !termId) return <div className="p-8 text-center text-muted-foreground">Missing parameters.</div>;

  return (
    <div className="print-root">
      <div className="no-print sticky top-0 z-10 bg-background border-b p-3 flex justify-end gap-2">
        <Button variant="outline" onClick={() => window.print()} disabled={!ready || working}>
          <Printer className="mr-2 h-4 w-4" /> Print / Save as PDF
        </Button>
        <Button onClick={runDownload} disabled={!ready || working}>
          {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Download PDF
        </Button>
      </div>
      <div ref={sheetRef}>
        <ReportCardSheet learnerId={learnerId} termId={termId} onReady={() => setReady(true)} />
      </div>
    </div>
  );
}
