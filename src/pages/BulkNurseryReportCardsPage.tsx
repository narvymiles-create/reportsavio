import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";
import { NurseryReportSheet } from "@/components/NurseryReportSheet";

import { toast } from "@/hooks/use-toast";

type Learner = { id: string; full_name: string; stream_id: string | null };

export default function BulkNurseryReportCardsPage() {
  const { termId, classId } = useParams<{ termId: string; classId: string }>();
  const [params] = useSearchParams();
  const autoPrint = params.get("mode") === "print";
  const streamId = params.get("stream") || "";

  const [learners, setLearners] = useState<Learner[]>([]);
  const [readyCount, setReadyCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const sheetsRef = useRef<HTMLDivElement>(null);
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
        let q = supabase.from("nursery_learners" as any).select("id,full_name,stream_id").eq("class_id", classId).order("full_name");
        if (streamId) q = q.eq("stream_id", streamId);
        const { data, error } = await q;
        if (error) throw error;
        if (!mountedRef.current) return;
        setLearners((data ?? []) as any);
      } catch (err: any) {
        if (mountedRef.current) setErrorMsg(err.message || "Failed to load learners");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
  }, [termId, classId, streamId]);

  useEffect(() => {
    if (loading || learners.length === 0) return;
    if (readyCount < learners.length) return;
    if (triggeredRef.current) return;
    if (!autoPrint) return;
    triggeredRef.current = true;
    const t = setTimeout(() => { if (mountedRef.current) runBulkPrint(); }, 1000);
    return () => clearTimeout(t);
  }, [readyCount, learners.length, loading, autoPrint]);

  const runBulkPrint = () => {
    if (!learners.length) return toast({ title: "No learners available", variant: "destructive" });
    if (readyCount < learners.length || !sheetsRef.current) return toast({ title: "Please wait, report still loading" });
    window.scrollTo(0, 0);
    setTimeout(() => window.print(), 300);
  };

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (errorMsg) return <div className="p-8 text-center text-destructive">{errorMsg}</div>;
  if (learners.length === 0) return <div className="p-8 text-center text-muted-foreground">No learners found for this class/stream.</div>;

  const allReady = readyCount >= learners.length;

  return (
    <div>
      <div className="no-print sticky top-0 z-10 bg-background border-b p-3 flex items-center justify-between gap-2">
        <div className="text-sm">
          <strong>{learners.length}</strong> nursery report(s) — {allReady ? "ready" : `loading ${readyCount}/${learners.length}…`}
        </div>
        <Button disabled={!allReady} onClick={runBulkPrint}>
          <Printer className="mr-2 h-4 w-4" /> Print All
        </Button>
      </div>

      <div ref={sheetsRef}>
        {learners.map((l, i) => (
          <NurseryReportSheet
            key={l.id}
            learnerId={l.id}
            termId={termId!}
            pageBreak={i < learners.length - 1}
            onReady={() => { if (mountedRef.current) setReadyCount(c => c + 1); }}
          />
        ))}
      </div>
    </div>
  );
}
