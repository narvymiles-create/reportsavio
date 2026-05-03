import { useEffect, useState } from "react";
import { useBorderStyle, BORDER_STYLES, type BorderStyleKey } from "@/hooks/useBorderStyle";
import { useNurseryFontStyle, NURSERY_FONT_STYLES, type NurseryFontStyleKey } from "@/hooks/useNurseryFontStyle";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Check } from "lucide-react";
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
  const { schoolId } = useAuth();
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
    if (!schoolId) {
      toast({ title: "Save failed", description: "No school context found.", variant: "destructive" });
      return;
    }
    setSavingOrder(true);
    const { error } = await supabase
      .from("system_settings" as any)
      .upsert(
        { key: "learner_info_order", value: next as any, school_id: schoolId } as any,
        { onConflict: "school_id,key" }
      );
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
      : await supabase.from("houses" as any).insert([payload] as any);
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
    if (!schoolId) {
      toast({ title: "Save failed", description: "No school context found.", variant: "destructive" });
      return;
    }
    setSavingFlags(true);
    const { error } = await supabase
      .from("system_settings" as any)
      .upsert(
        { key: "learner_fields", value: next as any, school_id: schoolId } as any,
        { onConflict: "school_id,key" }
      );
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

      {/* SECTION C: LEARNER INFO LABEL ORDER */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ListOrdered className="h-4 w-4" /> Learner Info Order on Report Card
            </CardTitle>
            <CardDescription>
              Drag-style ordering: use the arrows to set the order of labels (Name, Class, House, etc.) shown on the report card. Changes apply to all reports in real time.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={resetOrder} disabled={savingOrder}>
            Reset to default
          </Button>
        </CardHeader>
        <CardContent>
          {loadingFlags ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : (
            <div className="divide-y border rounded-md">
              {order.map((k, i) => (
                <div key={k} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono w-6 text-center bg-muted rounded px-1 py-0.5">{i + 1}</span>
                    <span className="font-medium">{LEARNER_INFO_LABELS[k]}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" disabled={i === 0 || savingOrder} onClick={() => moveItem(i, -1)} aria-label="Move up">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" disabled={i === order.length - 1 || savingOrder} onClick={() => moveItem(i, 1)} aria-label="Move down">
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Note: Hidden fields (toggled off above) will be skipped automatically. The chosen order fills the report card grid left-to-right, top-to-bottom.
          </p>
        </CardContent>
      </Card>

      {/* SECTION D: BORDER TEMPLATE PICKER */}
      <BorderTemplatePicker />
    </div>
  );
}

function BorderTemplatePicker() {
  const { borderStyle, setBorderStyle, loading } = useBorderStyle();

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Report Card Border Style</CardTitle></CardHeader>
        <CardContent><div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Report Card Border Style</CardTitle>
        <CardDescription>Select the border design applied to all report cards (preview, print, and PDF).</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {BORDER_STYLES.map((b, i) => {
            const active = borderStyle === b.key;
            return (
              <button
                key={b.key}
                onClick={() => setBorderStyle(b.key)}
                className={`relative group rounded-lg border-2 p-2 transition-all cursor-pointer ${
                  active ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                {active && (
                  <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center z-10">
                    <Check className="h-3 w-3" />
                  </div>
                )}
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-xs font-mono bg-muted rounded px-1.5 py-0.5">{i + 1}</span>
                  <span className="text-xs font-semibold uppercase truncate">{b.label}</span>
                </div>
                <div className="relative bg-white border rounded aspect-[210/297] overflow-hidden">
                  <img
                    src={`/borders/${b.key}.svg`}
                    alt={b.label}
                    className="absolute inset-0 w-full h-full"
                    draggable={false}
                  />
                  {/* Mini content placeholder */}
                  <div className="absolute inset-0 flex flex-col items-center justify-start pt-[18%] px-[12%] pointer-events-none">
                    <div className="w-6 h-6 rounded-full bg-muted mb-1" />
                    <div className="w-3/4 h-1.5 bg-muted rounded mb-1" />
                    <div className="w-1/2 h-1 bg-muted/60 rounded mb-2" />
                    <div className="w-full h-1 bg-muted/40 rounded mb-0.5" />
                    <div className="w-full h-1 bg-muted/40 rounded mb-0.5" />
                    <div className="w-full h-1 bg-muted/40 rounded" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
