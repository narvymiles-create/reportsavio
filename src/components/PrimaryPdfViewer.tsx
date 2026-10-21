import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generatePrimaryOutput } from "@/lib/pdf/primaryOutput";
import { safeFilename, triggerBlobDownload } from "@/lib/pdf/core";
import { toast } from "@/hooks/use-toast";

type Props = {
  learnerIds: string[];
  termId: string;
  autoPrint?: boolean;
  filename?: string;
};

/** The native PDF viewer displays and prints the exact download bytes. No HTML sheet. */
export function PrimaryPdfViewer({ learnerIds, termId, autoPrint = false, filename = "report-card" }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [output, setOutput] = useState<{ blob: Blob; url: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(0);
  const key = JSON.stringify(learnerIds);

  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    setOutput(null);
    setReady(false);
    setError("");
    setDone(0);
    generatePrimaryOutput(JSON.parse(key) as string[], termId, (count) => {
      if (!cancelled) setDone(count);
    }).then((blob) => {
      if (cancelled) return;
      url = URL.createObjectURL(blob);
      setOutput({ blob, url });
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Failed to prepare report PDF");
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [key, termId]);

  const print = () => {
    const viewer = frameRef.current?.contentWindow;
    if (!viewer || !ready) return;
    try {
      viewer.focus();
      viewer.print();
    } catch {
      toast({ title: "Open the PDF to print", description: "Your browser requires printing from the PDF tab.", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (!autoPrint || !ready || !output) return;
    // The frame load precedes the native viewer's toolbar initialization.
    const timer = window.setTimeout(print, 600);
    return () => window.clearTimeout(timer);
  }, [autoPrint, ready, output]);

  if (error) return <div role="alert" className="p-8 text-center text-destructive">{error}</div>;
  if (!output) return (
    <div role="status" className="flex items-center justify-center gap-3 p-12">
      <Loader2 className="h-6 w-6 animate-spin" /> Preparing report cards {done}/{learnerIds.length}…
    </div>
  );

  return (
    <section className="flex min-h-screen flex-col bg-muted" aria-label="Primary report PDF">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background p-3">
        <span className="text-sm">{learnerIds.length} report card(s) · A4 portrait</span>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href={output.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Open PDF</a>
          </Button>
          <Button variant="outline" onClick={() => triggerBlobDownload(output.blob, `${safeFilename(filename)}.pdf`)}>
            <Download className="mr-2 h-4 w-4" /> Download PDF
          </Button>
          <Button onClick={print} disabled={!ready}><Printer className="mr-2 h-4 w-4" /> Print / Save as PDF</Button>
        </div>
      </div>
      <iframe
        ref={frameRef}
        title="Primary report card PDF"
        src={`${output.url}#view=Fit&toolbar=1`}
        className="min-h-[75vh] w-full flex-1 border-0"
        onLoad={() => setReady(true)}
      />
    </section>
  );
}