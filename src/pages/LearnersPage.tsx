import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, User, Upload } from "lucide-react";

import { useLearnerFieldSettings } from "@/hooks/useLearnerFieldSettings";

type House = { id: string; name: string };
type ClassRow = { id: string; name: string };
type Stream = { id: string; class_id: string; name: string };
type Term = { id: string; name: string; is_current: boolean };
type RegType = "INDEX" | "LIN" | "REG";
type Learner = {
  id: string;
  full_name: string;
  class_id: string | null;
  stream_id: string | null;
  section: string | null;
  age: number | null;
  dob: string | null;
  sex: string | null;
  house: string | null;
  index_no: string | null;
  lin_no: string | null;
  reg_no: string | null;
  active_reg_type: RegType | null;
  pay_code: string | null;
  photo_path: string | null;
  conduct: string | null;
  co_curricular: string | null;
};

const calcAge = (dob: string | null | undefined): number | null => {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
};

const isP7Class = (name?: string | null) =>
  !!name && /\bp\.?\s*7\b|primary\s*7/i.test(name);

const isTerm2or3 = (name?: string | null) => {
  if (!name) return false;
  const n = name.toLowerCase();
  return /\b(2|3|ii|iii|two|three)\b/.test(n) || n.includes("term 2") || n.includes("term 3");
};

const schema = z.object({
  full_name: z.string().trim().min(1).max(150),
});

