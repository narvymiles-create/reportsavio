import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { FileText, Save, Eye, Printer, Users, Download, Loader2 } from "lucide-react";
import { NurseryReportSheet } from "@/components/NurseryReportSheet";
import { NurseryTemplateOutput } from "@/components/NurseryTemplateOutput";
import { downloadNurseryReportCardPDF, downloadNurseryReportCardsZip, type BulkProgress } from "@/lib/nurseryPdfGenerator";
import { UnpaidWatermark } from "@/components/billing/UnpaidWatermark";
import { billingErrorMessage, pricingUrl } from "@/lib/billing/api";
import { useReportAccess, useReportOutput } from "@/hooks/useReportOutput";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Lock } from "lucide-react";

// Keep the selection when going to the pricing page and back (per browser tab).
const FILTERS_KEY = "nurseryReports.filters.v1";
type Saved = { classId?: string; streamId?: string; termId?: string; learnerId?: string };
const loadSaved = (): Saved => { try { return JSON.parse(sessionStorage.getItem(FILTERS_KEY) ?? "{}") as Saved; } catch { return {}; } };

type Cls = { id: string; name: string };
type Stream = { id: string; name: string; class_id: string };
type Term = { id: string; name: string; year: number; is_current: boolean };
type Learner = { id: string; full_name: string; stream_id: string | null };

