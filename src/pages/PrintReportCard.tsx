import { useEffect, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";
import { usePdfDoc } from "@/components/PdfDocView";
import { generateReportCardBlob } from "@/lib/pdfGenerator";

export default function PrintReportCard() {
  const { learnerId, termId } = useParams<{ learnerId: string; termId: string }>();
  const [params] = useSearchParams();
  const mode = (params.get("mode") as "preview" | "print") || "preview";
  const triggeredRef = useRef(false);

  const { url, loading, error, iframeRef, print } = usePdfDoc(
    () => generateReportCardBlob(learnerId!, termId!),
    [learnerId, termId],
  );

  useEffect(() => {
    if (!url || triggeredRef.current || mode !== "print") return;
    triggeredRef.current = true;
    const t = setTimeout(print, 800);
    return () => clearTimeout(t);
  }, [url, mode, print]);

  if (!learnerId || !termId) return <div className="p-8 text-center text-muted-foreground">Missing parameters.</div>;

  return (
    <div className="flex h-screen flex-col">
      <div className="sticky top-0 z-10 flex justify-end gap-2 border-b bg-background p-3">
        <Button onClick={print} disabled={!url}>
          <Printer className="mr-2 h-4 w-4" /> Print / Save as PDF
        </Button>
      </div>
      {loading && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}
      {error && <div className="p-8 text-center text-destructive">{error}</div>}
      {url && <iframe ref={iframeRef} title="Report card" src={url} className="flex-1 w-full border-0" />}
    </div>
  );
}
