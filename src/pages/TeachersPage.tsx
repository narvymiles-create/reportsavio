import { useEffect, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, ClipboardList } from "lucide-react";
import { useReportModule } from "@/hooks/useReportModule";

type TeacherRole = "class_teacher" | "head_teacher" | "subject_teacher";
type Teacher = {
  id: string;
  full_name: string;
  role: TeacherRole;
  initials: string | null;
  email: string | null;
  phone: string | null;
};

type ClassRow = { id: string; name: string; class_teacher_id: string | null };
type SubjectRow = { id: string; name: string; code: string; code_label: string | null; class_id: string; subject_teacher_id: string | null };

type Assignment = {
  classes: { id: string; name: string }[];
  subjects: { id: string; name: string; class_name: string }[];
};

const schema = z.object({
  full_name: z.string().trim().min(1).max(150),
  role: z.enum(["class_teacher", "head_teacher", "subject_teacher"]),
  initials: z.string().trim().max(20).optional().or(z.literal("")),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
});

const ROLE_LABEL: Record<TeacherRole, string> = {
  class_teacher: "Class teacher",
  head_teacher: "Head teacher",
  subject_teacher: "Subject teacher",
};

function autoInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .filter(Boolean)
    .join(".");
}

export default function TeachersPage() {
  const { module } = useReportModule();
  const section = module === "nursery" ? "nursery" : "primary";
  const classesTable = module === "nursery" ? "nursery_classes" : "classes";
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});

  // Add/Edit teacher dialog
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Controlled name → auto initials (editable)
  const [formName, setFormName] = useState("");
  const [formInitials, setFormInitials] = useState("");
  const [initialsTouched, setInitialsTouched] = useState(false);

  // Edit Assignment dialog
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTeacher, setAssignTeacher] = useState<Teacher | null>(null);
  const [assignClassId, setAssignClassId] = useState<string>("none");
  const [assignSubjects, setAssignSubjects] = useState<Set<string>>(new Set());
  const [assignSaving, setAssignSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const teachersQ = (supabase.from("teachers") as any).select("*").eq("section", section).order("full_name");
    const classesQ = (supabase.from(classesTable) as any).select("id, name, class_teacher_id").order("sort_order").order("name");
    const subjectsQ: Promise<any> = module === "nursery"
      ? Promise.resolve({ data: [] as any[] })
      : (supabase.from("subjects") as any).select("id, name, code, code_label, class_id, subject_teacher_id, classes(name)");
    const [tRes, cRes, sRes] = await Promise.all([teachersQ, classesQ, subjectsQ]);
    const t = (tRes as any).data; const cls = (cRes as any).data; const subs = (sRes as any).data;
    setTeachers((t ?? []) as Teacher[]);
    setClasses((cls ?? []) as ClassRow[]);
    setSubjects((subs ?? []) as any);

    const map: Record<string, Assignment> = {};
    (t ?? []).forEach((tt: any) => (map[tt.id] = { classes: [], subjects: [] }));
    (cls ?? []).forEach((c: any) => {
      if (c.class_teacher_id && map[c.class_teacher_id]) {
        map[c.class_teacher_id].classes.push({ id: c.id, name: c.name });
      }
    });
    (subs ?? []).forEach((s: any) => {
      if (s.subject_teacher_id && map[s.subject_teacher_id]) {
        map[s.subject_teacher_id].subjects.push({
          id: s.id,
          name: s.name,
          class_name: s.classes?.name ?? "",
        });
      }
    });
    setAssignments(map);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [module]);

  const openTeacherDialog = (t: Teacher | null) => {
    setEditing(t);
    setFormName(t?.full_name ?? "");
    setFormInitials(t?.initials ?? (t ? autoInitials(t.full_name) : ""));
    setInitialsTouched(!!t?.initials);
    setOpen(true);
  };

  const onNameChange = (v: string) => {
    setFormName(v);
    if (!initialsTouched) setFormInitials(autoInitials(v));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({
      full_name: formName,
      role: fd.get("role"),
      initials: formInitials,
      email: fd.get("email"),
      phone: fd.get("phone"),
    });
    if (!parsed.success) {
      toast({
        title: "Invalid input",
        description: Object.values(parsed.error.flatten().fieldErrors).flat().join(", "),
        variant: "destructive",
      });
      return;
    }
    const payload = {
      ...parsed.data,
      initials: parsed.data.initials || autoInitials(parsed.data.full_name) || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
    };
    setSubmitting(true);
    let error;
    if (editing) {
      ({ error } = await supabase.from("teachers").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("teachers").insert([payload as any]));
    }
    setSubmitting(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editing ? "Teacher updated" : "Teacher added" });
      setOpen(false);
      setEditing(null);
      load();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this teacher? Their assignments will be cleared.")) return;
    const { error } = await supabase.from("teachers").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Teacher deleted" });
      load();
    }
  };

  // ---------- Edit Assignment ----------
  const openAssign = (t: Teacher) => {
    setAssignTeacher(t);
    const currentClass = classes.find((c) => c.class_teacher_id === t.id);
    setAssignClassId(currentClass?.id ?? "none");
    setAssignSubjects(new Set(subjects.filter((s) => s.subject_teacher_id === t.id).map((s) => s.id)));
    setAssignOpen(true);
  };

  const toggleSubject = (id: string) => {
    setAssignSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const saveAssignment = async () => {
    if (!assignTeacher) return;
    setAssignSaving(true);
    try {
      // Class teacher reassignment: clear previous class first, then set new
      const previousClass = classes.find((c) => c.class_teacher_id === assignTeacher.id);
      const newClassId = assignClassId === "none" ? null : assignClassId;

      // If newClassId is taken by another teacher, warn but allow reassignment (clear theirs)
      if (newClassId) {
        const conflict = classes.find((c) => c.id === newClassId && c.class_teacher_id && c.class_teacher_id !== assignTeacher.id);
        if (conflict) {
          if (!confirm(`This class is already assigned to another teacher. Reassign to ${assignTeacher.full_name}?`)) {
            setAssignSaving(false);
            return;
          }
          // Clear the conflicting class first
          await supabase.from("classes").update({ class_teacher_id: null }).eq("id", newClassId);
        }
      }

      // Clear previous if changing
      if (previousClass && previousClass.id !== newClassId) {
        await supabase.from("classes").update({ class_teacher_id: null }).eq("id", previousClass.id);
      }
      if (newClassId) {
        const { error } = await supabase.from("classes").update({ class_teacher_id: assignTeacher.id }).eq("id", newClassId);
        if (error) throw error;
      }

      // Subjects: assign selected, unassign deselected
      const currentSubjectIds = subjects.filter((s) => s.subject_teacher_id === assignTeacher.id).map((s) => s.id);
      const toAssign = [...assignSubjects].filter((id) => !currentSubjectIds.includes(id));
      const toUnassign = currentSubjectIds.filter((id) => !assignSubjects.has(id));

      if (toAssign.length) {
        const { error } = await supabase.from("subjects").update({ subject_teacher_id: assignTeacher.id }).in("id", toAssign);
        if (error) throw error;
      }
      if (toUnassign.length) {
        const { error } = await supabase.from("subjects").update({ subject_teacher_id: null }).in("id", toUnassign);
        if (error) throw error;
      }

      toast({ title: "Assignment updated" });
      setAssignOpen(false);
      setAssignTeacher(null);
      load();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setAssignSaving(false);
    }
  };

  const subjectDisplayCode = (s: SubjectRow) => (s.code === "OTHER" && s.code_label ? s.code_label : s.code);
  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? "";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Teachers</h1>
          <p className="text-muted-foreground">Manage teachers, auto-generate initials, and edit assignments.</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={() => openTeacherDialog(null)}>
              <Plus className="h-4 w-4 mr-1" /> Add teacher
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit teacher" : "Add teacher"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Full name *</Label>
                <Input id="full_name" name="full_name" value={formName} onChange={(e) => onNameChange(e.target.value)} required maxLength={150} placeholder="e.g. Mary Ann Smith" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="role">Role *</Label>
                  <Select name="role" defaultValue={editing?.role ?? "subject_teacher"}>
                    <SelectTrigger id="role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="class_teacher">Class teacher</SelectItem>
                      <SelectItem value="subject_teacher">Subject teacher</SelectItem>
                      <SelectItem value="head_teacher">Head teacher</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="initials">Initials (auto)</Label>
                  <Input
                    id="initials"
                    name="initials"
                    value={formInitials}
                    onChange={(e) => { setFormInitials(e.target.value.toUpperCase()); setInitialsTouched(true); }}
                    maxLength={20}
                    placeholder="e.g. M.A.S"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" defaultValue={editing?.email ?? ""} maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" name="phone" defaultValue={editing?.phone ?? ""} maxLength={50} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editing ? "Save" : "Add teacher"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Assignment Dialog */}
      <Dialog open={assignOpen} onOpenChange={(o) => { setAssignOpen(o); if (!o) setAssignTeacher(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit assignment — {assignTeacher?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Class teacher of</Label>
              <Select value={assignClassId} onValueChange={setAssignClassId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Not a class teacher —</SelectItem>
                  {classes.map((c) => {
                    const taken = c.class_teacher_id && c.class_teacher_id !== assignTeacher?.id;
                    const otherTeacher = teachers.find((t) => t.id === c.class_teacher_id);
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}{taken ? ` ⚠ assigned to ${otherTeacher?.full_name ?? "another teacher"}` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Selecting a class already assigned to another teacher will reassign it.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Subjects taught</Label>
              <div className="max-h-64 overflow-y-auto border rounded-md p-2 space-y-1">
                {subjects.length === 0 && <p className="text-sm text-muted-foreground">No subjects available.</p>}
                {subjects.map((s) => {
                  const otherTeacher = s.subject_teacher_id && s.subject_teacher_id !== assignTeacher?.id
                    ? teachers.find((t) => t.id === s.subject_teacher_id)
                    : null;
                  return (
                    <label key={s.id} className="flex items-center gap-2 text-sm py-1 cursor-pointer hover:bg-muted/50 px-1 rounded">
                      <Checkbox checked={assignSubjects.has(s.id)} onCheckedChange={() => toggleSubject(s.id)} />
                      <span className="flex-1">
                        <span className="font-mono text-xs mr-2">{subjectDisplayCode(s)}</span>
                        {s.name} <span className="text-muted-foreground">· {className(s.class_id)}</span>
                      </span>
                      {otherTeacher && <span className="text-xs text-amber-600">currently {otherTeacher.full_name}</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={saveAssignment} disabled={assignSaving}>
              {assignSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>All teachers</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : teachers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No teachers yet. Add the first one.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Initials</TableHead>
                  <TableHead>Assignments</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="w-56" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {teachers.map((t) => {
                  const a = assignments[t.id] ?? { classes: [], subjects: [] };
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.full_name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{ROLE_LABEL[t.role]}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{t.initials ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {a.classes.map((c) => (
                            <Badge key={"c" + c.id} variant="outline" className="bg-primary/5">CT: {c.name}</Badge>
                          ))}
                          {a.subjects.map((s) => (
                            <Badge key={"s" + s.id} variant="outline">{s.class_name} · {s.name}</Badge>
                          ))}
                          {a.classes.length === 0 && a.subjects.length === 0 && (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {t.email && <div>{t.email}</div>}
                        {t.phone && <div>{t.phone}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => openAssign(t)}>
                            <ClipboardList className="h-3.5 w-3.5 mr-1" /> Edit Assignment
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => openTeacherDialog(t)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleDelete(t.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
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
