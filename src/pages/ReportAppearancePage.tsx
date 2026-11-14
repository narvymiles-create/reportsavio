import { useCallback, useEffect, useState } from "react";
import { Palette, RotateCcw, Save, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useReportModule } from "@/hooks/useReportModule";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PrimaryPdfViewer } from "@/components/PrimaryPdfViewer";
import { toast } from "@/hooks/use-toast";
import { APPEARANCE_KEY, APPEARANCE_CHANGED, APPEARANCE_PRESETS, COLOUR_GROUPS, appearanceWarnings, defaultColours, parseAppearance, type AppearanceRole, type ReportAppearance } from "@/lib/reportAppearance";
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
  useEffect(() => {
    let alive = true;
    Promise.all([supabase.from("system_settings").select("value").eq("school_id", schoolId).eq("key", APPEARANCE_KEY).maybeSingle(), loadAppearancePreview(schoolId, level)])
      .then(([settings, report]) => { if (settings.error) throw settings.error; if (!alive) return; const colours = parseAppearance(settings.data?.value); setSaved(colours); setDraft(colours); setPreviewDraft(colours); setPreview(report); setReady(true); })
      .catch(e => { if (alive) setError(e.message ?? "Could not load appearance settings."); });
    return () => { alive = false; };
  }, [schoolId, level]);
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
          <div className="flex flex-wrap gap-2">{APPEARANCE_PRESETS.map(theme => <Button key={theme.name} variant="outline" onClick={() => setDraft(theme.colours)}>{theme.name}</Button>)}</div>
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
        {preview && <PrimaryPdfViewer learnerIds={["appearance-preview"]} termId="appearance-preview" generate={generate} filename={`${level}-appearance-preview`} />}
      </div>
    </div>}
  </div>;
}