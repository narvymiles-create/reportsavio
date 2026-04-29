import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Printer, Download, Loader2 } from "lucide-react";
import { ReportCardSheet } from "@/components/ReportCardSheet";
import { downloadPdfFromElement, safeFileName } from "@/lib/pdfExport";
import { waitForImagesAndFonts } from "@/lib/reportAssets";
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
    if (!ready) return toast({ title: "Please wait, report still loading" });
    setWorking(true);
    try {
      await waitForImagesAndFonts(root);
      const safe = safeFileName(learnerName, "report-card");
      await downloadPdfFromElement(root, `${safe}.pdf`);
      toast({ title: "Download ready", description: `${safe}.pdf` });
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    } finally {
      setWorking(false);
    }
  };

  const runPrint = async () => {
    const root = sheetRef.current?.querySelector<HTMLDivElement>(".report-page");
    if (!ready || !root) return toast({ title: "Please wait, report still loading" });
    setWorking(true);
    try {
      await waitForImagesAndFonts(root);
      window.print();
    } finally {
      setWorking(false);
    }
  };

  useEffect(() => {
    if (!ready || triggeredRef.current) return;
    if (mode === "preview") return;
    triggeredRef.current = true;
    const t = setTimeout(() => {
      if (mode === "print") runPrint();
      else if (mode === "download") runDownload();
    }, 600);
    return () => clearTimeout(t);
  }, [ready, mode]);

  if (!learnerId || !termId) return <div className="p-8 text-center text-muted-foreground">Missing parameters.</div>;

  return (
    <div className="print-root">
      <div className="no-print sticky top-0 z-10 bg-background border-b p-3 flex justify-end gap-2">
        <Button variant="outline" onClick={runPrint} disabled={!ready || working}>
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
