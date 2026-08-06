import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { ReportCardSheet } from "@/components/ReportCardSheet";
import { waitForImagesAndFonts } from "@/lib/reportAssets";
import { toast } from "@/hooks/use-toast";
import "./PrintReportCard.css";

export default function PrintReportCard() {
  const { learnerId, termId } = useParams<{ learnerId: string; termId: string }>();
  const [params] = useSearchParams();
  const mode = (params.get("mode") as "preview" | "print") || "preview";

  const sheetRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const triggeredRef = useRef(false);

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
    if (mode !== "print") return;
    triggeredRef.current = true;
    const t = setTimeout(() => { runPrint(); }, 600);
    return () => clearTimeout(t);
  }, [ready, mode]);

  if (!learnerId || !termId) return <div className="p-8 text-center text-muted-foreground">Missing parameters.</div>;

  return (
    <div className="print-root">
      <div className="no-print sticky top-0 z-10 bg-background border-b p-3 flex justify-end gap-2">
        <Button onClick={runPrint} disabled={!ready || working}>
          <Printer className="mr-2 h-4 w-4" /> Print / Save as PDF
        </Button>
      </div>
      <div ref={sheetRef}>
        <ReportCardSheet learnerId={learnerId} termId={termId} onReadyChange={setReady} />
      </div>
    </div>
  );
}
