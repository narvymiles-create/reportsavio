import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Loader2, Trash2, Upload } from "lucide-react";

type School = { id: string; head_teacher_name: string | null; head_teacher_signature_path: string | null };
type Cls = { id: string; name: string; class_signature_path: string | null; class_teacher_id: string | null };
type Teacher = { id: string; full_name: string; initials: string | null; signature_path: string | null };

function SignatureCell({ path, onChange, kind }: { path: string | null; onChange: (newPath: string | null) => Promise<void>; kind: "school" | "class" | "teacher" }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!path) { setUrl(null); return; }
    supabase.storage.from("signatures").createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [path]);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      return toast({ title: "Image only", description: "Use PNG or JPG.", variant: "destructive" });
    }
    if (file.size > 2 * 1024 * 1024) {
      return toast({ title: "Too large", description: "Max 2 MB.", variant: "destructive" });
    }
    setBusy(true);
    const ext = file.name.split(".").pop() || "png";
    const newPath = `${kind}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("signatures").upload(newPath, file, { upsert: false, contentType: file.type });
    if (error) { setBusy(false); return toast({ title: "Upload failed", description: error.message, variant: "destructive" }); }
    if (path) await supabase.storage.from("signatures").remove([path]);
    await onChange(newPath);
    setBusy(false);
  };

  const remove = async () => {
    if (!path) return;
    if (!confirm("Remove this signature?")) return;
    setBusy(true);
    await supabase.storage.from("signatures").remove([path]);
    await onChange(null);
    setBusy(false);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="h-16 w-40 border rounded bg-muted/30 flex items-center justify-center overflow-hidden">
        {url ? <img src={url} alt="signature" className="h-full w-full object-contain" /> : <span className="text-xs text-muted-foreground">No signature</span>}
      </div>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = ""; }} />
      <Button size="sm" variant="outline" onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
        {path ? "Replace" : "Upload"}
      </Button>
      {path && (
        <Button size="icon" variant="ghost" onClick={remove} disabled={busy}><Trash2 className="h-4 w-4" /></Button>
      )}
    </div>
  );
}

export default function SignaturesPage() {
  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState<School | null>(null);
  const [classes, setClasses] = useState<Cls[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [savingHead, setSavingHead] = useState(false);

  const load = async () => {
    setLoading(true);
    const [s, c, t] = await Promise.all([
      supabase.from("school_info").select("id,head_teacher_name,head_teacher_signature_path").eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("classes").select("id,name,class_signature_path,class_teacher_id").order("sort_order").order("name"),
      supabase.from("teachers").select("id,full_name,initials,signature_path").order("full_name"),
    ]);
    setSchool((s.data as any) ?? null);
    setClasses((c.data ?? []) as Cls[]);
    setTeachers((t.data ?? []) as Teacher[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const saveHeadName = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!school) return toast({ title: "Set up School Info first", variant: "destructive" });
    const fd = new FormData(e.currentTarget);
    setSavingHead(true);
    const { error } = await supabase.from("school_info").update({ head_teacher_name: String(fd.get("head_teacher_name") ?? "") || null }).eq("id", school.id);
    setSavingHead(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Saved" });
    load();
  };

  const updateHeadSig = async (newPath: string | null) => {
    if (!school) return;
    await supabase.from("school_info").update({ head_teacher_signature_path: newPath }).eq("id", school.id);
    setSchool({ ...school, head_teacher_signature_path: newPath });
  };
  const updateClassSig = async (id: string, newPath: string | null) => {
    await supabase.from("classes").update({ class_signature_path: newPath }).eq("id", id);
    setClasses(prev => prev.map(c => c.id === id ? { ...c, class_signature_path: newPath } : c));
  };
  const updateTeacherSig = async (id: string, newPath: string | null) => {
    await supabase.from("teachers").update({ signature_path: newPath }).eq("id", id);
    setTeachers(prev => prev.map(t => t.id === id ? { ...t, signature_path: newPath } : t));
  };

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Signatures</h1>
        <p className="text-muted-foreground">Upload signatures used on report cards. Use a transparent PNG for best results.</p>
      </div>

      <Tabs defaultValue="head">
        <TabsList>
          <TabsTrigger value="head">Head Teacher</TabsTrigger>
          <TabsTrigger value="class">Class Teachers</TabsTrigger>
          <TabsTrigger value="subject">Subject Teachers</TabsTrigger>
        </TabsList>

        <TabsContent value="head" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Head Teacher</CardTitle>
              <CardDescription>Signed at the bottom of every report card.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!school ? (
                <p className="text-sm text-muted-foreground">Add School Information first.</p>
              ) : (
                <>
                  <form onSubmit={saveHeadName} className="flex items-end gap-3 max-w-xl">
                    <div className="flex-1">
                      <Label>Head Teacher Name</Label>
                      <Input name="head_teacher_name" defaultValue={school.head_teacher_name ?? ""} placeholder="e.g. Mr. John Doe" />
                    </div>
                    <Button type="submit" disabled={savingHead}>{savingHead && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Name</Button>
                  </form>
                  <div>
                    <Label className="block mb-2">Signature</Label>
                    <SignatureCell kind="school" path={school.head_teacher_signature_path} onChange={updateHeadSig} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="class" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Class Teacher Signatures</CardTitle>
              <CardDescription>One signature per class — appears in the class teacher's comment section.</CardDescription>
            </CardHeader>
            <CardContent>
              {classes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No classes yet.</p>
              ) : (
                <div className="space-y-4">
                  {classes.map(c => {
                    const ct = teachers.find(t => t.id === c.class_teacher_id);
                    return (
                      <div key={c.id} className="flex items-center justify-between border rounded-lg p-3">
                        <div>
                          <div className="font-semibold">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{ct ? `Class teacher: ${ct.full_name}` : "No class teacher assigned"}</div>
                        </div>
                        <SignatureCell kind="class" path={c.class_signature_path} onChange={(p) => updateClassSig(c.id, p)} />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subject" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Subject Teacher Signatures</CardTitle>
              <CardDescription>Optional — used where individual subject signatures are required.</CardDescription>
            </CardHeader>
            <CardContent>
              {teachers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No teachers yet.</p>
              ) : (
                <div className="space-y-4">
                  {teachers.map(t => (
                    <div key={t.id} className="flex items-center justify-between border rounded-lg p-3">
                      <div>
                        <div className="font-semibold">{t.full_name}</div>
                        <div className="text-xs text-muted-foreground">{t.initials ? `Initials: ${t.initials}` : "No initials"}</div>
                      </div>
                      <SignatureCell kind="teacher" path={t.signature_path} onChange={(p) => updateTeacherSig(t.id, p)} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
