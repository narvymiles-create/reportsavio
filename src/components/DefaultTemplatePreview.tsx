import { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { PrimaryPdfPages } from "@/components/PrimaryPdfPages";
import { safeFilename, triggerBlobDownload } from "@/lib/pdf/core";
import { renderDefaultTemplatePreview, type DefaultPreview } from "@/lib/pdf/defaultTemplatePreview";
import type { TemplateLevel } from "@/lib/templates";

const LABEL: Record<TemplateLevel, string> = { nursery: "Nursery", primary: "Primary" };

/** Shows the built-in report card design from the same PDF bytes it downloads as. */
export function DefaultTemplatePreview({ level, open, onOpenChange }: {
  level: TemplateLevel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [preview, setPreview] = useState<DefaultPreview | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let task: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | undefined;
    setPreview(null);
    setDocument(null);
    setError("");
    (async () => {
      const generated = await renderDefaultTemplatePreview(level);
      const [pdfjs, worker] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
      ]);
      if (cancelled) return;
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      task = pdfjs.getDocument({
        data: new Uint8Array(await generated.blob.arrayBuffer()),
        isEvalSupported: false,
      });
      const doc = await task.promise;
      if (cancelled) { void doc.destroy(); return; }
      setPreview(generated);
      setDocument(doc);
    })().catch((reason: unknown) => {
      if (!cancelled) {
        setError(reason instanceof Error ? reason.message : "Could not prepare the default report card preview.");
      }
    });
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [open, level, retry]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Default {LABEL[level]} Report Card</DialogTitle>
          <DialogDescription>
            The built-in {LABEL[level].toLowerCase()} design, used whenever no custom template is
            active.
            {preview ? ` Shown with ${preview.learnerName} · ${preview.termName}.` : ""}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="space-y-3 py-6 text-center">
            <p role="alert" className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
              <RefreshCw className="mr-2 h-4 w-4" /> Retry
            </Button>
          </div>
        ) : !document ? (
          <div role="status" className="flex items-center justify-center gap-3 py-12 text-sm">
            <Loader2 className="h-5 w-5 animate-spin" /> Preparing the default report card…
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" variant="outline"
                onClick={() => preview && triggerBlobDownload(
                  preview.blob, `${safeFilename(`default-${level}-report-card`)}.pdf`,
                )}>
                <Download className="mr-2 h-4 w-4" /> Download PDF
              </Button>
            </div>
            <PrimaryPdfPages document={document} onReady={() => {}} onError={(message) => setError(message)} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