export default function NurseryReportsPage() {
  const [classes, setClasses] = useState<Cls[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [classId, setClassId] = useState(() => loadSaved().classId ?? "");
  const [streamId, setStreamId] = useState(() => loadSaved().streamId ?? "");
  const [termId, setTermId] = useState(() => loadSaved().termId ?? "");
  const [learnerId, setLearnerId] = useState(() => loadSaved().learnerId ?? "");
  useEffect(() => {
    try { sessionStorage.setItem(FILTERS_KEY, JSON.stringify({ classId, streamId, termId, learnerId })); } catch { /* best effort */ }
  }, [classId, streamId, termId, learnerId]);
  const { run } = useReportOutput();
  const [ctc, setCtc] = useState("");
  const [htc, setHtc] = useState("");
  const [bulkPreview, setBulkPreview] = useState(false);
  const [singleDownloading, setSingleDownloading] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);

  useEffect(() => {
    (async () => {
      const [c, t] = await Promise.all([
        supabase.from("nursery_classes" as any).select("id,name").order("sort_order"),
        supabase.from("terms" as any).select("id,name,year,is_current").order("year", { ascending: false }),
      ]);
      setClasses((c.data as any) ?? []);
      const ts = (t.data as any) ?? [];
      setTerms(ts);
      const cur = ts.find((x: Term) => x.is_current);
      if (cur) setTermId((prev) => prev || cur.id);
    })();
  }, []);

  const restoring = useRef(true);
  useEffect(() => {
    if (!classId) { setLearners([]); if (!restoring.current) { setLearnerId(""); setStreamId(""); } setStreams([]); restoring.current = false; return; }
    restoring.current = false;
    supabase.from("nursery_streams" as any).select("id,name,class_id").eq("class_id", classId).order("name").then(({ data }) => setStreams((data as any) ?? []));
    supabase.from("nursery_learners" as any).select("id,full_name,stream_id").eq("class_id", classId).order("full_name").then(({ data }) => setLearners((data as any) ?? []));
  }, [classId]);

  const filteredLearners = streamId ? learners.filter(l => l.stream_id === streamId) : learners;
  const singleAccess = useReportAccess("nursery", termId, learnerId ? [learnerId] : []);
  const bulkAccess = useReportAccess("nursery", termId, filteredLearners.map((l) => l.id));
  const outputBase = { level: "nursery" as const, termId, classId, streamId: streamId || undefined, from: "/nursery/reports" };

  useEffect(() => {
    if (!learnerId || !termId) { setCtc(""); setHtc(""); return; }
    supabase.from("nursery_report_cards" as any).select("*").eq("learner_id", learnerId).eq("term_id", termId).maybeSingle().then(({ data }) => {
      setCtc((data as any)?.class_teacher_comment ?? "");
      setHtc((data as any)?.head_teacher_comment ?? "");
    });
  }, [learnerId, termId]);

  const saveComments = async () => {
    if (!learnerId || !termId) return;
    const { error } = await supabase.from("nursery_report_cards" as any).upsert(
      { learner_id: learnerId, term_id: termId, class_teacher_comment: ctc, head_teacher_comment: htc, generated_at: new Date().toISOString() },
      { onConflict: "learner_id,term_id" }
    );
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: "Saved" });
  };

  const handleSingleDownload = async () => {
    if (!learnerId || !termId) return;
    const learner = filteredLearners.find(l => l.id === learnerId);
    setSingleDownloading(true);
    try {
      const done = await run({ ...outputBase, learnerIds: [learnerId], action: "download" },
        () => downloadNurseryReportCardPDF(learnerId, termId, learner?.full_name ?? "nursery-report").then(() => true));
      if (done) toast({ title: "PDF downloaded" });
    } catch (e: any) {
      toast({ title: "Download failed", description: billingErrorMessage(e), variant: "destructive" });
    } finally {
      setSingleDownloading(false);
    }
  };

  const handleBulkDownload = async () => {
    if (!classId || !termId || filteredLearners.length === 0) return;
    setBulkDownloading(true);
    setBulkProgress(null);
    try {
      const className = classes.find(c => c.id === classId)?.name ?? "nursery";
      const result = await run({ ...outputBase, learnerIds: filteredLearners.map((l) => l.id), action: "bulk_download" },
        () => downloadNurseryReportCardsZip(filteredLearners, termId, `${className}-reports`, (p) => setBulkProgress(p)),
        (r) => filteredLearners.filter((l) => r.failed.some((f) => f.name === l.full_name)).map((l) => l.id));
      if (!result) return;
      const { failed } = result;
      if (failed.length) {
        toast({ title: `Done with ${failed.length} error(s)`, description: failed.map(f => f.name).join(", "), variant: "destructive" });
      } else {
        toast({ title: "ZIP downloaded successfully" });
      }
    } catch (e: any) {
      toast({ title: "Bulk download failed", description: billingErrorMessage(e), variant: "destructive" });
    } finally {
      setBulkDownloading(false);
      setBulkProgress(null);
    }
  };

  const bulkBase = classId && termId ? `/print/nursery-bulk/${termId}/${classId}${streamId ? `?stream=${streamId}` : ""}` : "";

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Nursery Report Cards</CardTitle>
          <CardDescription>Pick a learner to edit/preview a single report, or use bulk actions to preview, print, or export an entire class/stream.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(singleAccess.watermark || bulkAccess.watermark) && termId && (
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertTitle>Unpaid preview</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                <span>Previewing is free and shows “SKAVIO EDUREPORTS – UNPAID PREVIEW”. Download and printing unlock once a package is paid.</span>
                <Button asChild size="sm"><Link to={pricingUrl({ ...outputBase, count: learnerId ? 1 : filteredLearners.length })}>See packages</Link></Button>
              </AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label>Class</Label>
              <Select value={classId} onValueChange={(v) => { setClassId(v); setStreamId(""); setLearnerId(""); setBulkPreview(false); }}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Stream (optional)</Label>
              <Select value={streamId || "__all"} onValueChange={(v) => { setStreamId(v === "__all" ? "" : v); setLearnerId(""); setBulkPreview(false); }}>
                <SelectTrigger><SelectValue placeholder="All streams" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All streams</SelectItem>
                  {streams.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Term</Label>
              <Select value={termId} onValueChange={setTermId}>
                <SelectTrigger><SelectValue placeholder="Term" /></SelectTrigger>
                <SelectContent>{terms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} {t.year}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Learner</Label>
              <Select value={learnerId} onValueChange={(v) => { setLearnerId(v); setBulkPreview(false); }}>
                <SelectTrigger><SelectValue placeholder="Learner" /></SelectTrigger>
                <SelectContent>{filteredLearners.map((l) => <SelectItem key={l.id} value={l.id}>{l.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Bulk actions */}
          {classId && termId && (
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button variant="secondary" onClick={() => { setLearnerId(""); setBulkPreview(true); }}>
                <Users className="h-4 w-4 mr-1" />Bulk Preview ({filteredLearners.length})
              </Button>
              <Link to={`${bulkBase}${bulkBase.includes("?") ? "&" : "?"}mode=print`} target="_blank">
                <Button variant="outline"><Printer className="h-4 w-4 mr-1" />Bulk Print</Button>
              </Link>
              <Button variant="outline" onClick={handleBulkDownload} disabled={bulkDownloading || filteredLearners.length === 0}>
                {bulkDownloading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                {bulkDownloading && bulkProgress
                  ? `Downloading ${bulkProgress.done}/${bulkProgress.total}…`
                  : `Bulk Download ZIP (${filteredLearners.length})`}
              </Button>
            </div>
          )}

          {learnerId && termId && (
            <>
              <div className="grid md:grid-cols-2 gap-3">
                <div><Label>Class Teacher Comment</Label><Textarea rows={3} value={ctc} onChange={(e) => setCtc(e.target.value)} /></div>
                <div><Label>Head Teacher Comment</Label><Textarea rows={3} value={htc} onChange={(e) => setHtc(e.target.value)} /></div>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveComments}><Save className="h-4 w-4 mr-1" />Save Comments</Button>
                <Link to={`/print/nursery/${learnerId}/${termId}`} target="_blank">
                  <Button variant="outline"><FileText className="h-4 w-4 mr-1" />Open Print View</Button>
                </Link>
                <Button variant="outline" onClick={handleSingleDownload} disabled={singleDownloading}>
                  {singleDownloading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                  Download PDF
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {learnerId && termId && !bulkPreview && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Eye className="h-4 w-4" />Live Preview</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-auto border rounded p-4 bg-muted/20">
              <UnpaidWatermark active={!!singleAccess.watermark}>
                <NurseryTemplateOutput learnerIds={[learnerId]} termId={termId}><NurseryReportSheet learnerId={learnerId} termId={termId} /></NurseryTemplateOutput>
              </UnpaidWatermark>
            </div>
          </CardContent>
        </Card>
      )}

      {bulkPreview && classId && termId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" />Bulk Preview — {filteredLearners.length} learner(s)</CardTitle>
            <CardDescription>Scroll to review every report before printing or exporting.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto border rounded p-4 bg-muted/20 space-y-6 max-h-[80vh]">
              <UnpaidWatermark active={!!bulkAccess.watermark}>
              <NurseryTemplateOutput learnerIds={filteredLearners.map(l => l.id)} termId={termId}>{filteredLearners.map((l) => (
                <div key={l.id}>
                  <div className="text-xs text-muted-foreground mb-2 font-semibold">{l.full_name}</div>
                  <NurseryReportSheet learnerId={l.id} termId={termId} />
                </div>
              ))}</NurseryTemplateOutput>
              </UnpaidWatermark>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
