import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ExternalLink, Loader2, Printer, RefreshCw } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { generatePrimaryOutput } from "@/lib/pdf/primaryOutput";
import { safeFilename, triggerBlobDownload } from "@/lib/pdf/core";
import { createPrimaryPdfSession } from "@/lib/pdf/primaryPdfSession";
import { PrimaryPdfPages } from "@/components/PrimaryPdfPages";
import { toast } from "@/hooks/use-toast";

type Props = {
  learnerIds: string[];
  termId: string;
  autoPrint?: boolean;
  filename?: string;
};

/** PDF.js reads the download bytes for preview; Chrome prints those bytes directly. */
export function PrimaryPdfViewer({ learnerIds, termId, autoPrint = false, filename = "report-card" }: Props) {
  const printRef = useRef<HTMLButtonElement>(null);
  const [output, setOutput] = useState<{ key: string; blob: Blob; document: PDFDocumentProxy; session: ReturnType<typeof createPrimaryPdfSession> } | null>(null);
  const rendered = useRef(new Set<number>());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(0);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([learnerIds, termId, retry]);
  const currentKey = useRef(key);
  currentKey.current = key;

  useEffect(() => {
    let cancelled = false;
    let session: ReturnType<typeof createPrimaryPdfSession> | undefined;
    let task: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | undefined;
    setOutput(null);
    setReady(false);
    rendered.current.clear();
    setError("");
    setDone(0);
    const [ids, selectedTerm] = JSON.parse(key) as [string[], string, number];
    generatePrimaryOutput(ids, selectedTerm, (count) => {
      if (!cancelled) setDone(count);
    }).then(async (generated) => {
      if (cancelled) return;
      // Normalize the transport MIME only; preserve every generated PDF byte.
      const blob = generated.type === "application/pdf" ? generated : new Blob([generated], { type: "application/pdf" });
      const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
      if (cancelled) return;
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const data = new Uint8Array(await blob.arrayBuffer());
      if (cancelled) return;
      task = pdfjs.getDocument({ data, isEvalSupported: false });
      const document = await task.promise;
      if (cancelled) return;
      if (document.numPages !== ids.length) throw new Error(`PDF preview expected ${ids.length} pages, received ${document.numPages}.`);
      session = createPrimaryPdfSession(blob);
      setOutput({ key, blob, document, session });
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Failed to prepare report PDF");
    });
    return () => {
      cancelled = true;
      session?.dispose();
      void task?.destroy();
    };
  }, [key]);

  const open = (printing: boolean) => {
    if (!output || output.key !== key || !ready) return;
    try {
      output.session.open();
      if (printing) toast({ title: "PDF opened for printing", description: "Use Chrome’s PDF Print button or Ctrl+P in the new tab." });
    } catch (reason: unknown) {
      toast({ title: "Could not open PDF", description: reason instanceof Error ? reason.message : "Please try again.", variant: "destructive" });
    }
  };
  const pageReady = useCallback((number: number) => {
    if (!output || output.key !== currentKey.current) return;
    rendered.current.add(number);
    if (rendered.current.size === output.document.numPages) setReady(true);
  }, [output]);
  const pageError = useCallback((message: string) => {
    if (output?.key === currentKey.current) { setReady(false); setError(`PDF preview failed: ${message}`); }
  }, [output]);
  useEffect(() => {
    // A native PDF plugin has no supported readiness/afterprint handshake.
    // Never auto-print an iframe or guess readiness with a timer.
    if (autoPrint && ready) printRef.current?.focus();
  }, [autoPrint, ready]);

  if (error) return <div className="space-y-4 p-8 text-center"><p role="alert" className="text-destructive">{error}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}><RefreshCw className="mr-2 h-4 w-4" /> Retry PDF</Button></div>;
  if (!output || output.key !== key) return (
    <div role="status" className="flex items-center justify-center gap-3 p-12">
      <Loader2 className="h-6 w-6 animate-spin" /> Preparing report cards {done}/{learnerIds.length}…
    </div>
  );

  return (
    <section className="flex min-h-screen flex-col bg-muted" aria-label="Primary report PDF">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background p-3">
        <span role="status" className="text-sm">{learnerIds.length} report card(s) · A4 portrait · {ready ? "Ready" : "Loading PDF pages…"}</span>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => open(false)} disabled={!ready}>
            <ExternalLink className="mr-2 h-4 w-4" /> Open PDF
          </Button>
          <Button variant="outline" onClick={() => triggerBlobDownload(output.blob, `${safeFilename(filename)}.pdf`)}>
            <Download className="mr-2 h-4 w-4" /> Download PDF
          </Button>
          <Button ref={printRef} onClick={() => open(true)} disabled={!ready}><Printer className="mr-2 h-4 w-4" /> Print / Save as PDF <ExternalLink className="ml-2 h-3 w-3" /></Button>
        </div>
      </div>
      <PrimaryPdfPages key={key} document={output.document} onReady={pageReady} onError={pageError} />
    </section>
  );
}