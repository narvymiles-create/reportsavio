import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save, ClipboardList } from "lucide-react";
import { computeTotal, gradeFor, type GradeBand } from "@/lib/grading";
import { Link } from "react-router-dom";

type Term = { id: string; name: string; year: number; is_current: boolean };
type Cls = { id: string; name: string };
type Stream = { id: string; class_id: string; name: string };
type Subject = { id: string; name: string; code: string; class_id: string; max_marks: number; subject_teacher_id: string | null };
type Learner = { id: string; full_name: string; class_id: string | null; stream_id: string | null; index_no: string | null };
type Teacher = { id: string; initials: string | null; full_name: string };
type MarkRow = {
  id?: string;
  learner_id: string;
  subject_id: string;
  bot: number | null;
  mid: number | null;
  eot: number | null;
};

export default function MarksPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [terms, setTerms] = useState<Term[]>([]);
  const [classes, setClasses] = useState<Cls[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [bands, setBands] = useState<GradeBand[]>([]);

  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [streamId, setStreamId] = useState<string>("all");
  const [subjectId, setSubjectId] = useState("");

  // marks indexed by learner_id
  const [marks, setMarks] = useState<Record<string, MarkRow>>({});

  useEffect(() => {
    (async () => {
      const [t, c, s, te, gb] = await Promise.all([
        supabase.from("terms").select("id,name,year,is_current").order("year", { ascending: false }).order("name"),
        supabase.from("classes").select("id,name").order("sort_order").order("name"),
        supabase.from("streams").select("id,class_id,name").order("name"),
        supabase.from("teachers").select("id,initials,full_name"),
        supabase.from("grading_scales").select("grade,points,min_mark,max_mark,remark").order("sort_order"),
      ]);
      setTerms((t.data ?? []) as Term[]);
      setClasses((c.data ?? []) as Cls[]);
      setStreams((s.data ?? []) as Stream[]);
      setTeachers((te.data ?? []) as Teacher[]);
      setBands((gb.data ?? []) as GradeBand[]);
      const current = (t.data ?? []).find((x: any) => x.is_current);
      if (current) setTermId(current.id);
      setLoading(false);
    })();
  }, []);

  // Load subjects and learners when class changes
  useEffect(() => {
    if (!classId) { setSubjects([]); setLearners([]); setSubjectId(""); return; }
    (async () => {
      const [sub, ln] = await Promise.all([
        supabase.from("subjects").select("*").eq("class_id", classId).order("sort_order"),
        supabase.from("learners").select("id,full_name,class_id,stream_id,index_no").eq("class_id", classId).order("full_name"),
      ]);
      setSubjects((sub.data ?? []) as Subject[]);
      setLearners((ln.data ?? []) as Learner[]);
      if (sub.data && sub.data.length && !sub.data.find((x: any) => x.id === subjectId)) {
        setSubjectId((sub.data[0] as any).id);
      }
    })();
  }, [classId]);

  // Load existing marks when (term, subject) changes
  useEffect(() => {
    if (!termId || !subjectId) { setMarks({}); return; }
    (async () => {
      const { data } = await supabase
        .from("marks")
        .select("id,learner_id,subject_id,bot,mid,eot")
        .eq("term_id", termId)
        .eq("subject_id", subjectId);
      const map: Record<string, MarkRow> = {};
      (data ?? []).forEach((m: any) => { map[m.learner_id] = m; });
      setMarks(map);
    })();
  }, [termId, subjectId]);

  const filteredLearners = useMemo(() => {
    if (streamId === "all") return learners;
    if (streamId === "none") return learners.filter(l => !l.stream_id);
    return learners.filter(l => l.stream_id === streamId);
  }, [learners, streamId]);

  const subject = subjects.find(s => s.id === subjectId);
  const teacherInitials = useMemo(() => {
    if (!subject?.subject_teacher_id) return null;
    return teachers.find(t => t.id === subject.subject_teacher_id)?.initials ?? null;
  }, [subject, teachers]);

  const setMarkField = (learnerId: string, field: "bot" | "mid" | "eot", v: string) => {
    const num = v.trim() === "" ? null : Number(v);
    setMarks(prev => ({
      ...prev,
      [learnerId]: {
        ...(prev[learnerId] ?? { learner_id: learnerId, subject_id: subjectId, bot: null, mid: null, eot: null }),
        [field]: num,
      } as MarkRow,
    }));
  };

  const saveAll = async () => {
    if (!termId || !subjectId) return;
    if (bands.length === 0) {
      return toast({ title: "Set up grading first", description: "Add grade bands in Grading System.", variant: "destructive" });
    }
    setSaving(true);
    const payload = filteredLearners
      .map(l => marks[l.id])
      .filter((m): m is MarkRow => !!m && (m.bot != null || m.mid != null || m.eot != null))
      .map(m => {
        const total = computeTotal(m.bot, m.mid, m.eot);
        const band = gradeFor(total, bands);
        return {
          term_id: termId,
          learner_id: m.learner_id,
          subject_id: subjectId,
          bot: m.bot,
          mid: m.mid,
          eot: m.eot,
          total,
          grade: band?.grade ?? null,
          points: band?.points ?? null,
          remark: band?.remark ?? null,
          teacher_initials: teacherInitials,
        };
      });

    if (payload.length === 0) {
      setSaving(false);
      return toast({ title: "Nothing to save" });
    }

    const { error } = await supabase
      .from("marks")
      .upsert(payload as any, { onConflict: "term_id,learner_id,subject_id" });
    setSaving(false);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: `Saved ${payload.length} record(s)` });
  };

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Marks Entry</h1>
        <p className="text-muted-foreground">Enter Beginning, Mid and End-of-term marks. Grade and points are computed automatically on save.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Register-Style Exam Forms</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Open a notebook-style form to enter marks for an entire class at once. Saved marks appear automatically on each learner&rsquo;s report card.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Button asChild variant="outline" className="justify-start h-auto py-3">
              <Link to="/marks/bot"><ClipboardList className="mr-2 h-4 w-4" /> Beginning of Term Form</Link>
            </Button>
            <Button asChild variant="outline" className="justify-start h-auto py-3">
              <Link to="/marks/mid"><ClipboardList className="mr-2 h-4 w-4" /> Mid-Term Form</Link>
            </Button>
            <Button asChild variant="outline" className="justify-start h-auto py-3">
              <Link to="/marks/eot"><ClipboardList className="mr-2 h-4 w-4" /> End of Term Form</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Learners ({filteredLearners.length})</CardTitle>
          <Button onClick={saveAll} disabled={saving || !termId || !subjectId || filteredLearners.length === 0}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Marks
          </Button>
        </CardHeader>
        <CardContent>
          {!termId || !subjectId ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Select a term, class and subject to begin.</p>
          ) : filteredLearners.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No learners in this selection.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Learner</TableHead>
                  <TableHead>Index No.</TableHead>
                  <TableHead className="w-24">BOT</TableHead>
                  <TableHead className="w-24">MID</TableHead>
                  <TableHead className="w-24">EOT</TableHead>
                  <TableHead className="w-24">Total</TableHead>
                  <TableHead className="w-20">Grade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLearners.map((l, idx) => {
                  const m = marks[l.id];
                  const total = computeTotal(m?.bot ?? null, m?.mid ?? null, m?.eot ?? null);
                  const band = gradeFor(total, bands);
                  return (
                    <TableRow key={l.id}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell className="font-medium">{l.full_name}</TableCell>
                      <TableCell className="text-muted-foreground">{l.index_no ?? "—"}</TableCell>
                      {(["bot", "mid", "eot"] as const).map(f => (
                        <TableCell key={f}>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={subject?.max_marks ?? 100}
                            value={m?.[f] ?? ""}
                            onChange={(e) => setMarkField(l.id, f, e.target.value)}
                            className="h-9"
                          />
                        </TableCell>
                      ))}
                      <TableCell className="font-semibold">{total ?? "—"}</TableCell>
                      <TableCell>{band ? <Badge>{band.grade}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
