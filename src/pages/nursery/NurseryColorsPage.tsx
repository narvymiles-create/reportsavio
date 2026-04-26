import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";

type GC = { id: string; grade: string; label: string; color: string; sort_order: number };

export default function NurseryColorsPage() {
  const [list, setList] = useState<GC[]>([]);
  const [grade, setGrade] = useState("");
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#F87171");

  const load = async () => {
    const { data } = await supabase.from("nursery_grade_colors" as any).select("*").order("sort_order");
    setList((data as any) ?? []);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!grade.trim() || !label.trim()) return;
    await supabase.from("nursery_grade_colors" as any).insert({ grade: grade.trim().toUpperCase(), label: label.trim(), color, sort_order: list.length + 1 });
    setGrade(""); setLabel(""); load();
  };
  const update = async (id: string, patch: Partial<GC>) => {
    await supabase.from("nursery_grade_colors" as any).update(patch).eq("id", id);
    load();
  };
  const del = async (id: string) => {
    await supabase.from("nursery_grade_colors" as any).delete().eq("id", id);
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Color Key System</CardTitle>
          <CardDescription>Define grade letters, labels, and their performance colors.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 items-end flex-wrap">
            <div><Label>Grade</Label><Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="A" className="w-20" /></div>
            <div><Label>Label</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Very Good" /></div>
            <div><Label>Color</Label><input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-16 rounded border" /></div>
            <Button onClick={add}>Add</Button>
          </div>
          <div className="space-y-2">
            {list.map((g) => (
              <div key={g.id} className="flex items-center gap-3 border rounded-md p-2">
                <div className="w-10 h-10 rounded font-bold flex items-center justify-center text-white" style={{ background: g.color }}>{g.grade}</div>
                <Input value={g.grade} onChange={(e) => update(g.id, { grade: e.target.value.toUpperCase() })} className="w-20" />
                <Input value={g.label} onChange={(e) => update(g.id, { label: e.target.value })} className="flex-1" />
                <input type="color" value={g.color} onChange={(e) => update(g.id, { color: e.target.value })} className="h-10 w-16 rounded border" />
                <Button size="sm" variant="ghost" onClick={() => del(g.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
