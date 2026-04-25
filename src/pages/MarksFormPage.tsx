import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save, Printer } from "lucide-react";
import { computeTotal, gradeFor, divisionFor, type GradeBand, type DivisionRule } from "@/lib/grading";
import "./MarksFormPage.css";

export type ExamColumn = "bot" | "mid" | "eot";

type Term = { id: string; name: string; year: number; is_current: boolean };
type Cls = { id: string; name: string };
type Stream = { id: string; class_id: string; name: string };
type Subject = { id: string; name: string; code: string; class_id: string; max_marks: number; sort_order: number; subject_teacher_id: string | null };
type Learner = { id: string; full_name: string; class_id: string | null; stream_id: string | null; index_no: string | null };
type Teacher = { id: string; initials: string | null };

// marks indexed by `${learner_id}|${subject_id}` -> row
type MarkRow = { id?: string; learner_id: string; subject_id: string; bot: number | null; mid: number | null; eot: number | null };

const TITLES: Record<ExamColumn, string> = {
  bot: "BEGINNING OF TERM EXAMS FORM",
  mid: "MID OF TERM EXAMS FORM",
  eot: "END OF TERM EXAMS FORM",
};

export default function MarksFormPage({ exam }: { exam: ExamColumn }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [terms, setTerms] = useState<Term[]>([]);
  const [classes, setClasses] = useState<Cls[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [bands, setBands] = useState<GradeBand[]>([]);
  const [divRules, setDivRules] = useState<DivisionRule[]>([]);
  const [school, setSchool] = useState<{ name: string } | null>(null);

  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [streamId, setStreamId] = useState<string>("all");

  // marks keyed by learner|subject
  const [marks, setMarks] = useState<Record<string, MarkRow>>({});

  useEffect(() => {
    (async () => {
      const [t, c, s, te, gb, dr, si] = await Promise.all([
        supabase.from("terms").select("id,name,year,is_current").order("year", { ascending: false }).order("name"),
        supabase.from("classes").select("id,name").order("sort_order").order("name"),
        supabase.from("streams").select("id,class_id,name").order("name"),
        supabase.from("teachers").select("id,initials"),
        supabase.from("grading_scales").select("grade,points,min_mark,max_mark,remark").order("sort_order"),
        supabase.from("division_rules").select("division,min_aggregate,max_aggregate").order("sort_order"),
        supabase.from("school_info").select("name").eq("is_active", true).maybeSingle(),
      ]);
      setTerms((t.data ?? []) as Term[]);
      setClasses((c.data ?? []) as Cls[]);
      setStreams((s.data ?? []) as Stream[]);
      setTeachers((te.data ?? []) as Teacher[]);
      setBands((gb.data ?? []) as GradeBand[]);
      setDivRules((dr.data ?? []) as DivisionRule[]);
      setSchool((si.data as any) ?? null);
      const current = (t.data ?? []).find((x: any) => x.is_current);
      if (current) setTermId(current.id);
      setLoading(false);
    })();
  }, []);

  // Subjects + learners when class changes
  useEffect(() => {
    if (!classId) { setSubjects([]); setLearners([]); return; }
    (async () => {
      const [sub, ln] = await Promise.all([
        supabase.from("subjects").select("*").eq("class_id", classId).order("sort_order"),
        supabase.from("learners").select("id,full_name,class_id,stream_id,index_no").eq("class_id", classId).order("full_name"),
      ]);
      setSubjects((sub.data ?? []) as Subject[]);
      setLearners((ln.data ?? []) as Learner[]);
    })();
  }, [classId]);

  // Existing marks for term + class subjects
  useEffect(() => {
    if (!termId || subjects.length === 0) { setMarks({}); return; }
    const ids = subjects.map(s => s.id);
    (async () => {
      const { data } = await supabase
        .from("marks")
        .select("id,learner_id,subject_id,bot,mid,eot")
        .eq("term_id", termId)
        .in("subject_id", ids);
      const map: Record<string, MarkRow> = {};
      (data ?? []).forEach((m: any) => { map[`${m.learner_id}|${m.subject_id}`] = m; });
      setMarks(map);
    })();
  }, [termId, subjects]);

  const filteredLearners = useMemo(() => {
    if (streamId === "all") return learners;
    if (streamId === "none") return learners.filter(l => !l.stream_id);
    return learners.filter(l => l.stream_id === streamId);
  }, [learners, streamId]);

  const setMark = (learnerId: string, subjectId: string, v: string) => {
    const key = `${learnerId}|${subjectId}`;
    const num = v.trim() === "" ? null : Number(v);
    setMarks(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? { learner_id: learnerId, subject_id: subjectId, bot: null, mid: null, eot: null }),
        [exam]: num,
      } as MarkRow,
    }));
  };

  // Per-row computed values (live)
  type RowCalc = { total: number; ave: number; agg: number; div: string; subjectGrades: Record<string, string | null> };
  const rowCalcs = useMemo(() => {
    const out = new Map<string, RowCalc>();
    for (const l of filteredLearners) {
      const subjectGrades: Record<string, string | null> = {};
      let total = 0; let count = 0; let agg = 0;
      for (const s of subjects) {
        const m = marks[`${l.id}|${s.id}`];
        const v = m?.[exam] ?? null;
        if (v != null && !isNaN(v)) {
          total += v; count += 1;
          const band = gradeFor(v, bands);
          subjectGrades[s.id] = band?.grade ?? null;
          if (band?.points != null) agg += band.points;
        } else {
          subjectGrades[s.id] = null;
        }
      }
      const ave = count ? Math.round((total / count) * 100) / 100 : 0;
      out.set(l.id, { total, ave, agg, div: count ? divisionFor(agg, divRules) : "—", subjectGrades });
    }
    return out;
  }, [filteredLearners, subjects, marks, bands, divRules, exam]);

  // Position ranking by total desc (ties share)
  const positions = useMemo(() => {
    const arr = filteredLearners.map(l => ({ id: l.id, total: rowCalcs.get(l.id)?.total ?? 0 }));
    arr.sort((a, b) => b.total - a.total);
    const map = new Map<string, number>();
    let lastTotal: number | null = null; let lastPos = 0;
    arr.forEach((r, i) => {
      if (r.total !== lastTotal) { lastPos = i + 1; lastTotal = r.total; }
      map.set(r.id, r.total > 0 ? lastPos : 0);
    });
    return map;
  }, [filteredLearners, rowCalcs]);

  // Division summary counts
  const divSummary = useMemo(() => {
    const counts: Record<string, number> = { I: 0, II: 0, III: 0, IV: 0, U: 0 };
    for (const l of filteredLearners) {
      const c = rowCalcs.get(l.id);
      if (!c || c.total === 0) continue;
      const d = c.div;
      // Map common division labels to columns
      const key = d === "1" || d.toUpperCase() === "I" ? "I"
        : d === "2" || d.toUpperCase() === "II" ? "II"
        : d === "3" || d.toUpperCase() === "III" ? "III"
        : d === "4" || d.toUpperCase() === "IV" ? "IV"
        : "U";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [filteredLearners, rowCalcs]);

  const saveAll = async () => {
    if (!termId || !classId) return;
    if (bands.length === 0) {
      return toast({ title: "Set up grading first", description: "Add grade bands in Grading System.", variant: "destructive" });
    }
    setSaving(true);
    const payload: any[] = [];
    for (const l of filteredLearners) {
      for (const s of subjects) {
        const m = marks[`${l.id}|${s.id}`];
        if (!m) continue;
        if (m.bot == null && m.mid == null && m.eot == null) continue;
        const total = computeTotal(m.bot, m.mid, m.eot);
        const band = gradeFor(total, bands);
        const ti = teachers.find(t => t.id === s.subject_teacher_id)?.initials ?? null;
        payload.push({
          term_id: termId,
          learner_id: l.id,
          subject_id: s.id,
          bot: m.bot, mid: m.mid, eot: m.eot,
          total,
          grade: band?.grade ?? null,
          points: band?.points ?? null,
          remark: band?.remark ?? null,
          teacher_initials: ti,
        });
      }
    }
    if (payload.length === 0) { setSaving(false); return toast({ title: "Nothing to save" }); }
    const { error } = await supabase.from("marks").upsert(payload, { onConflict: "term_id,learner_id,subject_id" });
    setSaving(false);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: `Saved ${payload.length} record(s)` });
  };

  const handlePrint = () => window.print();

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const term = terms.find(t => t.id === termId);
  const cls = classes.find(c => c.id === classId);
  const stream = streams.find(s => s.id === streamId);

  return (
    <div className="space-y-4">
      {/* Controls (hidden in print) */}
      <div className="no-print space-y-4">
        <div>
          <h1 className="text-3xl font-bold">{TITLES[exam]}</h1>
          <p className="text-muted-foreground">Enter marks; grade, totals, position and division compute live.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 border rounded-md bg-card">
          <div>
            <Label>Term</Label>
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
              <SelectContent>
                {terms.map(t => <SelectItem key={t.id} value={t.id}>{t.name} {t.year}{t.is_current ? " (current)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Class</Label>
            <Select value={classId} onValueChange={(v) => { setClassId(v); setStreamId("all"); }}>
              <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>
                {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Stream</Label>
            <Select value={streamId} onValueChange={setStreamId} disabled={!classId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All streams</SelectItem>
                <SelectItem value="none">No stream</SelectItem>
                {streams.filter(s => s.class_id === classId).map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={saveAll} disabled={saving || !termId || !classId || filteredLearners.length === 0} className="flex-1">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
            <Button variant="outline" onClick={handlePrint} disabled={!classId || filteredLearners.length === 0}>
              <Printer className="mr-2 h-4 w-4" /> Download Form (PDF)
            </Button>
          </div>
        </div>
      </div>

      {/* Printable area */}
      <div className="marks-form">
        <div className="marks-form__header">
          <div className="marks-form__school">{school?.name ?? ""}</div>
          <h2 className="marks-form__title">{TITLES[exam]}</h2>
          <div className="marks-form__meta">
            <span><strong>CLASS:</strong> {cls?.name ?? "—"}</span>
            <span><strong>STREAM:</strong> {streamId === "all" ? "All" : streamId === "none" ? "—" : (stream?.name ?? "—")}</span>
            <span><strong>TERM:</strong> {term ? `${term.name} ${term.year}` : "—"}</span>
          </div>
        </div>

        {!classId ? (
          <p className="no-print text-sm text-muted-foreground py-6 text-center">Select a class to begin.</p>
        ) : (
          <>
            <table className="marks-form__table">
              <thead>
                <tr>
                  <th className="col-name">
                    <div className="diag-cell">
                      <span className="diag-sub">SUB</span>
                      <span className="diag-name">NAMES</span>
                    </div>
                  </th>
                  {subjects.map(s => (
                    <th key={s.id} className="col-sub">{s.code}</th>
                  ))}
                  <th>TOTAL</th>
                  <th>AVE</th>
                  <th>POSITION</th>
                  <th>AGG</th>
                  <th>DIV</th>
                </tr>
              </thead>
              <tbody>
                {filteredLearners.map((l) => {
                  const calc = rowCalcs.get(l.id);
                  const pos = positions.get(l.id) ?? 0;
                  return (
                    <tr key={l.id}>
                      <td className="col-name">{l.full_name}</td>
                      {subjects.map(s => {
                        const v = marks[`${l.id}|${s.id}`]?.[exam];
                        const grade = calc?.subjectGrades[s.id];
                        return (
                          <td key={s.id} className="col-sub">
                            <div className="mark-cell">
                              <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                max={s.max_marks}
                                value={v ?? ""}
                                onChange={(e) => setMark(l.id, s.id, e.target.value)}
                              />
                              <span className="mark-grade">{v != null && grade ? `(${grade})` : ""}</span>
                            </div>
                          </td>
                        );
                      })}
                      <td>{calc && calc.total > 0 ? calc.total : ""}</td>
                      <td>{calc && calc.total > 0 ? calc.ave : ""}</td>
                      <td>{pos > 0 ? pos : ""}</td>
                      <td>{calc && calc.total > 0 ? calc.agg : ""}</td>
                      <td>{calc && calc.total > 0 ? calc.div : ""}</td>
                    </tr>
                  );
                })}
                {/* pad with empty rows so the table feels register-like */}
                {Array.from({ length: Math.max(0, 5 - filteredLearners.length) }).map((_, i) => (
                  <tr key={`pad-${i}`} className="pad-row">
                    <td className="col-name">&nbsp;</td>
                    {subjects.map(s => <td key={s.id} className="col-sub">&nbsp;</td>)}
                    <td></td><td></td><td></td><td></td><td></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="marks-form__summary-wrap">
              <div className="marks-form__summary-title">SUMMARY</div>
              <table className="marks-form__summary">
                <thead>
                  <tr>
                    <th>DN</th>
                    <th>DIV1</th>
                    <th>DIV2</th>
                    <th>DIV3</th>
                    <th>DIV4</th>
                    <th>U</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>No.</td>
                    <td>{divSummary.I || ""}</td>
                    <td>{divSummary.II || ""}</td>
                    <td>{divSummary.III || ""}</td>
                    <td>{divSummary.IV || ""}</td>
                    <td>{divSummary.U || ""}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
