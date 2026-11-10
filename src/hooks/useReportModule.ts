import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { templateErrorMessage } from "@/lib/templateErrors";

export type ReportModule = "primary" | "nursery";
const KEY = "report_module";

type Selection = { module: ReportModule; loading: boolean };
const cache = new Map<string, Selection>();
const listeners = new Map<string, Set<(selection: Selection) => void>>();
const pending = new Map<string, Promise<void>>();
const versions = new Map<string, number>();
function publish(schoolId: string, selection: Selection) {
  cache.set(schoolId, selection);
  listeners.get(schoolId)?.forEach(listener => listener(selection));
}

async function fetchModule(schoolId: string): Promise<ReportModule> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", KEY)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) throw error;
  return data?.value === "nursery" ? "nursery" : "primary";
}

/** Uploads must wait for the sidebar write, then verify the server's active level. */
export async function ensureReportModuleSaved(schoolId: string, level: ReportModule) {
  await pending.get(schoolId);
  if (await fetchModule(schoolId) !== level) throw new Error("The saved sidebar level differs from this upload. Select Primary or Nursery in the sidebar again, then retry.");
}

export function useReportModule() {
  const { schoolId } = useAuth();
  const [selection, setSelection] = useState<Selection>({ module: "primary", loading: true });

  useEffect(() => {
    if (!schoolId) { setSelection({ module: "primary", loading: false }); return; }
    const subscribers = listeners.get(schoolId) ?? new Set();
    listeners.set(schoolId, subscribers);
    subscribers.add(setSelection);
    setSelection(cache.get(schoolId) ?? { module: "primary", loading: true });
    let alive = true;
    const version = versions.get(schoolId) ?? 0;
    if (!cache.has(schoolId)) fetchModule(schoolId).then(module => {
      if (alive && version === (versions.get(schoolId) ?? 0)) publish(schoolId, { module, loading: false });
    }).catch(error => {
      if (!alive || version !== (versions.get(schoolId) ?? 0)) return;
      setSelection({ module: "primary", loading: false });
      toast({ title: "Could not load education level", description: templateErrorMessage(error), variant: "destructive" });
    });
    return () => {
      alive = false;
      subscribers.delete(setSelection);
    };
  }, [schoolId]);

  const setModule = useCallback(async (m: ReportModule) => {
    if (!schoolId) return;
    const previous = cache.get(schoolId)?.module ?? "primary";
    const version = (versions.get(schoolId) ?? 0) + 1;
    versions.set(schoolId, version);
    publish(schoolId, { module: m, loading: true });
    // Serialize rapid switches so an older write cannot finish after a newer one.
    const write = (pending.get(schoolId) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const { error } = await supabase.from("system_settings").upsert({ key: KEY, value: m, school_id: schoolId }, { onConflict: "school_id,key" });
      if (error) throw error;
    });
    pending.set(schoolId, write);
    try {
      await write;
      if (versions.get(schoolId) === version) publish(schoolId, { module: m, loading: false });
    } catch (error) {
      if (versions.get(schoolId) === version) {
        const saved = await fetchModule(schoolId).catch(() => previous);
        publish(schoolId, { module: saved, loading: false });
        toast({ title: "Education level was not saved", description: templateErrorMessage(error), variant: "destructive" });
      }
    } finally {
      if (pending.get(schoolId) === write) pending.delete(schoolId);
    }
  }, [schoolId]);

  const current = schoolId ? cache.get(schoolId) ?? selection : { module: "primary" as const, loading: false };
  return { ...current, setModule };
}
