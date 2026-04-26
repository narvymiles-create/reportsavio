import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { FileText, Save, Eye } from "lucide-react";
import { NurseryReportSheet } from "@/components/NurseryReportSheet";

type Cls = { id: string; name: string };
type Term = { id: string; name: string; year: number; is_current: boolean };
type Learner = { id: string; full_name: string };

export default function NurseryReportsPage() {
  const [classes, setClasses] = useState<Cls[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");
  const [learnerId, setLearnerId] = useState("");
  const [ctc, setCtc] = useState("");
  const [htc, setHtc] = useState("");

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
    if (!classId) { setLearners([]); setLearnerId(""); return; }
    supabase.from("nursery_learners" as any).select("id,full_name").eq("class_id", classId).order("full_name").then(({ data }) => setLearners((data as any) ?? []));
  }, [classId]);

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

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Nursery Report Cards</CardTitle>
          <CardDescription>Pick learner, save comments, preview, and print.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Class</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
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
              <Select value={learnerId} onValueChange={setLearnerId}>
                <SelectTrigger><SelectValue placeholder="Learner" /></SelectTrigger>
                <SelectContent>{learners.map((l) => <SelectItem key={l.id} value={l.id}>{l.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

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
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {learnerId && termId && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Eye className="h-4 w-4" />Live Preview</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-auto border rounded p-4 bg-muted/20">
              <NurseryReportSheet learnerId={learnerId} termId={termId} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
