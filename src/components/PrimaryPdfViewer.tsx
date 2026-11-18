import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Download, ExternalLink, Loader2, Lock, Printer, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { generatePrimaryOutput } from "@/lib/pdf/primaryOutput";
import { safeFilename, triggerBlobDownload } from "@/lib/pdf/core";
import { createPrimaryPdfSession } from "@/lib/pdf/primaryPdfSession";
import { PrimaryPdfPages } from "@/components/PrimaryPdfPages";
import { toast } from "@/hooks/use-toast";
import { APPEARANCE_CHANGED } from "@/lib/reportAppearance";
import { watermarkUnpaidPdf } from "@/lib/pdf/unpaidWatermark";
import { useSchoolEntitlement } from "@/hooks/useSchoolEntitlement";
import { resolvePreviewLock } from "@/lib/billing/previewLock";

type Props = {
  learnerIds: string[];
  termId: string;
  autoPrint?: boolean;
  filename?: string;
  generate?: typeof generatePrimaryOutput;
  toolbar?: ReactNode;
  /**
   * Per-card unpaid state from the database quote. When omitted, the school's active package decides
   * (previews with learner data are watermarked and locked unless the school is entitled).
   */
  watermark?: boolean;
  /** Called before Download / Print; resolve false to cancel (e.g. locked and sent to pricing). */
  beforeOutput?: (action: "download" | "print") => Promise<boolean>;
  /** Blank template artwork with no learner data: never watermarked or locked. */
  sampleOnly?: boolean;
};

