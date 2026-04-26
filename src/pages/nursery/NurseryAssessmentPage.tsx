import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

type Cls = { id: string; name: string };
type Term = { id: string; name: string; year: number; is_current: boolean };
type Learner = { id: string; full_name: string; class_id: string | null };
type Area = { id: string; name: string; sort_order: number };
type GC = { id: string; grade: string; label: string; color: string };
type Asmt = { id?: string; learner_id: string; term_id: string; learning_area_id: string; grade: string | null; comment: string | null };

export default function NurseryAssessmentPage() {
  const [classes, setClasses] = useState<Cls[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [colors, setColors] = useState<GC[]>([]);
  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");
  const [learnerId, setLearnerId] = useState("");
  const [data, setData] = useState<Record<string, { grade: string; comment: string }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, t, a, g] = await Promise.all([
        supabase.from("nursery_classes" as any).select("id,name").order("sort_order"),
        supabase.from("terms" as any).select("id,name,year,is_current").order("year", { ascending: false }),
        supabase.from("nursery_learning_areas" as any).select("*").order("sort_order"),
        supabase.from("nursery_grade_colors" as any).select("*").order("sort_order"),
      ]);
      setClasses((c.data as any) ?? []);
      const ts = (t.data as any) ?? [];
      setTerms(ts);
      const cur = ts.find((x: Term) => x.is_current);
      if (cur) setTermId(cur.id);
      setAreas((a.data as any) ?? []);
      setColors((g.data as any) ?? []);
    })();
  }, []);

  useEffect(() => {
    if (!classId) { setLearners([]); setLearnerId(""); return; }
    supabase.from("nursery_learners" as any).select("id,full_name,class_id").eq("class_id", classId).order("full_name").then(({ data }) => {
      setLearners((data as any) ?? []);
    });
  }, [classId]);

  useEffect(() => {
    if (!learnerId || !termId) { setData({}); return; }
    supabase.from("nursery_assessments" as any).select("*").eq("learner_id", learnerId).eq("term_id", termId).then(({ data }) => {
      const m: Record<string, { grade: string; comment: string }> = {};
      (data as any[] ?? []).forEach((r) => { m[r.learning_area_id] = { grade: r.grade ?? "", comment: r.comment ?? "" }; });
      setData(m);
    });
  }, [learnerId, termId]);

  const setRow = (areaId: string, patch: Partial<{ grade: string; comment: string }>) => {
    setData((d) => ({ ...d, [areaId]: { grade: d[areaId]?.grade ?? "", comment: d[areaId]?.comment ?? "", ...patch } }));
  };

  const save = async () => {
    if (!learnerId || !termId) return;
    setSaving(true);
    const rows = areas.map((a) => ({
      learner_id: learnerId,
      term_id: termId,
      learning_area_id: a.id,
      grade: data[a.id]?.grade || null,
      comment: data[a.id]?.comment || null,
    }));
    const { error } = await supabase.from("nursery_assessments" as any).upsert(rows, { onConflict: "learner_id,term_id,learning_area_id" });
    setSaving(false);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: "Saved", description: "Assessment updated." });
  };

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Nursery Assessment Entry</CardTitle>
          <CardDescription>Pick grades and write comments per learning area. No marks, no aggregates.</CardDescription>
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
              <div className="border rounded-md divide-y">
                {areas.map((a) => (
                  <div key={a.id} className="flex flex-col md:flex-row md:items-center gap-2 p-3">
                    <div className="font-medium md:w-56">{a.name}</div>
                    <Input
                      placeholder="Comment / remark"
                      value={data[a.id]?.comment ?? ""}
                      onChange={(e) => setRow(a.id, { comment: e.target.value })}
                      className="flex-1"
                    />
                    <div className="flex gap-1">
                      {colors.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setRow(a.id, { grade: g.grade })}
                          className="w-9 h-9 rounded font-bold text-white text-sm border-2 transition"
                          style={{ background: g.color, borderColor: data[a.id]?.grade === g.grade ? "#000" : "transparent" }}
                          title={g.label}
                        >
                          {g.grade}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" />{saving ? "Saving..." : "Save Assessment"}</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
