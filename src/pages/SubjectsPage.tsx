import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";

type SubjectCode = "ENG" | "MTC" | "SCI" | "SST" | "RE" | "ICT" | "OTHER";
const CODES: { code: SubjectCode; name: string }[] = [
  { code: "ENG", name: "English" },
  { code: "MTC", name: "Mathematics" },
  { code: "SCI", name: "Integrated Science" },
  { code: "SST", name: "Social Studies" },
  { code: "RE", name: "Religious Education" },
  { code: "ICT", name: "Computer Studies" },
  { code: "OTHER", name: "Other" },
];

type Teacher = { id: string; full_name: string };
type ClassRow = { id: string; name: string };
type Subject = {
  id: string;
  class_id: string;
  code: SubjectCode;
  name: string;
  max_marks: number;
  sort_order: number;
  subject_teacher_id: string | null;
};

const schema = z.object({
  class_id: z.string().uuid(),
  code: z.enum(["ENG", "MTC", "SCI", "SST", "RE", "ICT", "OTHER"]),
  name: z.string().trim().min(1).max(80),
  max_marks: z.coerce.number().min(1).max(1000),
  sort_order: z.coerce.number().int().min(0).max(999),
  subject_teacher_id: z.string().uuid().nullable().optional(),
});

export default function SubjectsPage() {
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classFilter, setClassFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const [c, t, s] = await Promise.all([
      supabase.from("classes").select("id, name").order("sort_order"),
      supabase.from("teachers").select("id, full_name").order("full_name"),
      supabase.from("subjects").select("*").order("sort_order").order("name"),
    ]);
    setClasses((c.data ?? []) as ClassRow[]);
    setTeachers((t.data ?? []) as Teacher[]);
    setSubjects((s.data ?? []) as Subject[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => (classFilter === "all" ? subjects : subjects.filter((s) => s.class_id === classFilter)),
    [subjects, classFilter]
  );

  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? "—";
  const teacherName = (id: string | null) => teachers.find((t) => t.id === id)?.full_name ?? "Unassigned";

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const teacherId = String(fd.get("subject_teacher_id") ?? "");
    const parsed = schema.safeParse({
      class_id: fd.get("class_id"),
      code: fd.get("code"),
      name: fd.get("name"),
      max_marks: fd.get("max_marks"),
      sort_order: fd.get("sort_order"),
      subject_teacher_id: teacherId && teacherId !== "none" ? teacherId : null,
    });
    if (!parsed.success) {
      toast({
        title: "Invalid input",
        description: Object.values(parsed.error.flatten().fieldErrors).flat().join(", "),
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    let error;
    if (editing) {
      ({ error } = await supabase.from("subjects").update(parsed.data).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("subjects").insert([parsed.data as any]));
    }
    setSubmitting(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editing ? "Subject updated" : "Subject added" });
      setOpen(false);
      setEditing(null);
      load();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this subject? Marks for it will be removed.")) return;
    const { error } = await supabase.from("subjects").delete().eq("id", id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Subject deleted" }); load(); }
  };

  const seedDefault = async (classId: string) => {
    const existing = subjects.filter((s) => s.class_id === classId).map((s) => s.code);
    const toAdd = CODES.filter((c) => c.code !== "OTHER" && !existing.includes(c.code));
    if (toAdd.length === 0) {
      toast({ title: "Already seeded", description: "All standard subjects exist for this class." });
      return;
    }
    const rows = toAdd.map((c, i) => ({
      class_id: classId,
      code: c.code,
      name: c.name,
      max_marks: 100,
      sort_order: i,
    }));
    const { error } = await supabase.from("subjects").insert(rows);
    if (error) toast({ title: "Seed failed", description: error.message, variant: "destructive" });
    else { toast({ title: `Added ${toAdd.length} subjects` }); load(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Subjects</h1>
          <p className="text-muted-foreground">Add subjects per class with max marks and assign subject teachers.</p>
        </div>
        <div className="flex gap-2">
          {classFilter !== "all" && (
            <Button variant="outline" onClick={() => seedDefault(classFilter)}>Seed default subjects</Button>
          )}
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button disabled={classes.length === 0}>
                <Plus className="h-4 w-4 mr-1" /> Add subject
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit subject" : "Add subject"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="class_id">Class *</Label>
                    <Select name="class_id" defaultValue={editing?.class_id ?? (classFilter !== "all" ? classFilter : classes[0]?.id)}>
                      <SelectTrigger id="class_id"><SelectValue placeholder="Select class" /></SelectTrigger>
                      <SelectContent>
                        {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="code">Code *</Label>
                    <Select name="code" defaultValue={editing?.code ?? "ENG"}>
                      <SelectTrigger id="code"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CODES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name *</Label>
                  <Input id="name" name="name" defaultValue={editing?.name ?? ""} required maxLength={80} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="max_marks">Max marks *</Label>
                    <Input id="max_marks" name="max_marks" type="number" min={1} max={1000} step="0.01" defaultValue={editing?.max_marks ?? 100} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sort_order">Sort order</Label>
                    <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={editing?.sort_order ?? 0} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="subject_teacher_id">Subject teacher</Label>
                  <Select name="subject_teacher_id" defaultValue={editing?.subject_teacher_id ?? "none"}>
                    <SelectTrigger id="subject_teacher_id"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editing ? "Save" : "Add subject"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-sm">Filter by class:</Label>
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader><CardTitle>Subjects</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {classes.length === 0
                ? "Create a class first, then add subjects to it."
                : "No subjects yet. Add one or use 'Seed default subjects' for the selected class."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Max marks</TableHead>
                  <TableHead>Subject teacher</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{className(s.class_id)}</TableCell>
                    <TableCell><Badge variant="outline">{s.code}</Badge></TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{Number(s.max_marks)}</TableCell>
                    <TableCell className="text-sm">{teacherName(s.subject_teacher_id)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => { setEditing(s); setOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(s.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
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
