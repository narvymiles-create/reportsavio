import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";

type Audience = "class_teacher" | "head_teacher";
type Tpl = { id: string; audience: Audience; min_average: number; max_average: number; text: string };

const DEFAULTS: Omit<Tpl, "id">[] = [
  // Class teacher
  { audience: "class_teacher", min_average: 80, max_average: 100, text: "Excellent performance, {name}! Keep up the outstanding work." },
  { audience: "class_teacher", min_average: 80, max_average: 100, text: "An exemplary effort this term. Continue to aim higher." },
  { audience: "class_teacher", min_average: 65, max_average: 79, text: "A very good result, {name}. With more effort you can reach the top." },
  { audience: "class_teacher", min_average: 65, max_average: 79, text: "Good performance overall. Strengthen the weaker subjects." },
  { audience: "class_teacher", min_average: 50, max_average: 64, text: "A fair attempt. More revision is needed to improve." },
  { audience: "class_teacher", min_average: 0, max_average: 49, text: "Unsatisfactory performance. {name} must work much harder next term." },
  // Head teacher
  { audience: "head_teacher", min_average: 80, max_average: 100, text: "A brilliant performance. Congratulations and keep it up." },
  { audience: "head_teacher", min_average: 65, max_average: 79, text: "A commendable result. Consistent effort will take you further." },
  { audience: "head_teacher", min_average: 50, max_average: 64, text: "An average performance. Aim for higher grades next term." },
  { audience: "head_teacher", min_average: 0, max_average: 49, text: "Disappointing. Revise your work daily and seek help from teachers." },
];

export default function CommentsPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Tpl[]>([]);
  const [tab, setTab] = useState<Audience>("class_teacher");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Tpl | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("comment_templates")
      .select("*")
      .order("audience").order("min_average", { ascending: false });
    setItems((data ?? []) as Tpl[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const seed = async () => {
    setBusy(true);
    const { error } = await supabase.from("comment_templates").insert(DEFAULTS);
    setBusy(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Default comments added" });
    load();
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      audience: String(fd.get("audience")) as Audience,
      min_average: Number(fd.get("min_average")),
      max_average: Number(fd.get("max_average")),
      text: String(fd.get("text") ?? "").trim(),
    };
    if (!payload.text) return toast({ title: "Text required", variant: "destructive" });
    setBusy(true);
    const res = edit
      ? await supabase.from("comment_templates").update(payload).eq("id", edit.id)
      : await supabase.from("comment_templates").insert([payload]);
    setBusy(false);
    if (res.error) return toast({ title: "Failed", description: res.error.message, variant: "destructive" });
    toast({ title: edit ? "Comment updated" : "Comment added" });
    setOpen(false); setEdit(null); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this comment?")) return;
    const { error } = await supabase.from("comment_templates").delete().eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    load();
  };

  const filtered = items.filter(i => i.audience === tab);

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Comment Templates</h1>
          <p className="text-muted-foreground">Comments are picked at random from the band matching the learner's average. Use <code className="text-xs bg-muted px-1 rounded">{"{name}"}</code> as a placeholder.</p>
        </div>
        <div className="flex gap-2">
          {items.length === 0 && (
            <Button variant="outline" onClick={seed} disabled={busy}>
              <Sparkles className="mr-2 h-4 w-4" /> Seed defaults
            </Button>
          )}
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEdit(null); }}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Add Comment</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{edit ? "Edit" : "Add"} Comment</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <Label>Audience</Label>
                  <Select name="audience" defaultValue={edit?.audience ?? tab}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="class_teacher">Class Teacher</SelectItem>
                      <SelectItem value="head_teacher">Head Teacher</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Min average</Label><Input name="min_average" type="number" step="0.01" defaultValue={edit?.min_average ?? 0} required /></div>
                  <div><Label>Max average</Label><Input name="max_average" type="number" step="0.01" defaultValue={edit?.max_average ?? 100} required /></div>
                </div>
                <div>
                  <Label>Comment text</Label>
                  <Textarea name="text" rows={3} defaultValue={edit?.text} required />
                </div>
                <DialogFooter><Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Audience)}>
            <TabsList>
              <TabsTrigger value="class_teacher">Class Teacher</TabsTrigger>
              <TabsTrigger value="head_teacher">Head Teacher</TabsTrigger>
            </TabsList>
            <TabsContent value={tab} className="mt-4">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No comments yet for this audience.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Range</TableHead><TableHead>Comment</TableHead><TableHead className="w-24"></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {filtered.map(c => (
                      <TableRow key={c.id}>
                        <TableCell><Badge variant="secondary">{c.min_average} – {c.max_average}</Badge></TableCell>
                        <TableCell className="text-sm">{c.text}</TableCell>
                        <TableCell className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => { setEdit(c); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
