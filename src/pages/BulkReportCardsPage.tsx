import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { PrimaryPdfViewer } from "@/components/PrimaryPdfViewer";

type Learner = { id: string; full_name: string };

export default function BulkReportCardsPage() {
  const { termId, classId } = useParams<{ termId: string; classId: string }>();
  const [params] = useSearchParams();
  const [learners, setLearners] = useState<Learner[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLearners([]);
    setErrorMsg("");
    if (!termId || !classId) { setLoading(false); return; }
    (async () => {
      try {
        const { data: reports, error: reportError } = await supabase.from("report_cards")
          .select("learner_id").eq("term_id", termId).eq("class_id", classId);
        if (reportError) throw reportError;
        const ids = Array.from(new Set((reports ?? []).map(report => report.learner_id)));
        if (!ids.length) return;
        const { data, error } = await supabase.from("learners")
          .select("id,full_name").in("id", ids).order("full_name");
        if (error) throw error;
        if (!cancelled) setLearners(data ?? []);
      } catch (error: unknown) {
        if (!cancelled) setErrorMsg(error instanceof Error ? error.message : "Failed to load learners");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [termId, classId]);

  if (!termId || !classId) return <div className="p-8 text-center text-muted-foreground">Missing parameters.</div>;
  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (errorMsg) return <div role="alert" className="p-8 text-center text-destructive">{errorMsg}</div>;
  if (!learners.length) return <div className="p-8 text-center text-muted-foreground">No generated report cards found for this class &amp; term.</div>;
  return <PrimaryPdfViewer learnerIds={learners.map(learner => learner.id)} termId={termId} autoPrint={params.get("mode") === "print"} filename="report-cards" />;
}
