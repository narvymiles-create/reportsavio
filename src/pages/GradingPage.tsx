import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";

type Grade = {
  id: string; grade: string; points: number; min_mark: number; max_mark: number;
  remark: string | null; sort_order: number;
};
type Division = {
  id: string; division: string; min_aggregate: number; max_aggregate: number;
  description: string | null; sort_order: number;
};

const DEFAULT_GRADES: Omit<Grade, "id">[] = [
  { grade: "D1", points: 1, min_mark: 80, max_mark: 100, remark: "Distinction", sort_order: 1 },
  { grade: "D2", points: 2, min_mark: 75, max_mark: 79, remark: "Distinction", sort_order: 2 },
  { grade: "C3", points: 3, min_mark: 70, max_mark: 74, remark: "Credit", sort_order: 3 },
  { grade: "C4", points: 4, min_mark: 65, max_mark: 69, remark: "Credit", sort_order: 4 },
  { grade: "C5", points: 5, min_mark: 60, max_mark: 64, remark: "Credit", sort_order: 5 },
  { grade: "C6", points: 6, min_mark: 55, max_mark: 59, remark: "Credit", sort_order: 6 },
  { grade: "P7", points: 7, min_mark: 50, max_mark: 54, remark: "Pass", sort_order: 7 },
  { grade: "P8", points: 8, min_mark: 45, max_mark: 49, remark: "Pass", sort_order: 8 },
  { grade: "F9", points: 9, min_mark: 0, max_mark: 44, remark: "Fail", sort_order: 9 },
];
const DEFAULT_DIVISIONS: Omit<Division, "id">[] = [
  { division: "1", min_aggregate: 4, max_aggregate: 12, description: "Excellent", sort_order: 1 },
  { division: "2", min_aggregate: 13, max_aggregate: 23, description: "Very Good", sort_order: 2 },
  { division: "3", min_aggregate: 24, max_aggregate: 30, description: "Good", sort_order: 3 },
  { division: "4", min_aggregate: 31, max_aggregate: 34, description: "Pass", sort_order: 4 },
  { division: "U", min_aggregate: 35, max_aggregate: 999, description: "Ungraded", sort_order: 5 },
];

