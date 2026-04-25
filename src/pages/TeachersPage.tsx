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
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";

type TeacherRole = "class_teacher" | "head_teacher" | "subject_teacher";
type Teacher = {
  id: string;
  full_name: string;
  role: TeacherRole;
  initials: string | null;
  email: string | null;
  phone: string | null;
};

type Assignment = {
  classes: { id: string; name: string }[];
  subjects: { id: string; name: string; class_name: string }[];
};

const schema = z.object({
  full_name: z.string().trim().min(1).max(150),
  role: z.enum(["class_teacher", "head_teacher", "subject_teacher"]),
  initials: z.string().trim().max(10).optional().or(z.literal("")),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
});

const ROLE_LABEL: Record<TeacherRole, string> = {
  class_teacher: "Class teacher",
  head_teacher: "Head teacher",
  subject_teacher: "Subject teacher",
};

export default function TeachersPage() {
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: t }, { data: cls }, { data: subs }] = await Promise.all([
      supabase.from("teachers").select("*").order("full_name"),
      supabase.from("classes").select("id, name, class_teacher_id"),
      supabase.from("subjects").select("id, name, subject_teacher_id, classes(name)"),
    ]);
    setTeachers((t ?? []) as Teacher[]);
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
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({
      full_name: fd.get("full_name"),
      role: fd.get("role"),
      initials: fd.get("initials"),
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
      initials: parsed.data.initials || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
    };
    setSubmitting(true);
    let error;
    if (editing) {
      ({ error } = await supabase.from("teachers").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("teachers").insert(payload));
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

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Teachers</h1>
          <p className="text-muted-foreground">Manage teachers and view all their assignments.</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button>
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
                <Input id="full_name" name="full_name" defaultValue={editing?.full_name ?? ""} required maxLength={150} />
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
                  <Label htmlFor="initials">Initials</Label>
                  <Input id="initials" name="initials" defaultValue={editing?.initials ?? ""} maxLength={10} placeholder="e.g. J.K." />
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
                  <TableHead className="w-24" />
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
                          <Button size="icon" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}>
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
