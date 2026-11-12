import { useEffect, useState } from "react";
import { Eye, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PrimaryPdfViewer } from "@/components/PrimaryPdfViewer";
import { toast } from "@/hooks/use-toast";
import { DATA_SOURCES, validateFieldValue, type ReportField, type ReportValue, type ReportAssociation } from "@/lib/reportCustomFields";
import { TemplateSectionsPanel } from "@/components/TemplateSectionsPanel";
import { normalizeField } from "@/lib/pdf/template/forms";
import { templateBytes, type SchoolTemplate } from "@/lib/reportTemplates";
import { generateCustomOutput } from "@/lib/pdf/customReport";

function Choice({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: { id: string; name: string }[]; disabled?: boolean }) {
  return <div className="min-w-0 space-y-2"><Label>{label}</Label><Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={label}><SelectValue placeholder={`Select ${label.toLowerCase()}`} /></SelectTrigger><SelectContent>{options.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent></Select></div>;
}
const TYPES = [{ id: "text", name: "Text" }, { id: "number", name: "Number" }, { id: "date", name: "Date" }, { id: "percentage", name: "Percentage" }, { id: "multiline", name: "Multiline Text" }];
const SCOPES = [{ id: "school", name: "School-wide" }, { id: "learner", name: "Learner-specific" }];

export function ReportFieldsManagement({ level, schoolId, verificationTemplateId, initialTarget = "", initialTab = "fields", initialLearnerId = "", initialTermId = "all", initialYear = "all" }: { level: "primary" | "nursery"; schoolId: string; verificationTemplateId?: string; initialTarget?: string; initialTab?: string; initialLearnerId?: string; initialTermId?: string; initialYear?: string }) {
  const { isAdmin, isSuperAdmin } = useAuth();
  const canManage = isAdmin || isSuperAdmin;
  const [fields, setFields] = useState<ReportField[]>([]);
  const [values, setValues] = useState<ReportValue[]>([]);
  const [associations, setAssociations] = useState<ReportAssociation[]>([]);
  const [templates, setTemplates] = useState<SchoolTemplate[]>([]);
  const [learners, setLearners] = useState<{ id: string; name: string }[]>([]);
  const [terms, setTerms] = useState<{ id: string; name: string }[]>([]);
  const [years, setYears] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ReportField | null>(null);
  const [fieldOpen, setFieldOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [scope, setScope] = useState("learner");
  const [fieldId, setFieldId] = useState("");
  const [learnerId, setLearnerId] = useState(initialLearnerId);
  const [termId, setTermId] = useState(initialTermId);
  const [year, setYear] = useState(initialYear);
  const [value, setValue] = useState("");
  const [templateId, setTemplateId] = useState(verificationTemplateId ?? "");
  const [preview, setPreview] = useState<{ name: string; generate: () => Promise<Blob> } | null>(null);
  const selectedField = fields.find(f => f.id === fieldId);
  const template = templates.find(t => t.id === templateId);
  const existingValue = values.find(v => v.definition_id === fieldId && v.learner_id === (selectedField?.scope === "learner" ? learnerId : null) && v.term_id === (termId === "all" ? null : termId) && v.academic_year === (year === "all" ? null : Number(year)));

  const refresh = async () => {
    const results = await Promise.all([
      supabase.from("report_field_definitions").select("*").eq("school_id", schoolId).eq("level", level).eq("archived", false).order("label"),
      supabase.from("report_field_values").select("*").eq("school_id", schoolId).eq("level", level),
      supabase.from("report_field_associations").select("*").eq("school_id", schoolId).eq("level", level),
      supabase.from("report_templates").select("*").eq("school_id", schoolId).eq("level", level).order("name"),
      supabase.from(level === "primary" ? "learners" : "nursery_learners").select("id,full_name").eq("school_id", schoolId).order("full_name"),
      supabase.from("terms").select("id,name").eq("school_id", schoolId).order("name"),
      supabase.from("academic_years").select("year").eq("school_id", schoolId).order("year", { ascending: false }),
    ]);
    for (const result of results) if (result.error) throw result.error;
    setFields(results[0].data ?? []); setValues(results[1].data ?? []); setAssociations(results[2].data ?? []); setTemplates(results[3].data ?? []);
    setLearners((results[4].data ?? []).map(l => ({ id: l.id, name: l.full_name }))); setTerms(results[5].data ?? []);
    setYears((results[6].data ?? []).map(y => ({ id: String(y.year), name: String(y.year) }))); setError("");
  };
  useEffect(() => { refresh().catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  const activeTemplate = templates.find(t => verificationTemplateId ? t.id === verificationTemplateId : t.is_active) ?? null;
  useEffect(() => { if (activeTemplate) setTemplateId(id => id || activeTemplate.id); }, [activeTemplate?.id]);
  const activeLabels = activeTemplate && Array.isArray(activeTemplate.field_names) ? activeTemplate.field_names.filter((n): n is string => typeof n === "string") : [];
  const activeAssociations = activeTemplate ? associations.filter(a => a.template_id === activeTemplate.id) : [];
  useEffect(() => { setValue(existingValue?.value ?? ""); }, [existingValue?.id, existingValue?.value, fieldId, learnerId, termId, year]);
  const run = async (action: () => Promise<void>) => {
    if (!canManage) return;
    setBusy(true);
    try { await action(); await refresh(); }
    catch (e) { toast({ title: "Could not save", description: e instanceof Error ? e.message : String(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const saveField = () => run(async () => {
    if (!label.trim()) throw new Error("Enter the exact label.");
    if (DATA_SOURCES.some(key => normalizeField(label) === key || normalizeField(label) === key.split(".").slice(1).join("."))) throw new Error("This information already exists and is filled automatically.");
    const payload = { school_id: schoolId, level, label: label.trim(), field_type: type, scope };
    const result = editing ? await supabase.from("report_field_definitions").update(payload).eq("id", editing.id) : await supabase.from("report_field_definitions").insert(payload);
    if (result.error) throw result.error;
    setFieldOpen(false); toast({ title: "Field saved" });
  });
  const saveValue = () => run(async () => {
    if (!selectedField || selectedField.scope === "learner" && !learnerId) throw new Error("Choose a field and learner.");
    validateFieldValue(selectedField.field_type, value);
    const payload = { school_id: schoolId, level, definition_id: fieldId, learner_id: selectedField.scope === "learner" ? learnerId : null, term_id: termId === "all" ? null : termId, academic_year: year === "all" ? null : Number(year), value };
    const result = existingValue ? await supabase.from("report_field_values").update(payload).eq("id", existingValue.id) : await supabase.from("report_field_values").insert(payload);
    if (result.error) throw result.error;
    toast({ title: "Value saved" });
  });
  const remove = (table: "report_field_values" | "report_field_associations", id: string) => run(async () => {
    if (!confirm(table === "report_field_values" ? "Delete this saved value?" : "Remove this association? Saved values will be retained.")) return;
    const result = await supabase.from(table).delete().eq("id", id).eq("school_id", schoolId).eq("level", level);
    if (result.error) throw result.error;
    toast({ title: table === "report_field_values" ? "Value deleted" : "Association removed" });
  });
  if (loading) return <Loader2 aria-label="Loading report fields" className="h-5 w-5 animate-spin" />;
  if (!activeTemplate) return <section className="space-y-2 border-y py-6">
    <h2 className="text-xl font-semibold">Report Card Fields Management</h2>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <p className="text-sm text-muted-foreground">Custom fields are available only for uploaded report card templates.</p>
  </section>;
  return <section className="space-y-4 border-y py-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Report Card Fields Management</h2><p className="text-sm capitalize text-muted-foreground">{level} · {verificationTemplateId ? "Test template" : "Active template"}: <span className="normal-case">{activeTemplate.name}</span></p></div>{canManage && <Button onClick={() => { setEditing(null); setLabel(initialTarget); setType("text"); setScope("learner"); setFieldOpen(true); }}><Plus className="mr-2 h-4 w-4" />Add field</Button>}</header>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Labels in the active template</h3>
      {activeLabels.length || activeAssociations.length ? <ul className="flex flex-wrap gap-2" aria-label="Active template labels">
        {activeLabels.map(n => <li key={`f:${n}`} className="rounded border px-2 py-1 text-xs">{n}</li>)}
        {activeAssociations.filter(a => !a.pdf_field).map(a => <li key={a.id} className="rounded border px-2 py-1 text-xs">{fields.find(f => f.id === a.definition_id)?.label ?? a.source_key ?? "Archived field"} · placed on page {a.page}</li>)}
      </ul> : <p className="text-sm text-muted-foreground">No labels were detected in this template and none have been associated yet. Use Report sections to position tables once.</p>}
    </div>
    <Tabs defaultValue={initialTab}><TabsList className="max-w-full"><TabsTrigger value="fields">Fields</TabsTrigger><TabsTrigger value="values">Saved values</TabsTrigger><TabsTrigger value="associations">Report sections</TabsTrigger></TabsList>
      <TabsContent value="fields"><Table><TableHeader><TableRow><TableHead>Exact label</TableHead><TableHead>Type</TableHead><TableHead>Scope</TableHead><TableHead>Saved values</TableHead><TableHead /></TableRow></TableHeader><TableBody>{fields.map(f => <TableRow key={f.id}><TableCell>{f.label}</TableCell><TableCell>{TYPES.find(t => t.id === f.field_type)?.name}</TableCell><TableCell>{SCOPES.find(s => s.id === f.scope)?.name}</TableCell><TableCell>{values.filter(v => v.definition_id === f.id).length}</TableCell><TableCell><div className="flex gap-1">{canManage && <><Button variant="ghost" size="icon" aria-label={`Edit ${f.label}`} title="Edit field" onClick={() => { setEditing(f); setLabel(f.label); setType(f.field_type); setScope(f.scope); setFieldOpen(true); }}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Archive ${f.label}`} title="Archive field" onClick={() => run(async () => { if (!confirm("Archive this field? Historical values will be retained.")) return; const result = await supabase.from("report_field_definitions").update({ archived: true }).eq("id", f.id); if (result.error) throw result.error; })}><Trash2 className="h-4 w-4 text-destructive" /></Button></>}</div></TableCell></TableRow>)}</TableBody></Table>{!fields.length && <p className="py-5 text-sm text-muted-foreground">No custom fields.</p>}</TabsContent>
      <TabsContent value="values" className="space-y-5">
        <form className="space-y-4 border-b py-4" onSubmit={e => { e.preventDefault(); saveValue(); }}><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Choice label="Custom field" value={fieldId} onChange={setFieldId} options={fields.map(f => ({ id: f.id, name: f.label }))} />
          {selectedField?.scope === "learner" && <Choice label="Learner" value={learnerId} onChange={setLearnerId} options={learners} />}
          <Choice label="Academic year" value={year} onChange={setYear} options={[{ id: "all", name: "All years" }, ...years]} />
          <Choice label="Term" value={termId} onChange={setTermId} options={[{ id: "all", name: "All terms" }, ...terms]} />
        </div><div className="space-y-2"><Label htmlFor="custom-value">Value</Label>{selectedField?.field_type === "multiline" ? <Textarea id="custom-value" maxLength={5000} value={value} onChange={e => setValue(e.target.value)} disabled={!canManage} /> : <Input id="custom-value" type={selectedField?.field_type === "date" ? "date" : ["number", "percentage"].includes(selectedField?.field_type ?? "") ? "number" : "text"} step="any" min={selectedField?.field_type === "percentage" ? 0 : undefined} max={selectedField?.field_type === "percentage" ? 100 : undefined} value={value} onChange={e => setValue(e.target.value)} disabled={!canManage} />}</div>{canManage && <Button type="submit" disabled={busy || !selectedField}><Save className="mr-2 h-4 w-4" />Save value</Button>}</form>
        <Table><TableHeader><TableRow><TableHead>Field</TableHead><TableHead>Learner / Scope</TableHead><TableHead>Period</TableHead><TableHead>Value</TableHead><TableHead /></TableRow></TableHeader><TableBody>{values.map(v => <TableRow key={v.id}><TableCell>{fields.find(f => f.id === v.definition_id)?.label ?? "Archived field"}</TableCell><TableCell>{learners.find(l => l.id === v.learner_id)?.name ?? "School-wide"}</TableCell><TableCell>{v.academic_year ?? "All years"} · {terms.find(t => t.id === v.term_id)?.name ?? "All terms"}</TableCell><TableCell className="max-w-64 whitespace-pre-wrap break-words">{v.value || "—"}</TableCell><TableCell><div className="flex gap-1">{canManage && <><Button variant="ghost" size="icon" aria-label="Edit saved value" title="Edit value" disabled={!fields.some(f => f.id === v.definition_id)} onClick={() => { setFieldId(v.definition_id); setLearnerId(v.learner_id ?? ""); setTermId(v.term_id ?? "all"); setYear(v.academic_year == null ? "all" : String(v.academic_year)); }}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label="Delete saved value" title="Delete value" disabled={busy} onClick={() => remove("report_field_values", v.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></>}</div></TableCell></TableRow>)}</TableBody></Table>
      </TabsContent>
      <TabsContent value="associations" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2"><Choice label="Uploaded template" value={templateId} onChange={setTemplateId} options={templates.map(t => ({ id: t.id, name: t.name }))} />{template && <Button className="self-end justify-self-start" variant="outline" onClick={() => setPreview({ name: template.name, generate: async () => new Blob([new Uint8Array(await templateBytes(template)).buffer], { type: "application/pdf" }) })}><Eye className="mr-2 h-4 w-4" />View template</Button>}</div>
        {template && <><TemplateSectionsPanel key={template.id} template={template} canManage={canManage} onChanged={t => setTemplates(ts => ts.map(x => x.id === t.id ? t : x))} />
          <div className="grid gap-4 sm:grid-cols-3"><Choice label="Preview learner" value={learnerId} onChange={setLearnerId} options={learners} /><Choice label="Preview term" value={termId} onChange={setTermId} options={terms} /><Button className="self-end" variant="outline" disabled={!learnerId || termId === "all"} onClick={() => setPreview({ name: `${template.name} · ${learners.find(l => l.id === learnerId)?.name}`, generate: () => generateCustomOutput(template, [learnerId], termId) })}><Eye className="mr-2 h-4 w-4" />Preview completed report</Button></div></>}
        {!templates.length && <p className="text-sm text-muted-foreground">No uploaded {level} templates.</p>}
      </TabsContent>
    </Tabs>
    <Dialog open={fieldOpen} onOpenChange={setFieldOpen}><DialogContent><DialogHeader><DialogTitle>{editing ? "Edit field" : "Add custom field"}</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={e => { e.preventDefault(); saveField(); }}><div className="space-y-2"><Label htmlFor="custom-label">Exact template label</Label><Input id="custom-label" value={label} onChange={e => setLabel(e.target.value)} maxLength={120} required /></div><Choice label="Data type" value={type} onChange={setType} options={TYPES} disabled={!!editing && values.some(v => v.definition_id === editing.id)} /><Choice label="Scope" value={scope} onChange={setScope} options={SCOPES} disabled={!!editing && values.some(v => v.definition_id === editing.id)} /><Button type="submit" disabled={busy}>Save field</Button></form></DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={open => { if (!open) setPreview(null); }}><DialogContent className="max-h-[90vh] max-w-5xl overflow-auto"><DialogHeader><DialogTitle>{preview?.name}</DialogTitle></DialogHeader>{preview && <PrimaryPdfViewer learnerIds={["custom-preview"]} termId="custom-preview" generate={preview.generate} filename={preview.name} />}</DialogContent></Dialog>
  </section>;
}