/** PDF.js reads the download bytes for preview; Chrome prints those bytes directly. */
export function PrimaryPdfViewer({ learnerIds, termId, autoPrint = false, filename = "report-card", generate = generatePrimaryOutput, toolbar, watermark, beforeOutput, sampleOnly = false }: Props) {
  const navigate = useNavigate();
  const { active } = useSchoolEntitlement();
  // Set only after the database allowed output for this preview (e.g. Learners confirmed); unlocks the clean copy.
  const [cleared, setCleared] = useState(false);
  const marked = resolvePreviewLock({ sampleOnly, watermark, entitled: active, cleared });
  const unlocked = useRef(new Set<string>());
  const [busy, setBusy] = useState(false);
  const printRef = useRef<HTMLButtonElement>(null);
  const [output, setOutput] = useState<{ key: string; blob: Blob | null; document: PDFDocumentProxy; session: ReturnType<typeof createPrimaryPdfSession> | null; locked: boolean } | null>(null);
  const rendered = useRef(new Set<number>());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(0);
  const [retry, setRetry] = useState(0);
  useEffect(() => { const changed = () => setRetry(v => v + 1); window.addEventListener(APPEARANCE_CHANGED, changed); return () => window.removeEventListener(APPEARANCE_CHANGED, changed); }, []);
  const key = JSON.stringify([learnerIds, termId, retry, marked]);
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
    const [ids, selectedTerm, , locked] = JSON.parse(key) as [string[], string, number, boolean | null];
    unlocked.current.clear();
    if (locked === null) return () => { cancelled = true; };
    generate(ids, selectedTerm, (count) => {
      if (!cancelled) setDone(count);
    }).then(async (generated) => {
      if (cancelled) return;
      // Normalize the transport MIME only; preserve every generated PDF byte.
      const blob = generated.type === "application/pdf" ? generated : new Blob([generated], { type: "application/pdf" });
      const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
      if (cancelled) return;
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      // Unpaid previews keep only the watermarked bytes: no clean blob, URL or session is created for them.
      const data = locked ? await watermarkUnpaidPdf(await blob.arrayBuffer()) : new Uint8Array(await blob.arrayBuffer());
      if (cancelled) return;
      task = pdfjs.getDocument({ data, isEvalSupported: false });
      const document = await task.promise;
      if (cancelled) return;
      if (document.numPages < ids.length) throw new Error(`PDF preview expected at least ${ids.length} pages, received ${document.numPages}.`);
      session = locked ? undefined : createPrimaryPdfSession(blob);
      setOutput({ key, blob: locked ? null : blob, document, session: session ?? null, locked: !!locked });
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Failed to prepare report PDF");
    });
    return () => {
      cancelled = true;
      session?.dispose();
      void task?.destroy();
    };
  }, [key, generate]);

  /** Locked actions never output anything: they ask the database once, otherwise go to packages and activation. */
  const locked = !!output?.locked;
  const unlock = async (action: "download" | "print") => {
    if (beforeOutput) {
      setBusy(true);
      try {
        if (await beforeOutput(action)) {
          unlocked.current.add(action);
          setCleared(true);
          toast({ title: "Unlocked", description: "Preparing the full copy. Press the button again when it is ready." });
        }
      } finally { setBusy(false); }
      return;
    }
    toast({ title: "Unpaid preview", description: "Activate a package to open, download or print report cards." });
    navigate("/pricing?reason=plan_required");
  };

  /** Download/print always go through the unlock check once per action for this preview. */
  const allowed = async (action: "download" | "print") => {
    if (!beforeOutput || unlocked.current.has(action)) return true;
    setBusy(true);
    try {
      const ok = await beforeOutput(action);
      if (ok) unlocked.current.add(action);
      return ok;
    } finally { setBusy(false); }
  };
  const download = async () => {
    if (!output || output.key !== key) return;
    if (output.locked || !output.blob) return unlock("download");
    if (beforeOutput && !unlocked.current.has("download") && !(await allowed("download"))) return;
    triggerBlobDownload(output.blob, `${safeFilename(filename)}.pdf`);
  };
  const open = async (printing: boolean) => {
    if (!output || output.key !== key) return;
    if (output.locked || !output.session) return unlock("print");
    if (!ready) return;
    // Without a pending check the tab opens synchronously, keeping the click's popup permission.
    if (beforeOutput && !unlocked.current.has("print") && !(await allowed("print"))) return;
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
  if (marked === null) return <div role="status" className="flex items-center justify-center gap-3 p-12"><Loader2 className="h-6 w-6 animate-spin" /> Checking your package…</div>;
  if (!output || output.key !== key) return (
    <div role="status" className="flex items-center justify-center gap-3 p-12">
      <Loader2 className="h-6 w-6 animate-spin" /> Preparing report cards {done}/{learnerIds.length}…
    </div>
  );

  return (
    <section className="flex min-h-screen flex-col bg-muted" aria-label="Primary report PDF">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background p-3">
        {locked ? <span role="status" className="flex items-center gap-2 text-sm font-medium text-destructive"><Lock className="h-4 w-4" />Unpaid preview — activate a package to open, download or print</span> : toolbar ?? <span role="status" className="text-sm">{learnerIds.length} report card(s) · {output.document.numPages} page(s) · {ready ? "Ready" : "Loading PDF pages…"}</span>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => open(false)} disabled={(!locked && !ready) || busy} aria-label={locked ? "Open PDF (locked)" : "Open PDF"}>
            {locked ? <Lock className="mr-2 h-4 w-4" /> : <ExternalLink className="mr-2 h-4 w-4" />} Open PDF
          </Button>
          <Button variant="outline" onClick={download} disabled={busy} aria-label={locked ? "Download PDF (locked)" : "Download PDF"}>
            {locked ? <Lock className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />} Download PDF
          </Button>
          <Button ref={printRef} onClick={() => open(true)} disabled={(!locked && !ready) || busy} aria-label={locked ? "Print (locked)" : "Print / Save as PDF"}>
            {locked ? <><Lock className="mr-2 h-4 w-4" /> Print</> : <><Printer className="mr-2 h-4 w-4" /> Print / Save as PDF <ExternalLink className="ml-2 h-3 w-3" /></>}
          </Button>
        </div>
      </div>
      <PrimaryPdfPages key={key} document={output.document} onReady={pageReady} onError={pageError} />
    </section>
  );
}