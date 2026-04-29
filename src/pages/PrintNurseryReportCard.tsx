import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { NurseryReportSheet } from "@/components/NurseryReportSheet";
import { waitForImagesAndFonts } from "@/lib/reportAssets";
import { toast } from "@/hooks/use-toast";

export default function PrintNurseryReportCard() {
  const { learnerId, termId } = useParams<{ learnerId: string; termId: string }>();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const runPrint = async () => {
    if (!ready || !sheetRef.current) return toast({ title: "Please wait, report still loading" });
    await waitForImagesAndFonts(sheetRef.current);
    window.print();
  };
  if (!learnerId || !termId) return <div className="p-8 text-center text-muted-foreground">Missing parameters.</div>;
  return (
    <div>
      <div className="no-print sticky top-0 z-10 bg-background border-b p-3 flex justify-end gap-2">
        <Button onClick={runPrint} disabled={!ready}><Printer className="mr-2 h-4 w-4" /> Print / Save as PDF</Button>
      </div>
      <div ref={sheetRef}><NurseryReportSheet learnerId={learnerId} termId={termId} onReady={() => setReady(true)} /></div>
    </div>
  );
}
