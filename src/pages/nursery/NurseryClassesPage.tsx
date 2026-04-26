import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Trash2, Plus } from "lucide-react";

type Cls = { id: string; name: string; level: string | null; sort_order: number };
type Stream = { id: string; class_id: string; name: string };

export default function NurseryClassesPage() {
  const [classes, setClasses] = useState<Cls[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [name, setName] = useState("");
  const [level, setLevel] = useState("");

  const load = async () => {
    const c = await supabase.from("nursery_classes" as any).select("*").order("sort_order");
    const s = await supabase.from("nursery_streams" as any).select("*");
    setClasses((c.data as any) ?? []);
    setStreams((s.data as any) ?? []);
  };
  useEffect(() => { load(); }, []);

  const addClass = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from("nursery_classes" as any).insert({ name: name.trim(), level: level.trim() || null, sort_order: classes.length });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    setName(""); setLevel(""); load();
  };
  const delClass = async (id: string) => {
    await supabase.from("nursery_classes" as any).delete().eq("id", id);
    load();
  };
  const addStream = async (classId: string, sName: string) => {
    if (!sName.trim()) return;
    await supabase.from("nursery_streams" as any).insert({ class_id: classId, name: sName.trim() });
    load();
  };
  const delStream = async (id: string) => {
    await supabase.from("nursery_streams" as any).delete().eq("id", id);
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Nursery Classes & Streams</CardTitle>
          <CardDescription>Manage nursery-only classes and their streams.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 items-end flex-wrap">
            <div><Label>Class Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kg 2" /></div>
            <div><Label>Level</Label><Input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="e.g. Top" /></div>
            <Button onClick={addClass}><Plus className="h-4 w-4 mr-1" />Add Class</Button>
          </div>
          <div className="space-y-3">
            {classes.map((c) => (
              <ClassRow key={c.id} cls={c} streams={streams.filter((s) => s.class_id === c.id)} onDelete={() => delClass(c.id)} onAddStream={(n) => addStream(c.id, n)} onDelStream={delStream} />
            ))}
            {classes.length === 0 && <div className="text-sm text-muted-foreground">No nursery classes yet.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ClassRow({ cls, streams, onDelete, onAddStream, onDelStream }: { cls: Cls; streams: Stream[]; onDelete: () => void; onAddStream: (n: string) => void; onDelStream: (id: string) => void }) {
  const [s, setS] = useState("");
  return (
    <div className="border rounded-md p-3">
      <div className="flex items-center justify-between">
        <div><span className="font-semibold">{cls.name}</span> {cls.level && <span className="text-xs text-muted-foreground ml-2">({cls.level})</span>}</div>
        <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {streams.map((st) => (
          <div key={st.id} className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-sm">
            {st.name}
            <button onClick={() => onDelStream(st.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
          </div>
        ))}
        <div className="flex gap-1">
          <Input value={s} onChange={(e) => setS(e.target.value)} placeholder="New stream" className="h-8 w-32" />
          <Button size="sm" onClick={() => { onAddStream(s); setS(""); }}>Add</Button>
        </div>
      </div>
    </div>
  );
}
