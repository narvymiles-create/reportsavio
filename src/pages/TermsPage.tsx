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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";

type AcademicYear = { id: string; year: number; is_current: boolean };

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
  start_date: z.string().optional().or(z.literal("")),
  end_date: z.string().optional().or(z.literal("")),
  next_begins_on: z.string().optional().or(z.literal("")),
  ends_on: z.string().optional().or(z.literal("")),
});

export default function TermsPage() {
  const { schoolId, isAdmin, isSuperAdmin } = useAuth();
  const canManage = isAdmin || isSuperAdmin;
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearOpen, setYearOpen] = useState(false);
  const [yearSubmitting, setYearSubmitting] = useState(false);
  const currentYear = years.find((y) => y.is_current);
  const [loading, setLoading] = useState(true);
  const [terms, setTerms] = useState<Term[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Term | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!schoolId) { setLoading(false); return; }
    setLoading(true);
    const [t, y] = await Promise.all([
      supabase.from("terms").select("*").eq("school_id", schoolId).order("name"),
      supabase.from("academic_years").select("id,year,is_current").eq("school_id", schoolId).order("year", { ascending: false }),
    ]);
    if (t.error || y.error) toast({ title: "Load failed", description: (t.error || y.error)?.message, variant: "destructive" });
    setTerms((t.data ?? []) as Term[]);
    setYears(y.data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [schoolId]);

  const addYear = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schoolId) return;
    const result = z.coerce.number().int().min(2000).max(2100).safeParse(new FormData(e.currentTarget).get("year"));
    if (!result.success) { toast({ title: "Enter a year between 2000 and 2100", variant: "destructive" }); return; }
    setYearSubmitting(true);
    const { error } = await supabase.from("academic_years").insert({ school_id: schoolId, year: result.data, is_current: !currentYear });
    setYearSubmitting(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else { setYearOpen(false); toast({ title: "Year added" }); await load(); }
  };

  const setCurrentYear = async (id: string) => {
    setYearSubmitting(true);
    const { error } = await supabase.rpc("set_current_academic_year", { _id: id });
    setYearSubmitting(false);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Current year updated" }); await load(); }
  };

  const deleteYear = async (id: string) => {
    if (!confirm("Delete this year?")) return;
    const { error } = await supabase.from("academic_years").delete().eq("id", id).eq("is_current", false);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else await load();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({
      name: fd.get("name"),
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
      if (!schoolId || !currentYear) { setSubmitting(false); return; }
      ({ error } = await supabase.from("terms").insert({ ...payload, school_id: schoolId, year: currentYear.year }));
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
      if (!schoolId) return;
      const { error } = await supabase.from("terms").update({ is_current: false }).eq("school_id", schoolId).neq("id", id);
      if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    }
    const { error } = await supabase.from("terms").update({ is_current: val }).eq("id", id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-3xl font-bold">Terms & Years</h1>
        {currentYear && <Badge variant="secondary">Current year: {currentYear.year}</Badge>}
      </div>
      <Tabs defaultValue="terms" className="space-y-4">
        <TabsList><TabsTrigger value="terms">Terms</TabsTrigger><TabsTrigger value="years">Years</TabsTrigger></TabsList>
        <TabsContent value="terms" className="space-y-4">
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Terms</h2>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button disabled={!canManage || !currentYear}><Plus className="h-4 w-4 mr-1" /> Add term</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit term" : "Add term"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name *</Label>
                  <Input id="name" name="name" defaultValue={editing?.name ?? "Term 1"} required maxLength={50} />
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
                    <TableCell className="text-sm text-muted-foreground">
                      {t.start_date || "—"} → {t.end_date || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.next_begins_on || "—"} → {t.ends_on || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch aria-label={`Set ${t.name} as current term`} disabled={!canManage} checked={t.is_current} onCheckedChange={(v) => setCurrent(t.id, v)} />
                        {t.is_current && <Badge>Current</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button aria-label={`Edit ${t.name}`} disabled={!canManage} size="icon" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button aria-label={`Delete ${t.name}`} disabled={!canManage} size="icon" variant="ghost" onClick={() => handleDelete(t.id)}>
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
        </TabsContent>
        <TabsContent value="years" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Years</h2>
            <Dialog open={yearOpen} onOpenChange={setYearOpen}>
              <DialogTrigger asChild><Button disabled={!canManage}><Plus className="h-4 w-4 mr-1" />Add year</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add year</DialogTitle></DialogHeader>
                <form onSubmit={addYear} className="space-y-4">
                  <div className="space-y-1.5"><Label htmlFor="academic-year">Year *</Label><Input id="academic-year" name="year" type="number" min={2000} max={2100} defaultValue={(currentYear?.year ?? new Date().getFullYear()) + 1} required /></div>
                  <DialogFooter><Button type="submit" disabled={yearSubmitting}>{yearSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add year</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Year</TableHead><TableHead>Current</TableHead><TableHead className="w-16" /></TableRow></TableHeader>
              <TableBody>{years.map((y) => <TableRow key={y.id}>
                <TableCell className="font-medium">{y.year}</TableCell>
                <TableCell><div className="flex items-center gap-2"><Switch aria-label={`Set ${y.year} as current year`} checked={y.is_current} disabled={!canManage || yearSubmitting || y.is_current} onCheckedChange={(v) => { if (v) setCurrentYear(y.id); }} />{y.is_current && <Badge>Current</Badge>}</div></TableCell>
                <TableCell><Button aria-label={`Delete year ${y.year}`} title={y.is_current ? "The current year cannot be deleted" : "Delete year"} size="icon" variant="ghost" disabled={!canManage || y.is_current || yearSubmitting} onClick={() => deleteYear(y.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
              </TableRow>)}</TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
