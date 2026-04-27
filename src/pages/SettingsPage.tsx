import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, Pencil, Plus, Trash2, ArrowUp, ArrowDown, ListOrdered } from "lucide-react";
import {
  DEFAULT_LEARNER_FIELDS,
  DEFAULT_LEARNER_INFO_ORDER,
  LEARNER_INFO_LABELS,
  normalizeOrder,
  type LearnerFieldFlags,
  type LearnerInfoFieldKey,
} from "@/hooks/useLearnerFieldSettings";

type House = { id: string; name: string; color: string | null; sort_order: number };

export default function SettingsPage() {
  const [houses, setHouses] = useState<House[]>([]);
  const [loadingHouses, setLoadingHouses] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<House | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [flags, setFlags] = useState<LearnerFieldFlags>(DEFAULT_LEARNER_FIELDS);
  const [loadingFlags, setLoadingFlags] = useState(true);
  const [savingFlags, setSavingFlags] = useState(false);

  const [order, setOrder] = useState<LearnerInfoFieldKey[]>(DEFAULT_LEARNER_INFO_ORDER);
  const [savingOrder, setSavingOrder] = useState(false);

  const loadHouses = async () => {
    setLoadingHouses(true);
    const { data } = await supabase.from("houses" as any).select("*").order("sort_order").order("name");
    setHouses((data ?? []) as any);
    setLoadingHouses(false);
  };
  const loadFlags = async () => {
    setLoadingFlags(true);
    const [{ data: f }, { data: o }] = await Promise.all([
      supabase.from("system_settings" as any).select("value").eq("key", "learner_fields").maybeSingle(),
      supabase.from("system_settings" as any).select("value").eq("key", "learner_info_order").maybeSingle(),
    ]);
    if (f && (f as any).value) {
      setFlags({ ...DEFAULT_LEARNER_FIELDS, ...((f as any).value as Partial<LearnerFieldFlags>) });
    }
    if (o && Array.isArray((o as any).value)) {
      setOrder(normalizeOrder((o as any).value as LearnerInfoFieldKey[]));
    }
    setLoadingFlags(false);
  };

  const saveOrder = async (next: LearnerInfoFieldKey[]) => {
    setOrder(next);
    setSavingOrder(true);
    // upsert in case the row doesn't exist yet
    const { error } = await supabase
      .from("system_settings" as any)
      .upsert({ key: "learner_info_order", value: next as any }, { onConflict: "key" });
    setSavingOrder(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
  };

  const moveItem = (index: number, dir: -1 | 1) => {
    const next = [...order];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    saveOrder(next);
  };

  const resetOrder = () => saveOrder(DEFAULT_LEARNER_INFO_ORDER);

  useEffect(() => { loadHouses(); loadFlags(); }, []);

  const submitHouse = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const color = String(fd.get("color") ?? "").trim() || null;
    const sort_order = Number(fd.get("sort_order") ?? 0) || 0;
    if (!name) { toast({ title: "Name required", variant: "destructive" }); return; }
    setSubmitting(true);
    const payload = { name, color, sort_order };
    const res = editing
      ? await supabase.from("houses" as any).update(payload).eq("id", editing.id)
      : await supabase.from("houses" as any).insert([payload]);
    setSubmitting(false);
    if ((res as any).error) {
      toast({ title: "Save failed", description: (res as any).error.message, variant: "destructive" });
    } else {
      toast({ title: editing ? "House updated" : "House added" });
      setOpen(false); setEditing(null); loadHouses();
    }
  };

  const deleteHouse = async (id: string) => {
    if (!confirm("Delete this house?")) return;
    const { error } = await supabase.from("houses" as any).delete().eq("id", id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else { toast({ title: "House deleted" }); loadHouses(); }
  };

  const saveFlags = async (next: LearnerFieldFlags) => {
    setFlags(next);
    setSavingFlags(true);
    const { error } = await supabase
      .from("system_settings" as any)
      .update({ value: next as any })
      .eq("key", "learner_fields");
    setSavingFlags(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
  };

  const toggle = (key: keyof LearnerFieldFlags) => (v: boolean) => saveFlags({ ...flags, [key]: v });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage school houses and configure learner / report card fields.</p>
      </div>

      {/* SECTION A: HOUSES */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>School Houses</CardTitle>
            <CardDescription>Used as a dropdown when adding or editing learners.</CardDescription>
          </div>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add house</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit house" : "Add house"}</DialogTitle></DialogHeader>
              <form onSubmit={submitHouse} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name *</Label>
                  <Input id="name" name="name" defaultValue={editing?.name ?? ""} required maxLength={80} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="color">Color (hex)</Label>
                    <Input id="color" name="color" defaultValue={editing?.color ?? ""} placeholder="#1e40af" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sort_order">Sort order</Label>
                    <Input id="sort_order" name="sort_order" type="number" defaultValue={editing?.sort_order ?? 0} />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editing ? "Save" : "Add"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {loadingHouses ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : houses.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No houses yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Sort</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {houses.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{h.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {h.color && <span className="inline-block h-4 w-4 rounded-full border" style={{ background: h.color }} />}
                        <span className="text-sm text-muted-foreground">{h.color ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>{h.sort_order}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => { setEditing(h); setOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteHouse(h.id)}>
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

      {/* SECTION B: REPORT CARD FIELD CONFIG */}
      <Card>
        <CardHeader>
          <CardTitle>Report Card Field Configuration</CardTitle>
          <CardDescription>
            Toggle which fields show up on the learner registration form and report card student details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingFlags ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : (
            <div className="divide-y">
              {([
                ["stream", "Stream", "Show stream selector and column"],
                ["house", "House", "Show house dropdown and column"],
                ["section", "Section", "Show section input and column"],
                ["pay_code", "Pay Code", "Show pay code input and column"],
                ["show_position", "Show Position on Report Card", "Display POSITION field on report card preview and print"],
              ] as Array<[keyof LearnerFieldFlags, string, string]>).map(([k, label, desc]) => (
                <div key={k} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium">{label}</div>
                    <div className="text-sm text-muted-foreground">{desc}</div>
                  </div>
                  <Switch checked={flags[k]} onCheckedChange={toggle(k)} disabled={savingFlags} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
