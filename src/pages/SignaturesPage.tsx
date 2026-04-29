import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, PenLine, Trash2, Upload } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";
import { processCanvasDataUrl, processSignatureFile } from "@/lib/signatureProcessing";
import { useReportModule } from "@/hooks/useReportModule";
import { useAuth } from "@/contexts/AuthContext";

type School = { id: string; head_teacher_name: string | null; head_teacher_signature_path: string | null; nursery_head_teacher_name: string | null; nursery_head_teacher_signature_path: string | null };
type Cls = { id: string; name: string; class_signature_path: string | null; class_teacher_id: string | null };
type Teacher = { id: string; full_name: string; initials: string | null; signature_path: string | null; section?: string | null };

function SignatureCell({ path, onChange, kind }: { path: string | null; onChange: (newPath: string | null) => Promise<void>; kind: "school" | "class" | "teacher" }) {
  const { schoolId } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawOpen, setDrawOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const padRef = useRef<SignatureCanvas | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!path) { setUrl(null); return; }
    supabase.storage.from("signatures").createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [path]);

  const persist = async (blob: Blob, ext = "png", contentType = "image/png") => {
    if (!schoolId) {
      return toast({ title: "No school context", description: "Set up your school first.", variant: "destructive" });
    }
    setBusy(true);
    try {
      const newPath = `schools/${schoolId}/${kind}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("signatures").upload(newPath, blob, { upsert: false, contentType });
      if (error) throw error;
      if (path) await supabase.storage.from("signatures").remove([path]);
      await onChange(newPath);
      toast({ title: "Signature saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      return toast({ title: "Image only", description: "Use PNG or JPG.", variant: "destructive" });
    }
    if (file.size > 5 * 1024 * 1024) {
      return toast({ title: "Too large", description: "Max 5 MB.", variant: "destructive" });
    }
    setBusy(true);
    try {
      // Upload the signature AS-IS, preserving its original background.
      // For best results users should remove the background before uploading (PNG with transparency).
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const safeExt = ["png", "jpg", "jpeg", "webp"].includes(ext) ? ext : "png";
      await persist(file, safeExt, file.type || "image/png");
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
      setBusy(false);
    }
  };

  const handleSaveDrawing = async () => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      return toast({ title: "Empty signature", description: "Draw your signature first.", variant: "destructive" });
    }
    const dataUrl = pad.getCanvas().toDataURL("image/png");
    setDrawOpen(false);
    const processed = await processCanvasDataUrl(dataUrl);
    await persist(processed);
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
    <div className="flex items-center gap-3 flex-wrap">
      <div className="h-16 w-40 border rounded bg-[repeating-conic-gradient(#f3f3f3_0%_25%,#fff_0%_50%)_50%/12px_12px] flex items-center justify-center overflow-hidden">
        {url ? <img src={url} alt="signature" className="h-full w-full object-contain" /> : <span className="text-xs text-muted-foreground">No signature</span>}
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.currentTarget.value = ""; }} />
      <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
        Upload
      </Button>

      <Dialog open={drawOpen} onOpenChange={setDrawOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy}>
            <PenLine className="mr-2 h-4 w-4" /> Draw
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Draw signature</DialogTitle>
            <DialogDescription>Use your mouse or finger. Background will be saved as transparent.</DialogDescription>
          </DialogHeader>
          <div className="border rounded-md bg-white">
            <SignatureCanvas
              ref={(r) => { padRef.current = r; }}
              penColor="#000"
              canvasProps={{ width: 600, height: 220, className: "w-full h-[220px]" }}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => padRef.current?.clear()}>Clear</Button>
            <Button variant="outline" onClick={() => setDrawOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveDrawing}>Save signature</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {path && (
        <Button size="icon" variant="ghost" onClick={remove} disabled={busy} title="Remove"><Trash2 className="h-4 w-4" /></Button>
      )}
    </div>
  );
}

export default function SignaturesPage() {
  const { module } = useReportModule();
  const isNursery = module === "nursery";
  const classesTable = isNursery ? "nursery_classes" : "classes";
  const section = isNursery ? "nursery" : "primary";
  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState<School | null>(null);
  const [classes, setClasses] = useState<Cls[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [savingHead, setSavingHead] = useState(false);

  const headName = isNursery ? school?.nursery_head_teacher_name ?? "" : school?.head_teacher_name ?? "";
  const headSigPath = isNursery ? school?.nursery_head_teacher_signature_path ?? null : school?.head_teacher_signature_path ?? null;

  const load = async () => {
    setLoading(true);
    const [s, c, t] = await Promise.all([
      (supabase.from("school_info") as any).select("id,head_teacher_name,head_teacher_signature_path,nursery_head_teacher_name,nursery_head_teacher_signature_path").eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      (supabase.from(classesTable) as any).select("id,name,class_signature_path,class_teacher_id").order("sort_order").order("name"),
      (supabase.from("teachers") as any).select("id,full_name,initials,signature_path,section").order("full_name"),
    ]);
    setSchool((s.data as any) ?? null);
    setClasses((c.data ?? []) as Cls[]);
    setTeachers((t.data ?? []) as Teacher[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [module]);

  const saveHeadName = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!school) return toast({ title: "Set up School Info first", variant: "destructive" });
    const fd = new FormData(e.currentTarget);
    setSavingHead(true);
    const value = String(fd.get("head_teacher_name") ?? "") || null;
    const patch = isNursery ? { nursery_head_teacher_name: value } : { head_teacher_name: value };
    const { error } = await (supabase.from("school_info") as any).update(patch).eq("id", school.id);
    setSavingHead(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Saved" });
    load();
  };

  const updateHeadSig = async (newPath: string | null) => {
    if (!school) return;
    const patch = isNursery ? { nursery_head_teacher_signature_path: newPath } : { head_teacher_signature_path: newPath };
    await (supabase.from("school_info") as any).update(patch).eq("id", school.id);
    setSchool({ ...school, ...(isNursery ? { nursery_head_teacher_signature_path: newPath } : { head_teacher_signature_path: newPath }) });
  };
  const updateClassSig = async (id: string, newPath: string | null) => {
    await (supabase.from(classesTable) as any).update({ class_signature_path: newPath }).eq("id", id);
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
        <h1 className="text-3xl font-bold">{isNursery ? "Nursery Signatures" : "Signatures"}</h1>
        <p className="text-muted-foreground">Upload an image OR draw directly. Uploaded signatures are saved exactly as provided — their original background is preserved.</p>
      </div>

      <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-sm text-amber-900 dark:text-amber-200">
        <strong>Reminder:</strong> Please remove the background from your signature image <em>before</em> uploading (use a transparent PNG). The signature will be placed on the report card with whatever background it has.
      </div>

      <Tabs defaultValue="head">
        <TabsList>
          <TabsTrigger value="head">{isNursery ? "Nursery Head Teacher" : "Head Teacher"}</TabsTrigger>
          <TabsTrigger value="class">{isNursery ? "Nursery Class Teachers" : "Class Teachers"}</TabsTrigger>
          {!isNursery && <TabsTrigger value="subject">Subject Teachers</TabsTrigger>}
        </TabsList>

        <TabsContent value="head" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{isNursery ? "Nursery Head Teacher" : "Head Teacher"}</CardTitle>
              <CardDescription>Signed at the bottom of every {isNursery ? "nursery " : ""}report card.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!school ? (
                <p className="text-sm text-muted-foreground">Add School Information first.</p>
              ) : (
                <>
                  <form onSubmit={saveHeadName} className="flex items-end gap-3 max-w-xl">
                    <div className="flex-1">
                      <Label>{isNursery ? "Nursery Head Teacher Name" : "Head Teacher Name"}</Label>
                      <Input name="head_teacher_name" defaultValue={headName} placeholder="e.g. Mr. John Doe" />
                    </div>
                    <Button type="submit" disabled={savingHead}>{savingHead && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Name</Button>
                  </form>
                  <div>
                    <Label className="block mb-2">Signature</Label>
                    <SignatureCell kind="school" path={headSigPath} onChange={updateHeadSig} />
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
                      <div key={c.id} className="flex items-center justify-between border rounded-lg p-3 gap-4 flex-wrap">
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

        {!isNursery && (
        <TabsContent value="subject" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Subject Teacher Signatures</CardTitle>
              <CardDescription>Optional — used where individual subject signatures are required.</CardDescription>
            </CardHeader>
            <CardContent>
              {teachers.filter(t => (t.section ?? "primary") === "primary").length === 0 ? (
                <p className="text-sm text-muted-foreground">No teachers yet.</p>
              ) : (
                <div className="space-y-4">
                  {teachers.filter(t => (t.section ?? "primary") === "primary").map(t => (
                    <div key={t.id} className="flex items-center justify-between border rounded-lg p-3 gap-4 flex-wrap">
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
        )}
      </Tabs>
    </div>
  );
}
