import { useParams, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { PrimaryPdfViewer } from "@/components/PrimaryPdfViewer";
import { useReportAccess, useReportOutput } from "@/hooks/useReportOutput";

/** Single Primary preview: free to view (watermarked when unpaid); Download / Print go through the unlock check. */
export default function PrintReportCard() {
  const { learnerId = "", termId = "" } = useParams<{ learnerId: string; termId: string }>();
  const [params] = useSearchParams();
  const ids = learnerId ? [learnerId] : [];
  const access = useReportAccess("primary", termId, ids);
  const { ensure } = useReportOutput();
  if (!learnerId || !termId) return <div className="p-8 text-center text-muted-foreground">Missing parameters.</div>;
  if (access.watermark === null) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return (
    <PrimaryPdfViewer learnerIds={ids} termId={termId} watermark={access.watermark} autoPrint={params.get("mode") === "print" && !access.watermark}
      beforeOutput={(action) => ensure({ level: "primary", termId, learnerIds: ids, action, from: "/report-cards" }).then(Boolean)} />
  );
}
