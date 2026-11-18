import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Printer, Download, Loader2 } from "lucide-react";
import { NurseryReportSheet } from "@/components/NurseryReportSheet";
import { downloadNurseryReportCardPDF } from "@/lib/nurseryPdfGenerator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { NurseryTemplateOutput } from "@/components/NurseryTemplateOutput";
import { ReportOutputGate } from "@/components/billing/ReportIssueGate";
import { useReportOutput } from "@/hooks/useReportOutput";
import { billingErrorMessage } from "@/lib/billing/api";

export default function PrintNurseryReportCard() {
  const { learnerId, termId } = useParams<{ learnerId: string; termId: string }>();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [learnerName, setLearnerName] = useState<string>("nursery-report");
  const { run, ensure } = useReportOutput();

  useEffect(() => {
    if (!learnerId) return;
    (async () => {
      const { data } = await supabase
        .from("nursery_learners" as any)
        .select("full_name")
        .eq("id", learnerId)
        .maybeSingle();
      if ((data as any)?.full_name) setLearnerName((data as any).full_name);
    })();
  }, [learnerId]);

  const runPrint = () => {
    if (!ready || !sheetRef.current) return toast({ title: "Please wait, report still loading" });
    window.scrollTo(0, 0);
    setTimeout(() => window.print(), 300);
  };

  const runDownload = async () => {
    if (!learnerId || !termId) return;
    setDownloading(true);
    try {
      const done = await run({ level: "nursery", termId, learnerIds: [learnerId], action: "download", from: "/nursery/reports" },
        () => downloadNurseryReportCardPDF(learnerId, termId, learnerName).then(() => true));
      if (done) toast({ title: "PDF downloaded" });
    } catch (e: any) {
      toast({ title: "Download failed", description: billingErrorMessage(e), variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  if (!learnerId || !termId) return <div className="p-8 text-center text-muted-foreground">Missing parameters.</div>;

  return (
    <ReportOutputGate request={{ level: "nursery", termId, learnerIds: [learnerId], action: "print", from: "/nursery/reports" }}>
    <NurseryTemplateOutput learnerIds={[learnerId]} termId={termId} watermark={false}
      beforeOutput={(action) => ensure({ level: "nursery", termId, learnerIds: [learnerId], action, from: "/nursery/reports" }).then(Boolean)}><div>
      <div className="no-print sticky top-0 z-10 bg-background border-b p-3 flex justify-end gap-2">
        <Button onClick={runDownload} disabled={downloading} variant="outline">
          {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Download PDF
        </Button>
        <Button onClick={runPrint} disabled={!ready}>
          <Printer className="mr-2 h-4 w-4" /> Print / Save as PDF
        </Button>
      </div>
      <div ref={sheetRef}>
        <NurseryReportSheet learnerId={learnerId} termId={termId} onReady={() => setReady(true)} />
      </div>
    </div></NurseryTemplateOutput>
    </ReportOutputGate>
  );
}
