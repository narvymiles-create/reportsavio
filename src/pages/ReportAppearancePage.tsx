import { useCallback, useEffect, useState } from "react";
import { Palette, RotateCcw, Save, Loader2, Plus, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useReportModule } from "@/hooks/useReportModule";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PrimaryPdfViewer } from "@/components/PrimaryPdfViewer";
import { toast } from "@/hooks/use-toast";
import { APPEARANCE_KEY, APPEARANCE_CHANGED, APPEARANCE_PRESETS, COLOUR_GROUPS, CUSTOM_THEMES_KEY, MAX_THEME_COLOURS, parseCustomThemes, themeFromColours, type CustomTheme, appearanceWarnings, defaultColours, parseAppearance, type AppearanceRole, type ReportAppearance } from "@/lib/reportAppearance";
import { loadAppearancePreview } from "@/lib/reportAppearancePreview";

export default function ReportAppearancePage() {
  const { schoolId } = useAuth();
  const { module, loading } = useReportModule();
  if (!schoolId || loading) return <Loader2 className="h-5 w-5 animate-spin" />;
  return <AppearanceEditor key={`${schoolId}:${module}`} schoolId={schoolId} level={module} />;
}
function AppearanceEditor({ schoolId, level }: { schoolId: string; level: "primary" | "nursery" }) {
  const { isAdmin, isSuperAdmin } = useAuth();
  const [saved, setSaved] = useState<ReportAppearance>({});
  const [draft, setDraft] = useState<ReportAppearance>({});
  const [previewDraft, setPreviewDraft] = useState<ReportAppearance>({});
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof loadAppearancePreview>> | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const defaults = defaultColours(level);
  const [terms, setTerms] = useState<{ id: string; name: string; year: number; is_current: boolean }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [learners, setLearners] = useState<{ id: string; full_name: string; class_id: string | null }[]>([]);
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("all");
  const [learnerId, setLearnerId] = useState("");
  const [themes, setThemes] = useState<CustomTheme[]>([]);
  const [themeName, setThemeName] = useState("");
  const [themeColours, setThemeColours] = useState<string[]>(["#1e3a8a", "#eff6ff", "#111111"]);
  const canEdit = isAdmin || isSuperAdmin;
  useEffect(() => {
    let alive = true;
    const nursery = level === "nursery";
    Promise.all([
      supabase.from("system_settings").select("key,value").eq("school_id", schoolId).in("key", [APPEARANCE_KEY, CUSTOM_THEMES_KEY]),
      supabase.from("terms").select("id,name,year,is_current").eq("school_id", schoolId).order("year", { ascending: false }).order("name"),
      supabase.from(nursery ? "nursery_classes" : "classes").select("id,name").eq("school_id", schoolId).order("sort_order"),
      supabase.from(nursery ? "nursery_learners" : "learners").select("id,full_name,class_id").eq("school_id", schoolId).order("full_name"),
    ]).then(([settings, t, c, l]) => {
      const err = settings.error || t.error || c.error || l.error; if (err) throw err; if (!alive) return;
      const colours = parseAppearance(settings.data?.find(r => r.key === APPEARANCE_KEY)?.value); setSaved(colours); setDraft(colours); setPreviewDraft(colours);
      setThemes(parseCustomThemes(settings.data?.find(r => r.key === CUSTOM_THEMES_KEY)?.value));
      const termRows = t.data ?? []; setTerms(termRows); setClasses(c.data ?? []); setLearners(l.data ?? []);
      setTermId((termRows.find(x => x.is_current) ?? termRows[0])?.id ?? ""); setLearnerId(l.data?.[0]?.id ?? "");
      setReady(true);
    }).catch(e => { if (alive) setError(e.message ?? "Could not load appearance settings."); });
    return () => { alive = false; };
  }, [schoolId, level]);
  useEffect(() => {
    if (!ready) return; let alive = true; setPreview(null);
    loadAppearancePreview(schoolId, level, { learnerId: learnerId || undefined, termId: termId || undefined })
      .then(r => { if (alive) setPreview(r); }).catch(e => { if (alive) setError(e.message ?? "Could not load preview."); });
    return () => { alive = false; };
  }, [ready, schoolId, level, learnerId, termId]);
  const visibleLearners = classId === "all" ? learners : learners.filter(x => x.class_id === classId);
  const pickClass = (id: string) => { setClassId(id); const list = id === "all" ? learners : learners.filter(x => x.class_id === id); if (!list.some(x => x.id === learnerId)) setLearnerId(list[0]?.id ?? ""); };
  const saveThemes = async (next: CustomTheme[]) => {
    const { error } = await supabase.from("system_settings").upsert({ school_id: schoolId, key: CUSTOM_THEMES_KEY, value: next }, { onConflict: "school_id,key" });
    if (error) return toast({ title: "Could not save theme", description: error.message, variant: "destructive" });
    setThemes(next);
  };
  const addTheme = async () => {
    const name = themeName.trim(); if (!name) return toast({ title: "Give your theme a name", variant: "destructive" });
    const colours = themeColours.filter(Boolean).slice(0, MAX_THEME_COLOURS);
    await saveThemes([...themes.filter(t => t.name !== name), { name, colours }]); setDraft(themeFromColours(colours)); setThemeName("");
    toast({ title: `Theme "${name}" saved`, description: "Click Save Changes to use it on report cards." });
  };
  useEffect(() => { const timer = setTimeout(() => setPreviewDraft(draft), 100); return () => clearTimeout(timer); }, [draft]);
  const warnings = appearanceWarnings(draft, level);
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  const generate = useCallback(async () => { if (!preview) throw new Error("Preview not ready."); return preview.render(previewDraft); }, [preview, previewDraft]);
  const change = (role: AppearanceRole, colour: string) => { if (/^#[0-9a-f]{6}$/i.test(colour)) setDraft(current => ({ ...defaults, ...current, [role]: colour.toLowerCase() })); };
  const save = async () => {
    if (warnings.length || !(isAdmin || isSuperAdmin)) return;
    setSaving(true);
    const { error } = await supabase.from("system_settings").upsert({ school_id: schoolId, key: APPEARANCE_KEY, value: draft }, { onConflict: "school_id,key" });
    setSaving(false);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    setSaved(draft); window.dispatchEvent(new Event(APPEARANCE_CHANGED));
    toast({ title: "Report colours saved for your school" });
  };
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Palette className="h-6 w-6" />Report Card Appearance Settings</h1>
      <span className="text-sm text-muted-foreground capitalize">{level} · {dirty ? "Unsaved changes" : "Saved colours"}</span>
    </div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!ready && !error && <p role="status">Loading school report…</p>}
    {ready && <div className="grid items-start gap-6 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
      <div className="space-y-5 min-w-0">
        <fieldset disabled={saving || !(isAdmin || isSuperAdmin)} className="space-y-4">
          <legend className="font-semibold mb-3">Colour themes</legend>
          <div className="flex flex-wrap gap-2">{APPEARANCE_PRESETS.map(theme => <Button key={theme.name} variant="outline" onClick={() => setDraft(theme.colours)}>{theme.name}</Button>)}
            {themes.map(theme => <span key={theme.name} className="inline-flex items-center rounded-md border">
              <Button variant="ghost" className="gap-2" onClick={() => setDraft(themeFromColours(theme.colours))}><span className="flex">{theme.colours.map((c, i) => <span key={i} className="h-4 w-4 rounded-full border" style={{ background: c }} />)}</span>{theme.name}</Button>
              <Button variant="ghost" size="icon" aria-label={`Delete ${theme.name}`} onClick={() => saveThemes(themes.filter(t => t.name !== theme.name))}><X className="h-4 w-4" /></Button>
            </span>)}</div>
          <div className="rounded-md border p-3 space-y-3">
            <p className="text-sm font-medium">Create your own theme (up to {MAX_THEME_COLOURS} colours)</p>
            <div className="flex flex-wrap gap-3">{["Main colour", "Light shade", "Text colour"].map((label, i) => <label key={label} className="flex flex-col gap-1 text-xs text-muted-foreground">{label}
              <Input type="color" aria-label={label} value={themeColours[i]} onChange={e => setThemeColours(cs => cs.map((c, j) => j === i ? e.target.value : c))} className="h-9 w-14 p-1 cursor-pointer" /></label>)}</div>
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Theme name" value={themeName} maxLength={40} onChange={e => setThemeName(e.target.value)} className="h-9 w-40" />
              <Button variant="outline" onClick={() => setDraft(themeFromColours(themeColours))}>Try it</Button>
              <Button onClick={addTheme}><Plus className="h-4 w-4 mr-1" />Save theme</Button>
            </div>
          </div>
          <Button variant="ghost" onClick={() => setDraft({})}><RotateCcw className="h-4 w-4 mr-2" />Reset to Default</Button>
          <Accordion type="multiple" defaultValue={["School branding"]}>
            {COLOUR_GROUPS.map(group => <AccordionItem key={group.title} value={group.title}>
              <AccordionTrigger>{group.title}</AccordionTrigger>
              <AccordionContent><div className="space-y-3">{group.fields.map(([role, label]) => <div key={role} className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={`colour-${role}`} className="text-sm">{label}</Label>
                <div className="flex gap-2 items-center">
                  <Input id={`colour-${role}`} aria-label={`${label} colour`} type="color" value={draft[role] ?? defaults[role]} onChange={e => change(role, e.target.value)} className="h-9 w-11 p-1 cursor-pointer" />
                  <Input key={draft[role] ?? defaults[role]} aria-label={`${label} HEX`} defaultValue={draft[role] ?? defaults[role]} onBlur={e => { if (!/^#[0-9a-f]{6}$/i.test(e.target.value)) { e.target.value = draft[role] ?? defaults[role]; return; } change(role, e.target.value); }} maxLength={7} className="h-9 w-24 font-mono text-xs" />
                </div>
              </div>)}</div></AccordionContent>
            </AccordionItem>)}
          </Accordion>
        </fieldset>
        {preview?.template && <p className="text-sm text-muted-foreground">Uploaded template: {preview.template.name}. Editable values use your colours; printed artwork and scanned backgrounds remain unchanged.</p>}
        {warnings.length > 0 && <div role="alert" className="border border-destructive rounded-md p-3 text-sm text-destructive space-y-1">{warnings.map(w => <p key={w}>{w}</p>)}</div>}
        <div className="flex gap-2 border-t pt-4">
          <Button disabled={!dirty || saving || warnings.length > 0 || !(isAdmin || isSuperAdmin)} onClick={save}>{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save Changes</Button>
          <Button variant="outline" disabled={saving || !dirty} onClick={() => setDraft(saved)}>Cancel</Button>
        </div>
      </div>
      <div className="min-w-0 xl:sticky xl:top-4">
        <h2 className="font-semibold mb-3">Live report card preview</h2>
        {preview && "empty" in preview && preview.empty && <p className="text-sm text-muted-foreground mb-3">No saved {level === "primary" ? "Primary" : "Nursery"} learner and term are available. Empty report shown.</p>}
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <Select value={termId} onValueChange={setTermId}><SelectTrigger aria-label="Term"><SelectValue placeholder="Term" /></SelectTrigger>
            <SelectContent>{terms.map(t => <SelectItem key={t.id} value={t.id}>{t.name} {t.year}</SelectItem>)}</SelectContent></Select>
          <Select value={classId} onValueChange={pickClass}><SelectTrigger aria-label="Class"><SelectValue placeholder="Class" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All classes</SelectItem>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
          <Select value={learnerId} onValueChange={setLearnerId} disabled={!visibleLearners.length}><SelectTrigger aria-label="Learner"><SelectValue placeholder="No learners" /></SelectTrigger>
            <SelectContent>{visibleLearners.map(x => <SelectItem key={x.id} value={x.id}>{x.full_name}</SelectItem>)}</SelectContent></Select>
        </div>
        {!preview && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading report…</p>}
        {preview && <PrimaryPdfViewer learnerIds={["appearance-preview"]} termId={`appearance-${termId}-${learnerId}`} generate={generate} filename={`${level}-report-preview`} toolbar={<span />} />}
      </div>
    </div>}
  </div>;
}