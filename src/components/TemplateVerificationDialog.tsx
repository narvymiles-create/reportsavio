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
import { ReportFieldsManagement } from "./ReportFieldsManagement";
import { customReportData, generateCustomOutput } from "@/lib/pdf/customReport";
import { loadReportCustomFields } from "@/lib/reportCustomFields";
import { canActivateVerification, verifyTemplateFields, type VerificationField } from "@/lib/templateVerification";
import { type SchoolTemplate } from "@/lib/reportTemplates";
import { templateErrorMessage } from "@/lib/templateErrors";
import { useNavigate } from "react-router-dom";

function Choice({ label, value, set, options }: { label: string; value: string; set: (s: string) => void; options: { id: string; name: string }[] }) {
  return <div className="min-w-0 space-y-2"><Label>{label}</Label><Select value={value} onValueChange={set}><SelectTrigger aria-label={label}><SelectValue placeholder={`Select ${label.toLowerCase()}`} /></SelectTrigger><SelectContent>{options.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent></Select></div>;
}
export function TemplateVerificationDialog({ template, close, activate }: { template: SchoolTemplate; close: () => void; activate: () => Promise<void> }) {
  const navigate = useNavigate();
  const [learners, setLearners] = useState<{ id: string; name: string }[]>([]);
  const [terms, setTerms] = useState<{ id: string; name: string }[]>([]);
  const [years, setYears] = useState<{ id: string; name: string }[]>([]);
  const [learner, setLearner] = useState(""); const [term, setTerm] = useState(""); const [year, setYear] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [fields, setFields] = useState<VerificationField[] | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null); const [revision, setRevision] = useState(0);
  const [verified, setVerified] = useState(false); const [fix, setFix] = useState<{ label: string; tab: string } | null>(null);
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
      const results = verifyTemplateFields(template.level, Array.isArray(template.field_names) ? template.field_names.filter((n): n is string => typeof n === "string") : [], custom, data.values, data.decorations.assets, learner, term, rules.data ?? []);
      setFields(results); setBlob(output); setRevision(r => r + 1);
      if (canActivateVerification(results)) { const { error } = await supabase.rpc("record_template_verification", { _template_id: template.id, _learner_id: learner, _term_id: term, _academic_year: Number(year), _results: results.map(({ key, source, status, required }) => ({ key, source, status, required })) }); if (error) throw error; setVerified(true); }
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
    {fields && <div className="grid min-w-0 gap-6 xl:grid-cols-2"><section className="min-w-0 space-y-3"><h3 className="font-semibold">Field verification</h3><div className="flex flex-wrap gap-4 text-sm">{["Matched", "Missing Data", "Unmatched Field"].map(s => <span key={s}>{s}: {fields.filter(f => f.status === s).length}</span>)}</div>
      {missing > 0 && <p role="status" className="text-sm text-muted-foreground">Missing data is a warning only. These fields remain blank and do not prevent activation.</p>}
      {fields.some(f => f.required && f.status === "Unmatched Field") && <p className="text-sm text-destructive">Required unmatched fields must be corrected before activation.</p>}
      {!fields.length && <p className="text-sm text-muted-foreground">No identifiable fields or configured associations. Unrecognized labels in scanned artwork have not been checked.</p>}
      <Table><TableHeader><TableRow><TableHead>Field</TableHead><TableHead>Status</TableHead><TableHead>Required</TableHead><TableHead>Correction</TableHead></TableRow></TableHeader><TableBody>{fields.map(f => <TableRow key={f.key}><TableCell className="max-w-52 break-words">{f.label}<span className="block text-xs text-muted-foreground">{f.source}</span></TableCell><TableCell>{f.status}</TableCell><TableCell><Checkbox aria-label={`Required ${f.label}`} checked={f.required} disabled={busy} onCheckedChange={c => required(f, c === true)} /></TableCell><TableCell>{f.status === "Unmatched Field" ? <Button size="sm" variant="outline" onClick={() => { setVerified(false); setFix({ label: f.key.startsWith("placement:") ? "" : f.label, tab: "associations" }); }}>Fix Field</Button> : f.status === "Missing Data" ? <Button size="sm" variant="ghost" onClick={() => { if (f.source?.startsWith("custom:")) { setVerified(false); setFix({ label: "", tab: "values" }); } else { const s = f.source ?? ""; navigate(s.startsWith("school.") || s.startsWith("head.teacher.") ? "/school" : s.startsWith("learner.") ? template.level === "primary" ? "/learners" : "/nursery/learners" : s.startsWith("term.") || s === "academic.year" ? "/terms" : s.startsWith("class.") ? "/teachers" : s.startsWith("report.") ? template.level === "primary" ? "/report-cards" : "/nursery/reports" : template.level === "primary" ? "/marks" : "/nursery/assessment"); } }}>Edit data</Button> : null}</TableCell></TableRow>)}</TableBody></Table>
    </section><section className="min-w-0">{blob && <PrimaryPdfViewer key={revision} learnerIds={[learner]} termId={term} filename={`${template.name}-test`} generate={previewOutput} />}</section></div>}
    {fix && <Dialog open onOpenChange={open => { if (!open) setFix(null); }}><DialogContent className="max-h-[90vh] max-w-6xl overflow-auto"><DialogHeader><DialogTitle>Correct template fields · {template.name}</DialogTitle></DialogHeader><ReportFieldsManagement schoolId={template.school_id} level={template.level === "nursery" ? "nursery" : "primary"} verificationTemplateId={template.id} initialTarget={fix.label} initialTab={fix.tab} initialLearnerId={learner} initialTermId={term} initialYear={year} /></DialogContent></Dialog>}
  </DialogContent></Dialog>;
}