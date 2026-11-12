import { useCallback, useEffect, useState } from "react";
import { FlaskConical, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { PrimaryPdfViewer } from "./PrimaryPdfViewer";
import { customReportData, generateCustomOutput, recognisedValues, sectionMapOf, templateFieldNames } from "@/lib/pdf/customReport";
import { TemplateSectionsPanel } from "./TemplateSectionsPanel";
import { loadReportCustomFields } from "@/lib/reportCustomFields";
import { canActivateVerification, verifyTemplate, type VerificationField } from "@/lib/templateVerification";
import { type SchoolTemplate } from "@/lib/reportTemplates";
import { templateErrorMessage } from "@/lib/templateErrors";
import { useNavigate } from "react-router-dom";

function Choice({ label, value, set, options }: { label: string; value: string; set: (s: string) => void; options: { id: string; name: string }[] }) {
  return <div className="min-w-0 space-y-2"><Label>{label}</Label><Select value={value} onValueChange={set}><SelectTrigger aria-label={label}><SelectValue placeholder={`Select ${label.toLowerCase()}`} /></SelectTrigger><SelectContent>{options.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent></Select></div>;
}
export function TemplateVerificationDialog({ template: initialTemplate, close, activate }: { template: SchoolTemplate; close: () => void; activate: () => Promise<void> }) {
  const navigate = useNavigate();
  const [template, setTemplate] = useState(initialTemplate);
  const [learners, setLearners] = useState<{ id: string; name: string }[]>([]);
  const [terms, setTerms] = useState<{ id: string; name: string }[]>([]);
  const [years, setYears] = useState<{ id: string; name: string }[]>([]);
  const [learner, setLearner] = useState(""); const [term, setTerm] = useState(""); const [year, setYear] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [fields, setFields] = useState<VerificationField[] | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null); const [revision, setRevision] = useState(0);
  const [verified, setVerified] = useState(false);
  const previewOutput = useCallback(async () => { if (!blob) throw new Error("Run template verification first."); return blob; }, [blob]);
  useEffect(() => { let alive = true; Promise.all([
    supabase.from(template.level === "primary" ? "learners" : "nursery_learners").select("id,full_name").eq("school_id", template.school_id).order("full_name"),
    supabase.from("terms").select("id,name").eq("school_id", template.school_id).order("name"),
    supabase.from("academic_years").select("year,is_current").eq("school_id", template.school_id).order("year", { ascending: false }),
  ]).then(results => { for (const r of results) if (r.error) throw r.error; if (!alive) return;
    setLearners((results[0].data ?? []).map(l => ({ id: l.id, name: l.full_name }))); setTerms(results[1].data ?? []);
    setYears((results[2].data ?? []).map(y => ({ id: String(y.year), name: String(y.year) }))); const current = results[2].data?.find(y => y.is_current); if (current) setYear(String(current.year));
  }).catch(e => { if (alive) setError(templateErrorMessage(e)); }); return () => { alive = false; }; }, [template.id]);
  const change = (setter: (s: string) => void) => (s: string) => { setter(s); setVerified(false); setFields(null); setBlob(null); };
  const test = async () => {
    setBusy(true); setError(""); setVerified(false); setBlob(null); setFields(null);
    try {
      const [data, custom, rules, output] = await Promise.all([customReportData(template.level, learner, term, template.school_id, Number(year)), loadReportCustomFields(template.school_id, template.level, template.id), supabase.from("template_field_rules").select("field_key,required").eq("template_id", template.id), generateCustomOutput(template, [learner], term, undefined, Number(year))]);
      if (rules.error) throw rules.error;
      const lvl = template.level === "nursery" ? "nursery" : "primary";
      const results = verifyTemplate(lvl, templateFieldNames(template), sectionMapOf(template), data.values, data.decorations.assets, rules.data ?? [], custom.fields, recognisedValues(template, data.values, custom.fields, custom.values, learner, term));
      setFields(results); setBlob(output); setRevision(r => r + 1);
      if (canActivateVerification(results)) { const { error } = await supabase.rpc("record_template_verification", { _template_id: template.id, _learner_id: learner, _term_id: term, _academic_year: Number(year), _results: results.map(({ key, section, status, required }) => ({ key, section, status, required })) }); if (error) throw error; setVerified(true); }
    } catch (e) { setError(templateErrorMessage(e)); } finally { setBusy(false); }
  };
  const required = async (field: VerificationField, checked: boolean) => {
    setBusy(true); setVerified(false);
    try { const { error } = await supabase.from("template_field_rules").upsert({ template_id: template.id, field_key: field.key, required: checked }); if (error) throw error; setFields(fs => fs?.map(f => f.key === field.key ? { ...f, required: checked } : f) ?? null); }
    catch (e) { setError(templateErrorMessage(e)); } finally { setBusy(false); }
  };
  const missing = fields?.filter(f => f.status === "Missing Data").length ?? 0;
  return <Dialog open onOpenChange={open => { if (!open && !busy) close(); }}><DialogContent className="max-h-[95vh] max-w-7xl overflow-auto"><DialogHeader><DialogTitle>Test Template · {template.name}</DialogTitle></DialogHeader>
    <div className="grid gap-4 sm:grid-cols-3"><Choice label="Learner" value={learner} set={change(setLearner)} options={learners} /><Choice label="Academic year" value={year} set={change(setYear)} options={years} /><Choice label="Term" value={term} set={change(setTerm)} options={terms} /></div>
    <div className="flex flex-wrap gap-2"><Button disabled={busy || !learner || !year || !term} onClick={test}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : fields ? <RefreshCw className="mr-2 h-4 w-4" /> : <FlaskConical className="mr-2 h-4 w-4" />}{fields ? "Rerun verification" : "Test Template"}</Button>{!template.is_active && <Button variant="outline" disabled={busy || !verified} onClick={async () => { setBusy(true); try { await activate(); close(); } catch (e) { setError(templateErrorMessage(e)); } finally { setBusy(false); } }}>Activate template</Button>}</div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {fields && <div className="grid min-w-0 gap-6 xl:grid-cols-2"><section className="min-w-0 space-y-3"><h3 className="font-semibold">Recognition summary</h3>
      {(() => { const sections = [...new Set(fields.filter(f => f.section).map(f => f.section))]; const unrecognised = fields.filter(f => f.status === "Unrecognised"); return <>
        <Table><TableHeader><TableRow><TableHead>Report section</TableHead><TableHead>Filled</TableHead><TableHead>Missing learner data</TableHead></TableRow></TableHeader><TableBody>{sections.map(sec => { const fs = fields.filter(f => f.section === sec); const miss = fs.filter(f => f.status === "Missing Data").length; return <TableRow key={sec}><TableCell>{sec}</TableCell><TableCell>{fs.length - miss}</TableCell><TableCell>{miss ? <Button size="sm" variant="ghost" onClick={() => navigate(/Examination|Assessment/.test(sec) ? template.level === "primary" ? "/marks" : "/nursery/assessment" : /Comment/.test(sec) ? template.level === "primary" ? "/report-cards" : "/nursery/reports" : /School/.test(sec) || /Signatures/.test(sec) ? "/school" : /Term|Next/.test(sec) ? "/terms" : template.level === "primary" ? "/learners" : "/nursery/learners")}>{miss} · Edit data</Button> : 0}</TableCell></TableRow>; })}</TableBody></Table>
        {!sections.length && <p className="text-sm text-muted-foreground">No sections are filled automatically yet. Confirm tables or position them below.</p>}
        {missing > 0 && <p role="status" className="text-sm text-muted-foreground">Missing learner data is a warning only. Those places stay blank and do not prevent activation.</p>}
        {unrecognised.length > 0 && <div className="space-y-2"><h4 className="text-sm font-medium">Template labels not recognised</h4><p className="text-sm text-muted-foreground">Confirm the table below, or tick “Leave blank” to allow activation.</p><ul className="space-y-1">{unrecognised.map(f => <li key={f.key} className="flex items-center gap-2 text-sm"><Checkbox aria-label={`Leave ${f.label} blank`} checked={!f.required} disabled={busy} onCheckedChange={c => required(f, c !== true)} />Leave “{f.label}” blank</li>)}</ul></div>}
      </>; })()}
      <div className="border-t pt-3"><TemplateSectionsPanel template={template} canManage onChanged={t => { setTemplate(t); setVerified(false); setFields(null); setBlob(null); }} /></div>
    </section><section className="min-w-0">{blob && <PrimaryPdfViewer key={revision} learnerIds={[learner]} termId={term} filename={`${template.name}-test`} generate={previewOutput} />}</section></div>}
  </DialogContent></Dialog>;
}