import { useEffect, useState } from "react";
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
import { downloadNurseryReportCardPDF, downloadNurseryReportCardsZip, type BulkProgress } from "@/lib/nurseryPdfGenerator";

type Cls = { id: string; name: string };
type Stream = { id: string; name: string; class_id: string };
type Term = { id: string; name: string; year: number; is_current: boolean };
type Learner = { id: string; full_name: string; stream_id: string | null };

export default function NurseryReportsPage() {
  const [classes, setClasses] = useState<Cls[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [classId, setClassId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [termId, setTermId] = useState("");
  const [learnerId, setLearnerId] = useState("");
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
      if (cur) setTermId(cur.id);
    })();
  }, []);

  useEffect(() => {
    if (!classId) { setLearners([]); setLearnerId(""); setStreams([]); setStreamId(""); return; }
    supabase.from("nursery_streams" as any).select("id,name,class_id").eq("class_id", classId).order("name").then(({ data }) => setStreams((data as any) ?? []));
    supabase.from("nursery_learners" as any).select("id,full_name,stream_id").eq("class_id", classId).order("full_name").then(({ data }) => setLearners((data as any) ?? []));
  }, [classId]);

  const filteredLearners = streamId ? learners.filter(l => l.stream_id === streamId) : learners;

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
      await downloadNurseryReportCardPDF(learnerId, termId, learner?.full_name ?? "nursery-report");
      toast({ title: "PDF downloaded" });
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
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
      const { failed } = await downloadNurseryReportCardsZip(
        filteredLearners,
        termId,
        `${className}-reports`,
        (p) => setBulkProgress(p),
      );
      if (failed.length) {
        toast({ title: `Done with ${failed.length} error(s)`, description: failed.map(f => f.name).join(", "), variant: "destructive" });
      } else {
        toast({ title: "ZIP downloaded successfully" });
      }
    } catch (e: any) {
      toast({ title: "Bulk download failed", description: e.message, variant: "destructive" });
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
              <NurseryReportSheet learnerId={learnerId} termId={termId} />
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
              {filteredLearners.map((l) => (
                <div key={l.id}>
                  <div className="text-xs text-muted-foreground mb-2 font-semibold">{l.full_name}</div>
                  <NurseryReportSheet learnerId={l.id} termId={termId} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
