import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { NurseryReportSheet } from "@/components/NurseryReportSheet";

export default function PrintNurseryReportCard() {
  const { learnerId, termId } = useParams<{ learnerId: string; termId: string }>();
  if (!learnerId || !termId) return <div className="p-8 text-center text-muted-foreground">Missing parameters.</div>;
  return (
    <div>
      <div className="no-print sticky top-0 z-10 bg-background border-b p-3 flex justify-end gap-2">
        <Button onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print / Save as PDF</Button>
      </div>
      <NurseryReportSheet learnerId={learnerId} termId={termId} />
    </div>
  );
}
