import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";

type Term = {
  id: string;
  name: string;
  year: number;
  start_date: string | null;
  end_date: string | null;
  next_begins_on: string | null;
  ends_on: string | null;
  is_current: boolean;
};

const schema = z.object({
  name: z.string().trim().min(1).max(50),
  year: z.coerce.number().int().min(2000).max(2100),
  start_date: z.string().optional().or(z.literal("")),
  end_date: z.string().optional().or(z.literal("")),
  next_begins_on: z.string().optional().or(z.literal("")),
  ends_on: z.string().optional().or(z.literal("")),
});

export default function TermsPage() {
  const [loading, setLoading] = useState(true);
  const [terms, setTerms] = useState<Term[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Term | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("terms")
      .select("*")
      .order("year", { ascending: false })
      .order("name");
    setTerms((data ?? []) as Term[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({
      name: fd.get("name"),
      year: fd.get("year"),
      start_date: fd.get("start_date"),
      end_date: fd.get("end_date"),
      next_begins_on: fd.get("next_begins_on"),
      ends_on: fd.get("ends_on"),
    });
    if (!parsed.success) {
      toast({ title: "Invalid input", description: Object.values(parsed.error.flatten().fieldErrors).flat().join(", "), variant: "destructive" });
      return;
    }
    const payload = {
      name: parsed.data.name,
      year: parsed.data.year,
      start_date: parsed.data.start_date || null,
      end_date: parsed.data.end_date || null,
      next_begins_on: parsed.data.next_begins_on || null,
      ends_on: parsed.data.ends_on || null,
    };
    setSubmitting(true);
    let error;
    if (editing) {
      ({ error } = await supabase.from("terms").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("terms").insert([payload as any]));
    }
    setSubmitting(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editing ? "Term updated" : "Term added" });
      setOpen(false);
      setEditing(null);
      load();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this term? Marks tied to it will be removed.")) return;
    const { error } = await supabase.from("terms").delete().eq("id", id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Term deleted" }); load(); }
  };

  const setCurrent = async (id: string, val: boolean) => {
    if (val) {
      // unset all others first
      await supabase.from("terms").update({ is_current: false }).neq("id", id);
    }
    const { error } = await supabase.from("terms").update({ is_current: val }).eq("id", id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Academic Terms</h1>
          <p className="text-muted-foreground">Define terms with dates. Mark one as current.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Add term</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit term" : "Add term"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name *</Label>
                  <Input id="name" name="name" defaultValue={editing?.name ?? "Term 1"} required maxLength={50} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="year">Year *</Label>
                  <Input id="year" name="year" type="number" min={2000} max={2100} defaultValue={editing?.year ?? new Date().getFullYear()} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="start_date">Start date</Label>
                  <Input id="start_date" name="start_date" type="date" defaultValue={editing?.start_date ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end_date">End date</Label>
                  <Input id="end_date" name="end_date" type="date" defaultValue={editing?.end_date ?? ""} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="next_begins_on">Next term begins</Label>
                  <Input id="next_begins_on" name="next_begins_on" type="date" defaultValue={editing?.next_begins_on ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ends_on">Next term ends</Label>
                  <Input id="ends_on" name="ends_on" type="date" defaultValue={editing?.ends_on ?? ""} />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editing ? "Save" : "Add term"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Terms</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : terms.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No terms yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Term</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Next begins / ends</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {terms.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.year}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.start_date || "—"} → {t.end_date || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.next_begins_on || "—"} → {t.ends_on || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch checked={t.is_current} onCheckedChange={(v) => setCurrent(t.id, v)} />
                        {t.is_current && <Badge>Current</Badge>}
                      </div>
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
