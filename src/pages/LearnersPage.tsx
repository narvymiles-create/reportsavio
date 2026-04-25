import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, Upload, User } from "lucide-react";

import { useLearnerFieldSettings } from "@/hooks/useLearnerFieldSettings";

type House = { id: string; name: string };
type ClassRow = { id: string; name: string };
type Stream = { id: string; class_id: string; name: string };
type Learner = {
  id: string;
  full_name: string;
  class_id: string | null;
  stream_id: string | null;
  section: string | null;
  age: number | null;
  house: string | null;
  index_no: string | null;
  pay_code: string | null;
  photo_path: string | null;
};

const schema = z.object({
  full_name: z.string().trim().min(1).max(150),
  class_id: z.string().uuid().nullable().optional(),
  stream_id: z.string().uuid().nullable().optional(),
  section: z.string().trim().max(50).optional().or(z.literal("")),
  age: z.coerce.number().int().min(3).max(30).nullable().optional(),
  house: z.string().trim().max(80).optional().or(z.literal("")),
  index_no: z.string().trim().max(50).optional().or(z.literal("")),
  pay_code: z.string().trim().max(50).optional().or(z.literal("")),
});

export default function LearnersPage() {
  const [loading, setLoading] = useState(true);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const { flags } = useLearnerFieldSettings();
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [filterClass, setFilterClass] = useState<string>("all");
  const [filterStream, setFilterStream] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Learner | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [classIdInForm, setClassIdInForm] = useState<string>("");
  const photoRef = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [l, c, s, h] = await Promise.all([
      supabase.from("learners").select("*").order("full_name"),
      supabase.from("classes").select("id, name").order("sort_order"),
      supabase.from("streams").select("id, class_id, name").order("name"),
      supabase.from("houses" as any).select("id, name").order("sort_order").order("name"),
    ]);
    const ls = (l.data ?? []) as Learner[];
    setLearners(ls);
    setClasses((c.data ?? []) as ClassRow[]);
    setStreams((s.data ?? []) as Stream[]);
    setHouses(((h as any).data ?? []) as House[]);
    // Sign photo URLs in batch
    const withPhotos = ls.filter((x) => x.photo_path);
    if (withPhotos.length) {
      const map: Record<string, string> = {};
      await Promise.all(
        withPhotos.map(async (x) => {
          const { data } = await supabase.storage
            .from("learner-photos")
            .createSignedUrl(x.photo_path!, 3600);
          if (data?.signedUrl) map[x.id] = data.signedUrl;
        })
      );
      setPhotoUrls(map);
    } else {
      setPhotoUrls({});
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return learners.filter((l) => {
      if (filterClass !== "all" && l.class_id !== filterClass) return false;
      if (filterStream !== "all" && l.stream_id !== filterStream) return false;
      if (search && !l.full_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [learners, filterClass, filterStream, search]);

  const className = (id: string | null) => classes.find((c) => c.id === id)?.name ?? "—";
  const streamName = (id: string | null) => streams.find((s) => s.id === id)?.name ?? "—";
  const streamsForForm = streams.filter((s) => s.class_id === classIdInForm);

  useEffect(() => {
    setClassIdInForm(editing?.class_id ?? "");
  }, [editing, open]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const cid = String(fd.get("class_id") ?? "");
    const sid = String(fd.get("stream_id") ?? "");
    const ageRaw = String(fd.get("age") ?? "");
    const parsed = schema.safeParse({
      full_name: fd.get("full_name"),
      class_id: cid && cid !== "none" ? cid : null,
      stream_id: sid && sid !== "none" ? sid : null,
      section: fd.get("section"),
      age: ageRaw === "" ? null : ageRaw,
      house: (fd.get("house") === "none" ? "" : fd.get("house")),
      index_no: fd.get("index_no"),
      pay_code: fd.get("pay_code"),
    });
    if (!parsed.success) {
      toast({ title: "Invalid input", description: Object.values(parsed.error.flatten().fieldErrors).flat().join(", "), variant: "destructive" });
      return;
    }
    const payload = {
      full_name: parsed.data.full_name,
      class_id: parsed.data.class_id ?? null,
      stream_id: parsed.data.stream_id ?? null,
      section: parsed.data.section || null,
      age: parsed.data.age ?? null,
      house: parsed.data.house || null,
      index_no: parsed.data.index_no || null,
      pay_code: parsed.data.pay_code || null,
    };
    setSubmitting(true);
    let error;
    if (editing) {
      ({ error } = await supabase.from("learners").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("learners").insert([payload as any]));
    }
    setSubmitting(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editing ? "Learner updated" : "Learner added" });
      setOpen(false);
      setEditing(null);
      load();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this learner? Their marks and report cards will be removed.")) return;
    const { error } = await supabase.from("learners").delete().eq("id", id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Learner deleted" }); load(); }
  };

  const handlePhoto = async (learner: Learner, file: File) => {
    if (file.size > 3 * 1024 * 1024) {
      toast({ title: "Photo too large", description: "Max 3 MB.", variant: "destructive" });
      return;
    }
    setUploadingId(learner.id);
    const ext = file.name.split(".").pop();
    const path = `learner-${learner.id}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("learner-photos")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setUploadingId(null);
      toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
      return;
    }
    await supabase.from("learners").update({ photo_path: path }).eq("id", learner.id);
    setUploadingId(null);
    toast({ title: "Photo updated" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Learners</h1>
          <p className="text-muted-foreground">Add and manage learners. Upload photos that appear on report cards.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Add learner</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>{editing ? "Edit learner" : "Add learner"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Full name *</Label>
                <Input id="full_name" name="full_name" defaultValue={editing?.full_name ?? ""} required maxLength={150} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="class_id">Class</Label>
                  <Select name="class_id" defaultValue={editing?.class_id ?? "none"} onValueChange={(v) => setClassIdInForm(v === "none" ? "" : v)}>
                    <SelectTrigger id="class_id"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {flags.stream && (
                  <div className="space-y-1.5">
                    <Label htmlFor="stream_id">Stream</Label>
                    <Select name="stream_id" defaultValue={editing?.stream_id ?? "none"}>
                      <SelectTrigger id="stream_id"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {streamsForForm.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {flags.section && (
                  <div className="space-y-1.5">
                    <Label htmlFor="section">Section</Label>
                    <Input id="section" name="section" defaultValue={editing?.section ?? ""} maxLength={50} />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="age">Age</Label>
                  <Input id="age" name="age" type="number" min={3} max={30} defaultValue={editing?.age ?? ""} />
                </div>
                {flags.house && (
                  <div className="space-y-1.5">
                    <Label htmlFor="house">House</Label>
                    <Select name="house" defaultValue={editing?.house ?? "none"}>
                      <SelectTrigger id="house"><SelectValue placeholder="Select house" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {houses.map((h) => <SelectItem key={h.id} value={h.name}>{h.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="index_no">Index / LIN no.</Label>
                  <Input id="index_no" name="index_no" defaultValue={editing?.index_no ?? ""} maxLength={50} />
                </div>
                {flags.pay_code && (
                  <div className="space-y-1.5">
                    <Label htmlFor="pay_code">Pay code</Label>
                    <Input id="pay_code" name="pay_code" defaultValue={editing?.pay_code ?? ""} maxLength={50} />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editing ? "Save" : "Add learner"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-6 flex gap-2 flex-wrap">
          <Input placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <Select value={filterClass} onValueChange={(v) => { setFilterClass(v); setFilterStream("all"); }}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Class" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStream} onValueChange={setFilterStream} disabled={filterClass === "all"}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Stream" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All streams</SelectItem>
              {streams.filter((s) => s.class_id === filterClass).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto text-sm text-muted-foreground self-center">
            {filtered.length} of {learners.length}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Learners</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {learners.length === 0 ? "No learners yet. Add the first one." : "No learners match the filters."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Photo</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Class / Stream</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Index No.</TableHead>
                  {flags.pay_code && <TableHead>Pay code</TableHead>}
                  {flags.house && <TableHead>House</TableHead>}
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <PhotoCell
                        learner={l}
                        url={photoUrls[l.id]}
                        uploading={uploadingId === l.id}
                        onPick={(file) => handlePhoto(l, file)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{l.full_name}</TableCell>
                    <TableCell className="text-sm">{className(l.class_id)} / {streamName(l.stream_id)}</TableCell>
                    <TableCell>{l.age ?? "—"}</TableCell>
                    <TableCell className="text-sm">{l.index_no ?? "—"}</TableCell>
                    {flags.pay_code && <TableCell className="text-sm">{l.pay_code ?? "—"}</TableCell>}
                    {flags.house && <TableCell className="text-sm">{l.house ?? "—"}</TableCell>}
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => { setEditing(l); setOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(l.id)}>
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
    </div>
  );
}

function PhotoCell({
  learner, url, uploading, onPick,
}: { learner: Learner; url?: string; uploading: boolean; onPick: (f: File) => void; }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="relative group">
      <Avatar className="h-10 w-10 cursor-pointer" onClick={() => ref.current?.click()}>
        {url ? <AvatarImage src={url} alt={learner.full_name} /> : null}
        <AvatarFallback className="text-xs">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
      />
    </div>
  );
}
