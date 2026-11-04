import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Printer, Download, Loader2 } from "lucide-react";
import { NurseryReportSheet } from "@/components/NurseryReportSheet";
import { PrimaryPdfPages } from "@/components/PrimaryPdfPages";
import { downloadNurseryReportCardPDF, generateNurseryReportCardBlob } from "@/lib/nurseryPdfGenerator";
import { createPrimaryPdfSession } from "@/lib/pdf/primaryPdfSession";
import { getActiveTemplate } from "@/lib/templates";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * Nursery print/preview page. With no custom template the existing HTML sheet
 * is used exactly as before. When a custom Nursery template is active, the
 * same generated PDF used for downloads is shown and printed so preview,
 * print and download are identical.
 */
export default function PrintNurseryReportCard() {
  const { learnerId, termId } = useParams<{ learnerId: string; termId: string }>();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [learnerName, setLearnerName] = useState<string>("nursery-report");
  const [useCustom, setUseCustom] = useState<boolean | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const sessionRef = useRef<ReturnType<typeof createPrimaryPdfSession> | null>(null);

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

  useEffect(() => {
    if (!learnerId || !termId) return;
    let cancelled = false;
    (async () => {
      const active = await getActiveTemplate("nursery");
      if (cancelled) return;
      if (!active) {
        setUseCustom(false);
        return;
      }
      setUseCustom(true);
      try {
        const blob = await generateNurseryReportCardBlob(learnerId, termId);
        const session = createPrimaryPdfSession(blob);
        sessionRef.current = session;
        const [pdfjs, worker] = await Promise.all([
          import("pdfjs-dist"),
          import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const data = new Uint8Array(await blob.arrayBuffer());
        const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
        if (!cancelled) setPdfDoc(doc);
      } catch (e: any) {
        if (!cancelled) setPdfError(e?.message ?? "Could not render the report PDF.");
      }
    })();
    return () => { cancelled = true; };
  }, [learnerId, termId]);

  useEffect(() => () => { sessionRef.current?.previewClosed(); }, []);

  const runPrint = () => {
    if (useCustom) {
      const session = sessionRef.current;
      if (!session) return toast({ title: "Please wait, report still loading" });
      const tab = session.openInNativeTab();
      if (!tab) toast({ title: "Popup blocked", description: "Allow popups to print the report.", variant: "destructive" });
      return;
    }
    if (!ready || !sheetRef.current) return toast({ title: "Please wait, report still loading" });
    window.scrollTo(0, 0);
    setTimeout(() => window.print(), 300);
  };

  const runDownload = async () => {
    if (!learnerId || !termId) return;
    setDownloading(true);
    try {
      await downloadNurseryReportCardPDF(learnerId, termId, learnerName);
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
        <Button onClick={runDownload} disabled={downloading} variant="outline">
          {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Download PDF
        </Button>
        <Button onClick={runPrint} disabled={useCustom === true ? !pdfDoc : !ready}>
          <Printer className="mr-2 h-4 w-4" /> Print / Save as PDF
        </Button>
      </div>
      {useCustom === null && (
        <div className="flex justify-center p-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      )}
      {useCustom === true && (
        pdfError ? (
          <div className="p-8 text-center text-destructive">{pdfError}</div>
        ) : pdfDoc ? (
          <PrimaryPdfPages document={pdfDoc} onReady={() => setReady(true)} onError={(m) => setPdfError(m)} />
        ) : (
          <div className="flex justify-center p-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
        )
      )}
      {useCustom === false && (
        <div ref={sheetRef}>
          <NurseryReportSheet learnerId={learnerId} termId={termId} onReady={() => setReady(true)} />
        </div>
      )}
    </div>
  );
}
