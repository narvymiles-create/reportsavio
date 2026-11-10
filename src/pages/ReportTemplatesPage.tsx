import { useEffect, useRef, useState } from "react";
import { Upload, Eye, Trash2, Loader2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { convertTemplateFile, TEMPLATE_FILE_ACCEPT } from "@/lib/templateConversion";
import { templateErrorMessage } from "@/lib/templateErrors";
import { templateBytes, type SchoolTemplate } from "@/lib/reportTemplates";
import { PrimaryPdfViewer } from "@/components/PrimaryPdfViewer";
import { useReportModule, ensureReportModuleSaved } from "@/hooks/useReportModule";
import { defaultTemplatePreview } from "@/lib/pdf/defaultTemplatePreview";

export default function ReportTemplatesPage() {
  const { module, loading: levelLoading } = useReportModule();
  const { schoolId, isAdmin, isSuperAdmin } = useAuth();
  return <LevelTemplates key={`${schoolId}:${module}`} level={module} levelLoading={levelLoading} schoolId={schoolId} canManage={isAdmin || isSuperAdmin} />;
}

function LevelTemplates({ level, levelLoading, schoolId, canManage }: { level: "primary" | "nursery"; levelLoading: boolean; schoolId: string | null; canManage: boolean }) {
  const [templates, setTemplates] = useState<SchoolTemplate[]>([]);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ name: string; generate: () => Promise<Blob> } | null>(null);
  const [deleting, setDeleting] = useState<SchoolTemplate | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = async () => {
    if (!schoolId) { setLoading(false); return; }
    const { data, error } = await supabase.from("report_templates").select("*").eq("school_id", schoolId).eq("level", level).order("created_at", { ascending: false });
    if (error) throw error;
    if (!mounted.current) return;
    setTemplates(data ?? []); setError(""); setLoading(false);
  };
  useEffect(() => { if (!levelLoading) refresh().catch(e => { if (mounted.current) { setError(templateErrorMessage(e)); setLoading(false); } }); }, [schoolId, level, levelLoading]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); await refresh(); }
    catch (e) { toast({ title: "Template action failed", description: templateErrorMessage(e), variant: "destructive" }); }
    finally { if (mounted.current) setBusy(false); }
  };
  const select = (selectedLevel: string, id: string | null) => run(async () => {
    const { error } = await supabase.rpc("select_report_template", { _level: selectedLevel, _template_id: id ?? undefined });
    if (error) throw error;
    toast({ title: id ? "Template activated" : "Default report restored" });
  });
  const upload = () => run(async () => {
    if (!schoolId || !file || !name.trim()) throw new Error("Enter a template name and choose a PDF or image.");
    await ensureReportModuleSaved(schoolId, level);
    const { blob, info } = await convertTemplateFile(file);
    if (!mounted.current) throw new Error("The school or education level changed. Choose the file again in the selected level.");
    const path = `${schoolId}/${level}/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await supabase.storage.from("report-templates").upload(path, blob, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw uploadError;
    try {
      if (!mounted.current) throw new Error("The school or education level changed during upload. Retry in the selected level.");
      const { error: insertError } = await supabase.rpc("upload_report_template", { _expected_level: level, _name: name.trim(), _file_path: path, _page_width: info.width, _page_height: info.height, _page_count: info.pageCount, _field_names: info.fieldNames });
      if (insertError) throw insertError;
    } catch (error) {
      const { error: cleanupError } = await supabase.storage.from("report-templates").remove([path]);
      if (cleanupError) throw new Error(`${templateErrorMessage(error)} The unfinished upload could not be removed: ${templateErrorMessage(cleanupError)}`);
      throw error;
    }
    if (!mounted.current) return;
    setFile(null); setName(""); if (inputRef.current) inputRef.current.value = "";
    toast({ title: "Template uploaded — inactive", description: info.fieldNames.length ? `${info.fieldNames.length} supported text fields. ${info.unsupportedCount ? `${info.unsupportedCount} other fields remain unchanged.` : ""}` : "Fixed PDF saved. Manual placements are available in Report Card Fields Management." });
  });
  const remove = () => run(async () => {
    if (!deleting) return;
    const { error } = await supabase.storage.from("report-templates").remove([deleting.file_path]);
    if (error) throw error;
    const { error: rowError } = await supabase.from("report_templates").delete().eq("id", deleting.id).eq("school_id", schoolId ?? "").eq("level", level);
    if (rowError) throw rowError;
    setDeleting(null); toast({ title: "Template deleted" });
  });
  return <div className="space-y-6 p-6">
    <header><h1 className="text-2xl font-semibold">Report Card Templates</h1><p className="text-sm capitalize text-muted-foreground">{level}</p></header>
    {canManage && !levelLoading && <form className="grid gap-4 border-y py-5 lg:grid-cols-2 xl:grid-cols-[2fr_2fr_auto]" onSubmit={e => { e.preventDefault(); upload(); }}>
      <div className="space-y-2"><Label htmlFor="template-name">Template name</Label><Input id="template-name" value={name} onChange={e => setName(e.target.value)} required disabled={busy} /></div>
      <div className="space-y-2"><Label htmlFor="template-file">PDF or image template</Label><Input id="template-file" ref={inputRef} type="file" accept={TEMPLATE_FILE_ACCEPT} onChange={e => setFile(e.target.files?.[0] ?? null)} required disabled={busy} /></div>
      <Button type="submit" className="self-end" disabled={busy || !schoolId || !file || !name.trim()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Upload template</Button>
    </form>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Table><TableHeader><TableRow><TableHead>Template</TableHead><TableHead>Level</TableHead><TableHead>Status</TableHead><TableHead>PDF fields</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>
      <TableRow><TableCell className="font-medium"><FileText className="mr-2 inline h-4 w-4" />Existing {level === "primary" ? "Primary" : "Nursery"} default</TableCell><TableCell className="capitalize">{level}</TableCell><TableCell><Badge variant={templates.some(t => t.is_active) ? "outline" : "default"}>{templates.some(t => t.is_active) ? "Available" : "Active"}</Badge></TableCell><TableCell>Built-in</TableCell><TableCell><div className="flex justify-end gap-2"><Button variant="ghost" size="icon" title="Preview default template" aria-label={`Preview ${level} default`} disabled={!schoolId} onClick={() => { if (schoolId) setPreview({ name: `${level === "primary" ? "Primary" : "Nursery"} default`, generate: () => defaultTemplatePreview(level, schoolId) }); }}><Eye className="h-4 w-4" /></Button>{canManage && templates.some(t => t.is_active) && <Button variant="outline" disabled={busy} onClick={() => select(level, null)}>Use default</Button>}</div></TableCell></TableRow>
      {templates.map(template => <TableRow key={template.id}><TableCell className="font-medium">{template.name}<span className="ml-2 text-xs text-muted-foreground">{template.page_count} page(s)</span></TableCell><TableCell className="capitalize">{template.level}</TableCell><TableCell><Badge variant={template.is_active ? "default" : "outline"}>{template.is_active ? "Active" : "Inactive"}</Badge></TableCell><TableCell>{Array.isArray(template.field_names) && template.field_names.length ? `${template.field_names.length} supported` : "Design only"}</TableCell><TableCell><div className="flex justify-end gap-2"><Button variant="ghost" size="icon" title="Preview template" aria-label={`Preview ${template.name}`} onClick={() => setPreview({ name: template.name, generate: async () => new Blob([new Uint8Array(await templateBytes(template)).buffer], { type: "application/pdf" }) })}><Eye className="h-4 w-4" /></Button>{canManage && <><Button variant="outline" disabled={busy} onClick={() => select(template.level, template.is_active ? null : template.id)}>{template.is_active ? "Deactivate" : "Activate"}</Button><Button variant="ghost" size="icon" disabled={busy} title="Delete template" aria-label={`Delete ${template.name}`} onClick={() => setDeleting(template)}><Trash2 className="h-4 w-4 text-destructive" /></Button></>}</div></TableCell></TableRow>)}
    </TableBody></Table>}
    <details className="border-t pt-4 text-sm"><summary className="cursor-pointer text-muted-foreground">Supported PDF text field names</summary><div className="mt-3 space-y-2 text-muted-foreground"><p>school.name, school.location, school.tel, school.email, school.motto; learner.full_name, learner.age, learner.sex, learner.lin_no, learner.reg_no, learner.pay_code; class.name, stream.name, term.name, academic.year, term.next_begins_on, term.ends_on; report.class_teacher_comment, report.head_teacher_comment.</p><p>Primary: bot.total, bot.average, bot.aggregate, bot.division, bot.position (also mid/eot); subject.1.name, subject.1.bot, subject.1.bot.grade (also mid/eot and each configured subject).</p><p>Nursery: learning_area.1.name, learning_area.1.grade, learning_area.1.comment (each configured learning area).</p><p>Missing or unrecognised text values are blank. Only standard-font AcroForm text fields are supported; other fields retain their original appearance. Non-fillable PDFs remain unchanged. No images are inserted into text fields.</p></div></details>
    <Dialog open={!!preview} onOpenChange={open => { if (!open) setPreview(null); }}><DialogContent className="max-h-[90vh] max-w-5xl overflow-auto"><DialogHeader><DialogTitle>{preview?.name}</DialogTitle></DialogHeader>{preview && <PrimaryPdfViewer learnerIds={["template"]} termId="template" generate={preview.generate} filename={preview.name} />}</DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}><DialogContent><DialogHeader><DialogTitle>Delete {deleting?.name}?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">This removes the uploaded PDF. The existing default remains available.</p><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={remove}>Delete template</Button></div></DialogContent></Dialog>
  </div>;
}