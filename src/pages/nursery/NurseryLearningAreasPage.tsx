import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Trash2, Upload, ArrowUp, ArrowDown } from "lucide-react";
import { uploadNurseryAsset, nurseryPublicUrl } from "@/lib/nurseryStorage";
import { useAuth } from "@/contexts/AuthContext";

type Area = { id: string; name: string; image_path: string | null; sort_order: number };

export default function NurseryLearningAreasPage() {
  const { schoolId } = useAuth();
  const [areas, setAreas] = useState<Area[]>([]);
  const [name, setName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = async () => {
    const { data } = await supabase.from("nursery_learning_areas" as any).select("*").order("sort_order");
    setAreas((data as any) ?? []);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from("nursery_learning_areas" as any).insert({ name: name.trim(), sort_order: areas.length + 1 } as any);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    setName(""); load();
  };
  const del = async (id: string) => {
    await supabase.from("nursery_learning_areas" as any).delete().eq("id", id);
    load();
  };
  const upload = async (id: string, file: File) => {
    if (!schoolId) return toast({ title: "No school", description: "Set up your school first.", variant: "destructive" });
    setBusyId(id);
    try {
      const path = await uploadNurseryAsset(file, "learning-areas", schoolId);
      await supabase.from("nursery_learning_areas" as any).update({ image_path: path }).eq("id", id);
      load();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };
  const move = async (id: string, dir: -1 | 1) => {
    const idx = areas.findIndex((a) => a.id === id);
    const swap = areas[idx + dir];
    if (!swap) return;
    await supabase.from("nursery_learning_areas" as any).update({ sort_order: swap.sort_order }).eq("id", id);
    await supabase.from("nursery_learning_areas" as any).update({ sort_order: areas[idx].sort_order }).eq("id", swap.id);
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Nursery Learning Areas</CardTitle>
          <CardDescription>Create learning areas, upload images, and arrange display order.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Social Development" /></div>
            <Button onClick={add}>Add Area</Button>
          </div>
          <div className="space-y-2">
            {areas.map((a, i) => {
              const url = nurseryPublicUrl(a.image_path);
              return (
                <div key={a.id} className="flex items-center gap-3 border rounded-md p-2">
                  <div className="w-14 h-14 bg-muted rounded overflow-hidden flex items-center justify-center text-xs text-muted-foreground">
                    {url ? <img src={url} alt={a.name} className="w-full h-full object-cover" /> : "No image"}
                  </div>
                  <div className="flex-1 font-medium">{a.name}</div>
                  <input ref={(el) => (fileRefs.current[a.id] = el)} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(a.id, e.target.files[0])} />
                  <Button size="sm" variant="outline" disabled={busyId === a.id} onClick={() => fileRefs.current[a.id]?.click()}>
                    <Upload className="h-3 w-3 mr-1" />{busyId === a.id ? "Uploading..." : url ? "Change" : "Upload"}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(a.id, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" disabled={i === areas.length - 1} onClick={() => move(a.id, 1)}><ArrowDown className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => del(a.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
