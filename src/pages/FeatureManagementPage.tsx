import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, ToggleRight } from "lucide-react";
import { resolveFeature } from "@/lib/features";

type Feature = { key: string; label: string; description: string; category: string; sort_order: number; enabled: boolean };
type School = { id: string; name: string };
type Choice = "default" | "on" | "off";

const notifyChanged = () => window.dispatchEvent(new Event("skavio:features-changed"));

/** System Admin: turn features on or off for every school, or for one school (school settings win). Never deletes data. */
export default function FeatureManagementPage() {
  const { isSuperAdmin } = useAuth();
  const [features, setFeatures] = useState<Feature[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState<string>("");
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [f, s] = await Promise.all([
      supabase.from("platform_features").select("key,label,description,category,sort_order,enabled").order("sort_order"),
      supabase.from("schools").select("id,name").order("name"),
    ]);
    setFeatures((f.data as Feature[]) ?? []);
    setSchools((s.data as School[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { if (isSuperAdmin) void load(); }, [isSuperAdmin, load]);

  useEffect(() => {
    if (!schoolId) { setOverrides({}); return; }
    supabase.from("school_feature_overrides").select("feature_key,enabled").eq("school_id", schoolId)
      .then(({ data }) => setOverrides(Object.fromEntries((data ?? []).map((r) => [r.feature_key, r.enabled]))));
  }, [schoolId]);

  const groups = useMemo(() => {
    const m = new Map<string, Feature[]>();
    features.forEach((f) => m.set(f.category, [...(m.get(f.category) ?? []), f]));
    return Array.from(m.entries());
  }, [features]);

  if (!isSuperAdmin) return <Card><CardHeader><CardTitle>Feature Management</CardTitle><CardDescription>Only Skavio platform administrators can open this page.</CardDescription></CardHeader></Card>;
  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const setGlobal = async (f: Feature, enabled: boolean) => {
    setSaving(f.key);
    const { error } = await supabase.from("platform_features").update({ enabled, updated_at: new Date().toISOString() }).eq("key", f.key);
    setSaving(null);
    if (error) return toast({ title: "Could not save", description: error.message, variant: "destructive" });
    setFeatures((all) => all.map((x) => (x.key === f.key ? { ...x, enabled } : x)));
    toast({ title: `${f.label} ${enabled ? "turned on" : "turned off"} for all schools`, description: "Schools with their own setting keep it." });
    notifyChanged();
  };

  const setSchool = async (f: Feature, choice: Choice) => {
    if (!schoolId) return;
    setSaving(f.key);
    const { error } = choice === "default"
      ? await supabase.from("school_feature_overrides").delete().eq("school_id", schoolId).eq("feature_key", f.key)
      : await supabase.from("school_feature_overrides").upsert({ school_id: schoolId, feature_key: f.key, enabled: choice === "on", updated_at: new Date().toISOString() }, { onConflict: "school_id,feature_key" });
    setSaving(null);
    if (error) return toast({ title: "Could not save", description: error.message, variant: "destructive" });
    setOverrides((o) => { const n = { ...o }; if (choice === "default") delete n[f.key]; else n[f.key] = choice === "on"; return n; });
    notifyChanged();
  };

  const schoolName = schools.find((s) => s.id === schoolId)?.name;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><ToggleRight className="h-6 w-6" />Feature Management</h1>
        <p className="text-muted-foreground">Turn features on or off for every school, or set a different choice for one school. A school's own setting always wins.</p>
      </div>
      <Alert><AlertDescription>Turning a feature off never deletes learners, marks, report cards, templates or settings. Schools can still view their information; the feature works again as soon as it is turned back on.</AlertDescription></Alert>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">School-specific settings</CardTitle>
          <CardDescription>Choose a school to see and change its own settings next to the global default.</CardDescription></CardHeader>
        <CardContent>
          <div className="w-full max-w-sm"><Label>School</Label>
            <Select value={schoolId || "__none"} onValueChange={(v) => setSchoolId(v === "__none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="All schools (global defaults)" /></SelectTrigger>
              <SelectContent><SelectItem value="__none">All schools (global defaults only)</SelectItem>{schools.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select></div>
        </CardContent>
      </Card>

      {groups.map(([category, items]) => (
        <Card key={category}>
          <CardHeader className="pb-2"><CardTitle className="text-base">{category}</CardTitle></CardHeader>
          <CardContent className="divide-y">
            {items.map((f) => {
              const override = f.key in overrides ? overrides[f.key] : null;
              const effective = resolveFeature(f.enabled, override);
              return (
                <div key={f.key} className="grid gap-3 py-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                  <div>
                    <p className="font-medium">{f.label}</p>
                    <p className="text-sm text-muted-foreground">{f.description}</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={f.enabled} disabled={saving === f.key} onCheckedChange={(v) => setGlobal(f, v)} aria-label={`${f.label} for all schools`} />
                    All schools: {f.enabled ? "On" : "Off"}
                  </label>
                  {schoolId ? (
                    <div className="flex items-center gap-2">
                      <Select value={override === null ? "default" : override ? "on" : "off"} onValueChange={(v) => setSchool(f, v as Choice)} disabled={saving === f.key}>
                        <SelectTrigger className="w-44" aria-label={`${f.label} for ${schoolName}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Use global ({f.enabled ? "On" : "Off"})</SelectItem>
                          <SelectItem value="on">On for this school</SelectItem>
                          <SelectItem value="off">Off for this school</SelectItem>
                        </SelectContent>
                      </Select>
                      <Badge variant={effective ? "default" : "secondary"}>{effective ? "On" : "Off"}</Badge>
                    </div>
                  ) : <span />}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