export default function GradingPage() {
  const [loading, setLoading] = useState(true);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);

  const [gOpen, setGOpen] = useState(false);
  const [gEdit, setGEdit] = useState<Grade | null>(null);
  const [dOpen, setDOpen] = useState(false);
  const [dEdit, setDEdit] = useState<Division | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [g, d] = await Promise.all([
      supabase.from("grading_scales").select("*").order("sort_order"),
      supabase.from("division_rules").select("*").order("sort_order"),
    ]);
    setGrades((g.data ?? []) as Grade[]);
    setDivisions((d.data ?? []) as Division[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const seedGrades = async () => {
    setBusy(true);
    const { error } = await supabase.from("grading_scales").insert(DEFAULT_GRADES);
    setBusy(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Default grading scale added" });
    load();
  };
  const seedDivisions = async () => {
    setBusy(true);
    const { error } = await supabase.from("division_rules").insert(DEFAULT_DIVISIONS);
    setBusy(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Default divisions added" });
    load();
  };

  const submitGrade = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      grade: String(fd.get("grade") ?? "").trim(),
      points: Number(fd.get("points")),
      min_mark: Number(fd.get("min_mark")),
      max_mark: Number(fd.get("max_mark")),
      remark: String(fd.get("remark") ?? "") || null,
      sort_order: Number(fd.get("sort_order") ?? 0),
    };
    setBusy(true);
    const res = gEdit
      ? await supabase.from("grading_scales").update(payload).eq("id", gEdit.id)
      : await supabase.from("grading_scales").insert([payload]);
    setBusy(false);
    if (res.error) return toast({ title: "Failed", description: res.error.message, variant: "destructive" });
    toast({ title: gEdit ? "Grade updated" : "Grade added" });
    setGOpen(false); setGEdit(null); load();
  };

  const submitDivision = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      division: String(fd.get("division") ?? "").trim(),
      min_aggregate: Number(fd.get("min_aggregate")),
      max_aggregate: Number(fd.get("max_aggregate")),
      description: String(fd.get("description") ?? "") || null,
      sort_order: Number(fd.get("sort_order") ?? 0),
    };
    setBusy(true);
    const res = dEdit
      ? await supabase.from("division_rules").update(payload).eq("id", dEdit.id)
      : await supabase.from("division_rules").insert([payload]);
    setBusy(false);
    if (res.error) return toast({ title: "Failed", description: res.error.message, variant: "destructive" });
    toast({ title: dEdit ? "Division updated" : "Division added" });
    setDOpen(false); setDEdit(null); load();
  };

  const removeGrade = async (id: string) => {
    if (!confirm("Delete this grade band?")) return;
    const { error } = await supabase.from("grading_scales").delete().eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    load();
  };
  const removeDivision = async (id: string) => {
    if (!confirm("Delete this division?")) return;
    const { error } = await supabase.from("division_rules").delete().eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    load();
  };

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Grading System</h1>
        <p className="text-muted-foreground">Configure grade bands and division rules used across all report cards.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Grade Bands</CardTitle>
          <div className="flex gap-2">
            {grades.length === 0 && (
              <Button variant="outline" onClick={seedGrades} disabled={busy}>
                <Sparkles className="mr-2 h-4 w-4" /> Seed defaults
              </Button>
            )}
            <Dialog open={gOpen} onOpenChange={(o) => { setGOpen(o); if (!o) setGEdit(null); }}>
              <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Add Grade</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{gEdit ? "Edit" : "Add"} Grade Band</DialogTitle></DialogHeader>
                <form onSubmit={submitGrade} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Grade</Label><Input name="grade" defaultValue={gEdit?.grade} required /></div>
                    <div><Label>Points</Label><Input name="points" type="number" min="1" max="9" defaultValue={gEdit?.points} required /></div>
                    <div><Label>Min mark</Label><Input name="min_mark" type="number" step="0.01" defaultValue={gEdit?.min_mark} required /></div>
                    <div><Label>Max mark</Label><Input name="max_mark" type="number" step="0.01" defaultValue={gEdit?.max_mark} required /></div>
                    <div className="col-span-2"><Label>Remark</Label><Input name="remark" defaultValue={gEdit?.remark ?? ""} /></div>
                    <div><Label>Sort order</Label><Input name="sort_order" type="number" defaultValue={gEdit?.sort_order ?? 0} /></div>
                  </div>
                  <DialogFooter><Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {grades.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No grade bands yet. Seed defaults to use the standard Ugandan PLE scale.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Grade</TableHead><TableHead>Points</TableHead><TableHead>Range</TableHead><TableHead>Remark</TableHead><TableHead className="w-24"></TableHead></TableRow></TableHeader>
              <TableBody>
                {grades.map(g => (
                  <TableRow key={g.id}>
                    <TableCell className="font-semibold">{g.grade}</TableCell>
                    <TableCell>{g.points}</TableCell>
                    <TableCell>{g.min_mark} – {g.max_mark}</TableCell>
                    <TableCell>{g.remark}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => { setGEdit(g); setGOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => removeGrade(g.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Division Rules</CardTitle>
          <div className="flex gap-2">
            {divisions.length === 0 && (
              <Button variant="outline" onClick={seedDivisions} disabled={busy}>
                <Sparkles className="mr-2 h-4 w-4" /> Seed defaults
              </Button>
            )}
            <Dialog open={dOpen} onOpenChange={(o) => { setDOpen(o); if (!o) setDEdit(null); }}>
              <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Add Division</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{dEdit ? "Edit" : "Add"} Division</DialogTitle></DialogHeader>
                <form onSubmit={submitDivision} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2"><Label>Division</Label><Input name="division" defaultValue={dEdit?.division} required /></div>
                    <div><Label>Min aggregate</Label><Input name="min_aggregate" type="number" defaultValue={dEdit?.min_aggregate} required /></div>
                    <div><Label>Max aggregate</Label><Input name="max_aggregate" type="number" defaultValue={dEdit?.max_aggregate} required /></div>
                    <div className="col-span-2"><Label>Description</Label><Input name="description" defaultValue={dEdit?.description ?? ""} /></div>
                    <div><Label>Sort order</Label><Input name="sort_order" type="number" defaultValue={dEdit?.sort_order ?? 0} /></div>
                  </div>
                  <DialogFooter><Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {divisions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No divisions yet. Seed defaults for the standard Division I–IV scheme.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Division</TableHead><TableHead>Aggregate Range</TableHead><TableHead>Description</TableHead><TableHead className="w-24"></TableHead></TableRow></TableHeader>
              <TableBody>
                {divisions.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="font-semibold">{d.division}</TableCell>
                    <TableCell>{d.min_aggregate} – {d.max_aggregate}</TableCell>
                    <TableCell>{d.description}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => { setDEdit(d); setDOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => removeDivision(d.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
