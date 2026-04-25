import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Loader2, Upload, Image as ImageIcon, Stamp, Settings2 } from "lucide-react";
import { StampPositionDialog } from "@/components/StampPositionDialog";
import { processSignatureFile } from "@/lib/signatureProcessing";

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  location: z.string().trim().min(1).max(200),
  po_box: z.string().trim().max(50).optional().or(z.literal("")),
  tel: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  website: z.string().trim().max(200).optional().or(z.literal("")),
  motto: z.string().trim().max(300).optional().or(z.literal("")),
});

type SchoolInfo = {
  id: string;
  name: string;
  location: string;
  po_box: string | null;
  tel: string;
  email: string | null;
  website: string | null;
  motto: string | null;
  logo_path: string | null;
};

export default function SchoolInfoPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [info, setInfo] = useState<SchoolInfo | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("school_info" as any)
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setInfo((data as any) ?? null);
    if ((data as any)?.logo_path) {
      const { data: signed } = await supabase.storage
        .from("school-assets")
        .createSignedUrl((data as any).logo_path, 3600);
      setLogoUrl(signed?.signedUrl ?? null);
    } else {
      setLogoUrl(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({
      name: fd.get("name"),
      location: fd.get("location"),
      po_box: fd.get("po_box"),
      tel: fd.get("tel"),
      email: fd.get("email"),
      website: fd.get("website"),
      motto: fd.get("motto"),
    });
    if (!parsed.success) {
      toast({
        title: "Invalid input",
        description: Object.values(parsed.error.flatten().fieldErrors).flat().join(", "),
        variant: "destructive",
      });
      return;
    }
    const payload = {
      ...parsed.data,
      po_box: parsed.data.po_box || null,
      email: parsed.data.email || null,
      website: parsed.data.website || null,
      motto: parsed.data.motto || null,
    };
    setSaving(true);
    let error;
    if (info) {
      ({ error } = await supabase.from("school_info" as any).update(payload).eq("id", info.id));
    } else {
      ({ error } = await supabase.from("school_info" as any).insert(payload));
    }
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "School info updated." });
      load();
    }
  };

  const handleLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!info) {
      toast({
        title: "Save first",
        description: "Please save the school info before uploading a logo.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Too large", description: "Logo must be under 2 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `logo-${info.id}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("school-assets")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setUploading(false);
      toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
      return;
    }
    await supabase.from("school_info" as any).update({ logo_path: path }).eq("id", info.id);
    setUploading(false);
    toast({ title: "Logo updated" });
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">School Info</h1>
        <p className="text-muted-foreground">
          This information appears on every report card.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>School logo</CardTitle>
          <CardDescription>PNG or JPG, square works best. Max 2 MB.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="h-24 w-24 rounded-lg border bg-muted flex items-center justify-center overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="School logo" className="h-full w-full object-contain" />
              ) : (
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleLogo}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || !info}
              >
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {logoUrl ? "Replace logo" : "Upload logo"}
              </Button>
              {!info && <p className="text-xs text-muted-foreground mt-2">Save details first to enable logo upload.</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="name">School name *</Label>
              <Input id="name" name="name" defaultValue={info?.name ?? ""} required maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location">Location *</Label>
              <Input id="location" name="location" defaultValue={info?.location ?? ""} required maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po_box">P.O. Box</Label>
              <Input id="po_box" name="po_box" defaultValue={info?.po_box ?? ""} maxLength={50} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tel">Telephone *</Label>
              <Input id="tel" name="tel" defaultValue={info?.tel ?? ""} required maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={info?.email ?? ""} maxLength={200} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="website">Website</Label>
              <Input id="website" name="website" defaultValue={info?.website ?? ""} maxLength={200} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="motto">Motto</Label>
              <Textarea id="motto" name="motto" defaultValue={info?.motto ?? ""} maxLength={300} rows={2} />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
