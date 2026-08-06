import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { usePdfDoc } from "@/components/PdfDocView";
import { mergedReportCardsBlob } from "@/lib/pdfGenerator";

type Learner = { id: string; full_name: string };

export default function BulkReportCardsPage() {
  const { termId, classId } = useParams<{ termId: string; classId: string }>();
  const [params] = useSearchParams();
  const autoPrint = params.get("mode") === "print";

  const [learners, setLearners] = useState<Learner[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const triggeredRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!termId || !classId) return;
    (async () => {
      try {
        const { data: rcs, error: e1 } = await supabase
          .from("report_cards")
          .select("learner_id")
          .eq("term_id", termId)
          .eq("class_id", classId);
        if (e1) throw e1;
        const ids = (rcs ?? []).map((r: any) => r.learner_id);
        if (ids.length === 0) {
          if (mountedRef.current) { setLearners([]); setLoading(false); }
          return;
        }
        const { data: ls, error: e2 } = await supabase
          .from("learners")
          .select("id,full_name")
          .in("id", ids)
          .order("full_name");
        if (e2) throw e2;
        if (!mountedRef.current) return;
        setLearners((ls ?? []) as Learner[]);
      } catch (err: any) {
        if (mountedRef.current) setErrorMsg(err.message || "Failed to load learners");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
  }, [termId, classId]);

  const doc = usePdfDoc(
    async () => {
      if (!learners.length) throw new Error("No generated report cards found for this class & term.");
      return mergedReportCardsBlob(learners, termId!);
    },
    [learners, termId],
  );

  useEffect(() => {
    if (!doc.url || triggeredRef.current || !autoPrint) return;
    triggeredRef.current = true;
    const t = setTimeout(() => { if (mountedRef.current) doc.print(); }, 900);
    return () => clearTimeout(t);
  }, [doc.url, autoPrint, doc]);

  useEffect(() => {
    if (doc.error) toast({ title: "Print failed", description: doc.error, variant: "destructive" });
  }, [doc.error]);

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (errorMsg) return <div className="p-8 text-center text-destructive">{errorMsg}</div>;
  if (learners.length === 0) return <div className="p-8 text-center text-muted-foreground">No generated report cards found for this class & term.</div>;

  return (
    <div className="flex h-screen flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background p-3">
        <div className="text-sm">
          <strong>{learners.length}</strong> report card(s) — {doc.url ? "ready" : "building…"}
        </div>
        <Button disabled={!doc.url} onClick={doc.print}>
          <Printer className="mr-2 h-4 w-4" /> Print
        </Button>
      </div>
      {doc.loading && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}
      {doc.error && <div className="p-8 text-center text-destructive">{doc.error}</div>}
      {doc.url && <iframe ref={doc.iframeRef} title="Report cards" src={doc.url} className="w-full flex-1 border-0" />}
    </div>
  );
}
