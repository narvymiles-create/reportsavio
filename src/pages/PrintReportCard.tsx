import { useParams, useSearchParams } from "react-router-dom";
import { PrimaryPdfViewer } from "@/components/PrimaryPdfViewer";
import { ReportIssueGate } from "@/components/billing/ReportIssueGate";

export default function PrintReportCard() {
  const { learnerId, termId } = useParams<{ learnerId: string; termId: string }>();
  const [params] = useSearchParams();
  if (!learnerId || !termId) return <div className="p-8 text-center text-muted-foreground">Missing parameters.</div>;
  return (
    <ReportIssueGate level="primary" termId={termId} learnerIds={[learnerId]} allowCharge={false}>
      <PrimaryPdfViewer learnerIds={[learnerId]} termId={termId} autoPrint={params.get("mode") === "print"} />
    </ReportIssueGate>
  );
}