export default function LearnersPage() {
  const [loading, setLoading] = useState(true);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [currentTerm, setCurrentTerm] = useState<Term | null>(null);
  const { flags } = useLearnerFieldSettings();
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [filterClass, setFilterClass] = useState<string>("all");
  const [filterStream, setFilterStream] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Learner | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // form state
  const [classIdInForm, setClassIdInForm] = useState<string>("");
  const [dob, setDob] = useState<string>("");
  const [regType, setRegType] = useState<RegType>("INDEX");
  const [indexNo, setIndexNo] = useState("");
  const [linNo, setLinNo] = useState("");
  const [regNo, setRegNo] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const age = useMemo(() => calcAge(dob), [dob]);

  const selectedClass = classes.find((c) => c.id === classIdInForm);
  const p7Lock = isP7Class(selectedClass?.name) && isTerm2or3(currentTerm?.name);

  useEffect(() => {
    if (p7Lock && regType !== "INDEX") setRegType("INDEX");
  }, [p7Lock]); // eslint-disable-line

  const load = async () => {
    setLoading(true);
    const [l, c, s, h, t] = await Promise.all([
      supabase.from("learners").select("*").order("full_name"),
      supabase.from("classes").select("id, name").order("sort_order"),
      supabase.from("streams").select("id, class_id, name").order("name"),
      supabase.from("houses" as any).select("id, name").order("sort_order").order("name"),
      supabase.from("terms").select("id, name, is_current").eq("is_current", true).maybeSingle(),
    ]);
    const ls = (l.data ?? []) as Learner[];
    setLearners(ls);
    setClasses((c.data ?? []) as ClassRow[]);
    setStreams((s.data ?? []) as Stream[]);
    setHouses(((h as any).data ?? []) as House[]);
    setCurrentTerm((t.data ?? null) as Term | null);
    const withPhotos = ls.filter((x) => x.photo_path);
    if (withPhotos.length) {
      const map: Record<string, string> = {};
      await Promise.all(
        withPhotos.map(async (x) => {
          const { data } = await supabase.storage.from("learner-photos").createSignedUrl(x.photo_path!, 3600);
          if (data?.signedUrl) map[x.id] = data.signedUrl;
        })
      );
      setPhotoUrls(map);
    } else setPhotoUrls({});
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

  // initialize form when opening / editing
  useEffect(() => {
    if (open) {
      setClassIdInForm(editing?.class_id ?? "");
      setDob(editing?.dob ?? "");
      setIndexNo(editing?.index_no ?? "");
      setLinNo(editing?.lin_no ?? "");
      setRegNo(editing?.reg_no ?? "");
      setRegType(((editing?.active_reg_type as RegType) ?? "INDEX"));
      setPhotoFile(null);
      setPhotoPreview(null);
    }
  }, [editing, open]);

  const onPhotoPick = (file: File | null) => {
    setPhotoFile(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({ full_name: fd.get("full_name") });
    if (!parsed.success) {
      toast({ title: "Invalid input", description: "Full name is required.", variant: "destructive" });
      return;
    }

    // Validate reg fields: exactly one based on selected regType, others must be empty
    const indexVal = regType === "INDEX" ? indexNo.trim() : "";
    const linVal = regType === "LIN" ? linNo.trim() : "";
    const regVal = regType === "REG" ? regNo.trim() : "";
    const filledCount = [indexVal, linVal, regVal].filter((v) => v !== "").length;
    if (filledCount === 0) {
      toast({ title: "Registration required", description: `Enter a value for ${regType}.`, variant: "destructive" });
      return;
    }
    if (filledCount > 1) {
      toast({ title: "Only one allowed", description: "Only the selected registration type can have a value.", variant: "destructive" });
      return;
    }
    if (p7Lock && regType !== "INDEX") {
      toast({ title: "Index Number required", description: "P7 candidates in Term 2/3 must use Index Number.", variant: "destructive" });
      return;
    }

    const cid = String(fd.get("class_id") ?? "");
    const sid = String(fd.get("stream_id") ?? "");
    const sectionVal = String(fd.get("section") ?? "");
    const sexVal = String(fd.get("sex") ?? "");
    const houseVal = String(fd.get("house") ?? "");
    const payCodeVal = String(fd.get("pay_code") ?? "");
    const conductVal = String(fd.get("conduct") ?? "").trim();
    const coCurricularVal = String(fd.get("co_curricular") ?? "").trim();

    const payload: any = {
      full_name: parsed.data.full_name,
      class_id: cid && cid !== "none" ? cid : null,
      stream_id: sid && sid !== "none" ? sid : null,
      section: sectionVal && sectionVal !== "none" ? sectionVal : null,
      sex: sexVal && sexVal !== "none" ? sexVal : null,
      dob: dob || null,
      age: age,
      house: houseVal && houseVal !== "none" ? houseVal : null,
      index_no: indexVal || null,
      lin_no: linVal || null,
      reg_no: regVal || null,
      active_reg_type: regType,
      pay_code: payCodeVal || null,
      conduct: conductVal || null,
      co_curricular: coCurricularVal || null,
    };

    setSubmitting(true);
    let savedId: string | null = editing?.id ?? null;
    let error: any = null;
    if (editing) {
      ({ error } = await supabase.from("learners").update(payload).eq("id", editing.id));
    } else {
      const { data, error: insErr } = await supabase.from("learners").insert([payload]).select("id").maybeSingle();
      error = insErr;
      savedId = (data as any)?.id ?? null;
    }

    if (!error && photoFile && savedId) {
      const ext = photoFile.name.split(".").pop();
      const path = `learner-${savedId}.${ext}`;
      const { error: upErr } = await supabase.storage.from("learner-photos").upload(path, photoFile, { upsert: true, contentType: photoFile.type });
      if (upErr) {
        toast({ title: "Photo upload failed", description: upErr.message, variant: "destructive" });
      } else {
        await supabase.from("learners").update({ photo_path: path }).eq("id", savedId);
      }
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
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Edit learner" : "Add learner"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Photo upload */}
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  {photoPreview ? <AvatarImage src={photoPreview} alt="preview" /> :
                    editing?.photo_path && photoUrls[editing.id] ? <AvatarImage src={photoUrls[editing.id]} alt="learner" /> :
                    null}
                  <AvatarFallback><User className="h-8 w-8" /></AvatarFallback>
                </Avatar>
                <div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => onPhotoPick(e.target.files?.[0] ?? null)}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-1" /> {photoFile ? "Change photo" : "Upload photo"}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">JPG / PNG, max 3 MB</p>
                </div>
              </div>

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
                <div className="space-y-1.5">
                  <Label htmlFor="dob">Date of birth</Label>
                  <Input id="dob" name="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="age">Age (auto)</Label>
                  <Input id="age" name="age" value={age ?? ""} readOnly disabled />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sex">Sex</Label>
                  <Select name="sex" defaultValue={editing?.sex ?? "none"}>
                    <SelectTrigger id="sex"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="M">M</SelectItem>
                      <SelectItem value="F">F</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {flags.section && (
                  <div className="space-y-1.5">
                    <Label htmlFor="section">Section</Label>
                    <Select name="section" defaultValue={editing?.section ?? "none"}>
                      <SelectTrigger id="section"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        <SelectItem value="DAY">DAY</SelectItem>
                        <SelectItem value="BOARDING">BOARDING</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
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
                {flags.pay_code && (
                  <div className="space-y-1.5">
                    <Label htmlFor="pay_code">Pay code</Label>
                    <Input id="pay_code" name="pay_code" defaultValue={editing?.pay_code ?? ""} maxLength={50} />
                  </div>
                )}
              </div>

              {/* Registration type selector */}
              <div className="border rounded-md p-3 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <Label className="text-sm font-semibold">Active Registration Type</Label>
                  {p7Lock && (
                    <span className="text-xs text-destructive font-medium">
                      Index Number is required for P7 candidates in Term 2 and 3
                    </span>
                  )}
                </div>
                <RadioGroup
                  value={regType}
                  onValueChange={(v) => !p7Lock && setRegType(v as RegType)}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="INDEX" id="rt-index" disabled={false} />
                    <Label htmlFor="rt-index" className="cursor-pointer">INDEX NO</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="LIN" id="rt-lin" disabled={p7Lock} />
                    <Label htmlFor="rt-lin" className="cursor-pointer">LIN</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="REG" id="rt-reg" disabled={p7Lock} />
                    <Label htmlFor="rt-reg" className="cursor-pointer">REG</Label>
                  </div>
                </RadioGroup>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="index_no">Index Number</Label>
                    <Input id="index_no" value={indexNo} onChange={(e) => setIndexNo(e.target.value)} disabled={regType !== "INDEX"} maxLength={50} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lin_no">LIN</Label>
                    <Input id="lin_no" value={linNo} onChange={(e) => setLinNo(e.target.value)} disabled={regType !== "LIN"} maxLength={50} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg_no">REG</Label>
                    <Input id="reg_no" value={regNo} onChange={(e) => setRegNo(e.target.value)} disabled={regType !== "REG"} maxLength={50} />
                  </div>
                </div>
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
                  <TableHead>Sex</TableHead>
                  <TableHead>Class / Stream</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Reg.</TableHead>
                  {flags.pay_code && <TableHead>Pay code</TableHead>}
                  {flags.house && <TableHead>House</TableHead>}
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => {
                  const regLabel =
                    l.active_reg_type === "INDEX" ? `INDEX: ${l.index_no ?? ""}` :
                    l.active_reg_type === "LIN" ? `LIN: ${l.lin_no ?? ""}` :
                    l.active_reg_type === "REG" ? `REG: ${l.reg_no ?? ""}` : "—";
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        <Avatar className="h-10 w-10">
                          {photoUrls[l.id] ? <AvatarImage src={photoUrls[l.id]} alt={l.full_name} /> : null}
                          <AvatarFallback className="text-xs"><User className="h-4 w-4" /></AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell className="font-medium">{l.full_name}</TableCell>
                      <TableCell>{l.sex ?? "—"}</TableCell>
                      <TableCell className="text-sm">{className(l.class_id)} / {streamName(l.stream_id)}</TableCell>
                      <TableCell>{l.age ?? "—"}</TableCell>
                      <TableCell className="text-sm">{regLabel}</TableCell>
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
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
