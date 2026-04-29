import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Upload } from "lucide-react";
import { uploadNurseryAsset, nurseryPublicUrl } from "@/lib/nurseryStorage";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

type L = { id: string; full_name: string; age: number | null; sex: string | null; class_id: string | null; stream_id: string | null; photo_path: string | null };
type Cls = { id: string; name: string };
type Stream = { id: string; class_id: string; name: string };

export default function NurseryLearnersPage() {
  const { schoolId } = useAuth();
  const [learners, setLearners] = useState<L[]>([]);
  const [classes, setClasses] = useState<Cls[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [classId, setClassId] = useState("");
  const [streamId, setStreamId] = useState("");
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = async () => {
    const [lr, cr, sr] = await Promise.all([
      supabase.from("nursery_learners" as any).select("*").order("full_name"),
      supabase.from("nursery_classes" as any).select("id,name").order("sort_order"),
      supabase.from("nursery_streams" as any).select("*"),
    ]);
    setLearners((lr.data as any) ?? []);
    setClasses((cr.data as any) ?? []);
    setStreams((sr.data as any) ?? []);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from("nursery_learners" as any).insert({
      full_name: name.trim(),
      age: age ? Number(age) : null,
      sex: sex || null,
      class_id: classId || null,
      stream_id: streamId || null,
    } as any);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    setName(""); setAge(""); setSex(""); setStreamId(""); load();
  };
  const del = async (id: string) => {
    await supabase.from("nursery_learners" as any).delete().eq("id", id);
    load();
  };
  const uploadPhoto = async (id: string, file: File) => {
    if (!schoolId) return toast({ title: "No school", description: "Set up your school first.", variant: "destructive" });
    try {
      const path = await uploadNurseryAsset(file, "photos", schoolId);
      await supabase.from("nursery_learners" as any).update({ photo_path: path }).eq("id", id);
      load();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Nursery Learners</CardTitle>
          <CardDescription>Manage children enrolled in the nursery section.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
            <div className="md:col-span-2"><Label>Full Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label>Age</Label><Input type="number" value={age} onChange={(e) => setAge(e.target.value)} /></div>
            <div>
              <Label>Sex</Label>
              <Select value={sex} onValueChange={setSex}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent><SelectItem value="M">Male</SelectItem><SelectItem value="F">Female</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label>Class</Label>
              <Select value={classId} onValueChange={(v) => { setClassId(v); setStreamId(""); }}>
                <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
                <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Stream</Label>
              <Select value={streamId} onValueChange={setStreamId}>
                <SelectTrigger><SelectValue placeholder="Stream" /></SelectTrigger>
                <SelectContent>{streams.filter((s) => s.class_id === classId).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={add}>Add Learner</Button>
          <div className="space-y-2">
            {learners.map((l) => {
              const url = nurseryPublicUrl(l.photo_path);
              const cls = classes.find((c) => c.id === l.class_id);
              const st = streams.find((s) => s.id === l.stream_id);
              return (
                <div key={l.id} className="flex items-center gap-3 border rounded-md p-2">
                  <div className="w-12 h-12 rounded-full bg-muted overflow-hidden flex items-center justify-center text-xs text-muted-foreground">
                    {url ? <img src={url} alt={l.full_name} className="w-full h-full object-cover" /> : "?"}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{l.full_name}</div>
                    <div className="text-xs text-muted-foreground">{cls?.name ?? "—"} {st && `· ${st.name}`} {l.age ? `· ${l.age}y` : ""}</div>
                  </div>
                  <input ref={(el) => (fileRefs.current[l.id] = el)} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadPhoto(l.id, e.target.files[0])} />
                  <Button size="sm" variant="outline" onClick={() => fileRefs.current[l.id]?.click()}><Upload className="h-3 w-3 mr-1" />Photo</Button>
                  <Button size="sm" variant="ghost" onClick={() => del(l.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
