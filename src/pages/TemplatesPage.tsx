import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileUp, Loader2, MapPin, RefreshCw, Trash2, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  deleteTemplate, listTemplates, replaceTemplateFile, setTemplateActive, uploadTemplate,
  type ReportTemplate, type TemplateLevel,
} from "@/lib/templates";

const LEVEL_LABEL: Record<TemplateLevel, string> = { nursery: "Nursery", primary: "Primary" };

function TemplateCard({ template, onChanged }: { template: ReportTemplate; onChanged: () => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const replaceRef = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ title: ok });
      onChanged();
    } catch (e: any) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> {template.name}
          </CardTitle>
          {template.is_active
            ? <Badge>Active</Badge>
            : <Badge variant="outline">Inactive</Badge>}
        </div>
        <CardDescription>
          {LEVEL_LABEL[template.level]} template · uploaded {new Date(template.created_at).toLocaleDateString()}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => navigate(`/templates/${template.id}`)}>
          <MapPin className="mr-1 h-4 w-4" /> Preview &amp; Map Fields
        </Button>
        {template.is_active ? (
          <Button size="sm" variant="outline" disabled={busy}
            onClick={() => run(() => setTemplateActive(template, false), "Template deactivated — the default report card is back in use")}>
            Deactivate
          </Button>
        ) : (
          <Button size="sm" disabled={busy}
            onClick={() => run(() => setTemplateActive(template, true), "Template activated for all " + LEVEL_LABEL[template.level] + " reports")}>
            <CheckCircle2 className="mr-1 h-4 w-4" /> Activate
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => replaceRef.current?.click()}>
          <RefreshCw className="mr-1 h-4 w-4" /> Replace
        </Button>
        <input
          ref={replaceRef} type="file" accept="application/pdf,.pdf" className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) run(() => replaceTemplateFile(template, f), "Template file replaced");
            e.target.value = "";
          }}
        />
        <Button size="sm" variant="destructive" disabled={busy} onClick={() => setConfirmDelete(true)}>
          <Trash2 className="mr-1 h-4 w-4" /> Delete
        </Button>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{template.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the uploaded template, its field mappings and custom fields.
                Learners, marks and historical reports are not affected. The existing default
                {" "}{LEVEL_LABEL[template.level]} report card will be used instead.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => run(() => deleteTemplate(template), "Template deleted")}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadLevel, setUploadLevel] = useState<TemplateLevel>("primary");
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setTemplates(await listTemplates());
    } catch (e: any) {
      toast({ title: "Could not load templates", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const doUpload = async () => {
    if (!uploadFile) return toast({ title: "Choose a PDF file first", variant: "destructive" });
    setUploading(true);
    try {
      await uploadTemplate(uploadLevel, uploadName || uploadFile.name, uploadFile);
      toast({ title: "Template uploaded", description: "Now map fields onto it, then activate it." });
      setUploadOpen(false);
      setUploadName("");
      setUploadFile(null);
      reload();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const renderLevel = (level: TemplateLevel) => {
    const list = templates.filter((t) => t.level === level);
    const active = list.find((t) => t.is_active);
    return (
      <div className="space-y-4">
        <Card className={!active ? "border-primary" : ""}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Default {LEVEL_LABEL[level]} Report Card</CardTitle>
              {!active && <Badge>In use</Badge>}
            </div>
            <CardDescription>
              The built-in {LEVEL_LABEL[level]} report card. It is always used unless a custom
              template below is activated.
            </CardDescription>
          </CardHeader>
        </Card>
        {list.map((t) => <TemplateCard key={t.id} template={t} onChanged={reload} />)}
        {!list.length && (
          <p className="text-sm text-muted-foreground">
            No custom {LEVEL_LABEL[level]} templates uploaded yet.
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Report Card Templates</h1>
          <p className="text-sm text-muted-foreground">
            Upload an alternative report card for Nursery or Primary. An active template applies to
            every class, learner, term and academic year of its level.
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <FileUp className="mr-2 h-4 w-4" /> Upload Template
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <Tabs defaultValue="primary">
          <TabsList>
            <TabsTrigger value="primary">Primary</TabsTrigger>
            <TabsTrigger value="nursery">Nursery</TabsTrigger>
          </TabsList>
          <TabsContent value="primary" className="mt-4">{renderLevel("primary")}</TabsContent>
          <TabsContent value="nursery" className="mt-4">{renderLevel("nursery")}</TabsContent>
        </Tabs>
      )}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Report Card Template</DialogTitle>
            <DialogDescription>
              Upload a PDF of the report card design. You will map fields onto it next.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Education level</Label>
              <Select value={uploadLevel} onValueChange={(v) => setUploadLevel(v as TemplateLevel)}>
                <SelectTrigger aria-label="Education level"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nursery">Nursery</SelectItem>
                  <SelectItem value="primary">Primary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tpl-name">Template name</Label>
              <Input id="tpl-name" value={uploadName} onChange={(e) => setUploadName(e.target.value)}
                placeholder="e.g. 2026 Boarding Section Design" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tpl-file">Template PDF</Label>
              <Input id="tpl-file" type="file" accept="application/pdf,.pdf"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button onClick={doUpload} disabled={uploading || !uploadFile}>
              {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
