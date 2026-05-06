import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Printer, Download, Loader2 } from "lucide-react";
import { NurseryReportSheet } from "@/components/NurseryReportSheet";
import { downloadNurseryReportCardFromElement } from "@/lib/nurseryPdfGenerator";
import { toast } from "@/hooks/use-toast";

export default function PrintNurseryReportCard() {
  const { learnerId, termId } = useParams<{ learnerId: string; termId: string }>();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const runPrint = () => {
    if (!ready || !sheetRef.current) return toast({ title: "Please wait, report still loading" });
    window.scrollTo(0, 0);
    setTimeout(() => window.print(), 300);
  };

  const runDownload = async () => {
    if (!ready || !sheetRef.current) return;
    const nrcPage = sheetRef.current.querySelector(".nrc-page") as HTMLElement | null;
    if (!nrcPage) return toast({ title: "Report element not found", variant: "destructive" });
    setDownloading(true);
    try {
      await downloadNurseryReportCardFromElement(nrcPage, "nursery-report");
      toast({ title: "PDF downloaded" });
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  if (!learnerId || !termId) return <div className="p-8 text-center text-muted-foreground">Missing parameters.</div>;

  return (
    <div>
      <div className="no-print sticky top-0 z-10 bg-background border-b p-3 flex justify-end gap-2">
        <Button onClick={runDownload} disabled={!ready || downloading} variant="outline">
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
    </div>
  );
}
