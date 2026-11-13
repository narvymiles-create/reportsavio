import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import {
  PRIMARY_ASSESSMENT_KEY, DEFAULT_ASSESSMENT_CONFIG, normaliseConfig, validateConfig, slugAssessmentId, isLegacy,
  type AssessmentConfig, type Assessment,
} from "@/lib/assessmentConfig";

export function AssessmentSettings({ schoolId }: { schoolId: string }) {
  const [cfg, setCfg] = useState<AssessmentConfig>(DEFAULT_ASSESSMENT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("system_settings").select("value").eq("school_id", schoolId).eq("key", PRIMARY_ASSESSMENT_KEY).maybeSingle()
      .then(({ data }) => { setCfg(normaliseConfig(data?.value)); setLoading(false); });
  }, [schoolId]);

  const errors = validateConfig(cfg);
  const setA = (i: number, p: Partial<Assessment>) => setCfg(c => ({ ...c, assessments: c.assessments.map((a, j) => j === i ? { ...a, ...p } : a) }));
  const move = (i: number, d: number) => setCfg(c => { const l = [...c.assessments]; const j = i + d; if (j < 0 || j >= l.length) return c; [l[i], l[j]] = [l[j], l[i]]; return { ...c, assessments: l }; });
  const add = () => setCfg(c => ({ ...c, assessments: [...c.assessments, { id: slugAssessmentId("Assessment " + (c.assessments.length + 1), c.assessments.map(a => a.id)), name: "Assessment " + (c.assessments.length + 1), maxMarks: 100, weight: null, active: true, onReport: true }] }));
  const remove = (i: number) => setCfg(c => ({ ...c, assessments: c.assessments.filter((_, j) => j !== i) }));
  const toggleIn = (list: string[], id: string, on: boolean) => on ? [...new Set([...list, id])] : list.filter(x => x !== id);

  const save = async () => {
    if (errors.length) return;
    setSaving(true);
    const { error } = await supabase.from("system_settings").upsert({ key: PRIMARY_ASSESSMENT_KEY, value: cfg as any, school_id: schoolId }, { onConflict: "school_id,key" });
    setSaving(false);
    toast(error ? { title: "Save failed", description: error.message, variant: "destructive" } : { title: "Assessment settings saved" });
  };

  if (loading) return <Card><CardContent className="py-6"><Loader2 className="h-4 w-4 animate-spin" /></CardContent></Card>;
  const active = cfg.assessments.filter(a => a.active);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Primary Assessments</CardTitle>
        <CardDescription>Choose the assessments your school gives, what appears on the report card, and how final results are worked out. Saved marks are never deleted when an assessment is turned off.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_90px_90px_70px_70px_110px] gap-2 text-xs font-medium text-muted-foreground">
            <span>Name</span><span>Max marks</span><span>Weight %</span><span>Active</span><span>On report</span><span />
          </div>
          {cfg.assessments.map((a, i) => (
            <div key={a.id} className="grid grid-cols-[1fr_90px_90px_70px_70px_110px] items-center gap-2">
              <Input value={a.name} onChange={e => setA(i, { name: e.target.value })} aria-label="Assessment name" />
              <Input type="number" min={1} value={a.maxMarks} onChange={e => setA(i, { maxMarks: Number(e.target.value) })} aria-label="Maximum marks" />
              <Input type="number" min={0} max={100} value={a.weight ?? ""} disabled={cfg.method !== "weighted"} onChange={e => setA(i, { weight: e.target.value === "" ? null : Number(e.target.value) })} aria-label="Weight" />
              <Switch checked={a.active} onCheckedChange={v => setA(i, { active: v })} aria-label="Active" />
              <Switch checked={a.onReport} disabled={!a.active} onCheckedChange={v => setA(i, { onReport: v })} aria-label="On report" />
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
                {!isLegacy(a.id) && <Button size="icon" variant="ghost" onClick={() => remove(i)} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>}
              </div>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={add}><Plus className="h-4 w-4 mr-1" />Add assessment</Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Final results calculation</Label>
            <Select value={cfg.method} onValueChange={v => setCfg(c => ({ ...c, method: v as any }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Standard (average of Beginning, Mid and End when all present, otherwise End of Term)</SelectItem>
                <SelectItem value="eot_only">End-of-Term results only</SelectItem>
                <SelectItem value="average">Average of selected assessments</SelectItem>
                <SelectItem value="weighted">Weighted average (percentages)</SelectItem>
              </SelectContent>
            </Select>
            {(cfg.method === "average" || cfg.method === "weighted") && (
              <div className="flex flex-wrap gap-3 pt-1">
                {active.map(a => (
                  <label key={a.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={cfg.finalIds.includes(a.id)} onCheckedChange={v => setCfg(c => ({ ...c, finalIds: toggleIn(c.finalIds, a.id, !!v) }))} />{a.name}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Report-card table arrangement</Label>
            <Select value={cfg.arrangement} onValueChange={v => setCfg(c => ({ ...c, arrangement: v as any, tables: c.tables.length ? c.tables : [{ heading: "Assessment Results", assessmentIds: active.map(a => a.id) }] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="separate">Separate table for each assessment</SelectItem>
                <SelectItem value="merged">Merged assessment table</SelectItem>
                <SelectItem value="merged_final">Merged table followed by final results</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {cfg.arrangement !== "separate" && (
          <div className="space-y-3">
            {cfg.tables.map((t, ti) => (
              <div key={ti} className="rounded-md border p-3 space-y-2">
                <div className="flex gap-2">
                  <Input value={t.heading} onChange={e => setCfg(c => ({ ...c, tables: c.tables.map((x, j) => j === ti ? { ...x, heading: e.target.value } : x) }))} aria-label="Table heading" />
                  <Button size="icon" variant="ghost" onClick={() => setCfg(c => ({ ...c, tables: c.tables.filter((_, j) => j !== ti) }))} aria-label="Remove table"><Trash2 className="h-4 w-4" /></Button>
                </div>
                <div className="flex flex-wrap gap-3">
                  {active.filter(a => a.onReport).map(a => (
                    <label key={a.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={t.assessmentIds.includes(a.id)} onCheckedChange={v => setCfg(c => ({ ...c, tables: c.tables.map((x, j) => j === ti ? { ...x, assessmentIds: toggleIn(x.assessmentIds, a.id, !!v) } : x) }))} />{a.name}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setCfg(c => ({ ...c, tables: [...c.tables, { heading: "Assessment Results", assessmentIds: [] }] }))}><Plus className="h-4 w-4 mr-1" />Add table</Button>
            {cfg.arrangement === "merged_final" && (
              <div className="space-y-1"><Label>Final results table heading</Label><Input value={cfg.finalHeading} onChange={e => setCfg(c => ({ ...c, finalHeading: e.target.value }))} /></div>
            )}
          </div>
        )}

        {errors.length > 0 && <ul className="text-sm text-destructive list-disc pl-5">{errors.map(e => <li key={e}>{e}</li>)}</ul>}
        <Button onClick={save} disabled={saving || errors.length > 0}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save assessment settings</Button>
      </CardContent>
    </Card>
  );
}
