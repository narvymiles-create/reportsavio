import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, X } from "lucide-react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Teacher = { id: string; full_name: string };
type Stream = { id: string; class_id: string; name: string };
type ClassRow = {
  id: string;
  name: string;
  level: string | null;
  sort_order: number;
  class_teacher_id: string | null;
};

const LEVEL_OPTIONS = [
  { value: "Lower", label: "Lower (P1–P3)" },
  { value: "Upper", label: "Upper (P4–P7)" },
];

const classSchema = z.object({
  name: z.string().trim().min(1).max(50),
  level: z.enum(["Lower", "Upper"]).optional().or(z.literal("")),
  sort_order: z.coerce.number().int().min(0).max(999),
  class_teacher_id: z.string().uuid().nullable().optional(),
});

export default function ClassesPage() {
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [editing, setEditing] = useState<ClassRow | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const [c, s, t] = await Promise.all([
      supabase.from("classes").select("*").order("sort_order").order("name"),
      supabase.from("streams").select("*").order("name"),
      supabase.from("teachers").select("id, full_name").order("full_name"),
    ]);
    setClasses((c.data ?? []) as ClassRow[]);
    setStreams((s.data ?? []) as Stream[]);
    setTeachers((t.data ?? []) as Teacher[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const teacherId = String(fd.get("class_teacher_id") ?? "");
    const parsed = classSchema.safeParse({
      name: fd.get("name"),
      level: fd.get("level"),
      sort_order: fd.get("sort_order"),
      class_teacher_id: teacherId && teacherId !== "none" ? teacherId : null,
    });
    if (!parsed.success) {
      toast({
        title: "Invalid input",
        description: Object.values(parsed.error.flatten().fieldErrors).flat().join(", "),
        variant: "destructive",
      });
      return;
    }
    const payload = { ...parsed.data, level: parsed.data.level || null };
    setSubmitting(true);
    let error;
    if (editing) {
      ({ error } = await supabase.from("classes").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("classes").insert([payload as any]));
    }
    setSubmitting(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editing ? "Class updated" : "Class added" });
      setOpen(false);
      setEditing(null);
      load();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this class? Its streams, subjects, and learners will be removed.")) return;
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Class deleted" });
      load();
    }
  };

  const addStream = async (classId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed.length > 30) {
      toast({ title: "Stream name too long", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("streams").insert({ class_id: classId, name: trimmed });
    if (error) {
      toast({ title: "Add stream failed", description: error.message, variant: "destructive" });
    } else {
      load();
    }
  };

  const removeStream = async (id: string) => {
    const { error } = await supabase.from("streams").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else load();
  };

  const teacherName = (id: string | null) => teachers.find((t) => t.id === id)?.full_name ?? "Unassigned";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Classes &amp; Streams</h1>
          <p className="text-muted-foreground">Create classes, assign class teachers, and manage streams.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Add class</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit class" : "Add class"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name *</Label>
                  <Input id="name" name="name" defaultValue={editing?.name ?? ""} required maxLength={50} placeholder="e.g. P1" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="level">Level</Label>
                  <Input id="level" name="level" defaultValue={editing?.level ?? ""} maxLength={20} placeholder="Lower / Upper" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sort_order">Sort order</Label>
                  <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={editing?.sort_order ?? 0} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="class_teacher_id">Class teacher</Label>
                  <Select name="class_teacher_id" defaultValue={editing?.class_teacher_id ?? "none"}>
                    <SelectTrigger id="class_teacher_id"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {teachers.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editing ? "Save" : "Add class"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : classes.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No classes yet. Add your first class (e.g. P1).</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((c) => {
            const myStreams = streams.filter((s) => s.class_id === c.id);
            return (
              <Card key={c.id}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                  <div>
                    <CardTitle className="text-xl">{c.name}</CardTitle>
                    {c.level && <p className="text-xs text-muted-foreground">{c.level}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Class teacher</div>
                    <div className="text-sm">{teacherName(c.class_teacher_id)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1.5">Streams</div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {myStreams.length === 0 && (
                        <span className="text-xs text-muted-foreground">None yet</span>
                      )}
                      {myStreams.map((s) => (
                        <Badge key={s.id} variant="secondary" className="gap-1">
                          {s.name}
                          <button onClick={() => removeStream(s.id)} className="hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <form
                      className="flex gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        addStream(c.id, String(fd.get("stream") ?? ""));
                        e.currentTarget.reset();
                      }}
                    >
                      <Input name="stream" placeholder="Stream name (e.g. A)" maxLength={30} className="h-8 text-sm" />
                      <Button type="submit" size="sm" variant="outline">Add</Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
