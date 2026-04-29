import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ReportModule = "primary" | "nursery";
const KEY = "report_module";

let listeners = new Set<(m: ReportModule) => void>();
let cached: ReportModule | null = null;

async function fetchModule(): Promise<ReportModule> {
  const { data } = await supabase
    .from("system_settings" as any)
    .select("value")
    .eq("key", KEY)
    .maybeSingle();
  const v = (data as any)?.value;
  const parsed = typeof v === "string" ? v : v;
  return parsed === "nursery" ? "nursery" : "primary";
}

export function useReportModule() {
  const [module, setModuleState] = useState<ReportModule>(cached ?? "primary");
  const [loading, setLoading] = useState(cached === null);

  useEffect(() => {
    let alive = true;
    if (cached === null) {
      fetchModule().then((m) => {
        cached = m;
        if (alive) {
          setModuleState(m);
          setLoading(false);
        }
      });
    }
    const cb = (m: ReportModule) => setModuleState(m);
    listeners.add(cb);
    return () => {
      alive = false;
      listeners.delete(cb);
    };
  }, []);

  const setModule = useCallback(async (m: ReportModule) => {
    cached = m;
    listeners.forEach((l) => l(m));
    // Upsert
    const { data: existing } = await supabase
      .from("system_settings" as any)
      .select("id")
      .eq("key", KEY)
      .maybeSingle();
    if ((existing as any)?.id) {
      await supabase.from("system_settings" as any).update({ value: m as any }).eq("key", KEY);
    } else {
      await supabase.from("system_settings" as any).insert({ key: KEY, value: m as any } as any);
    }
  }, []);

  return { module, setModule, loading };
}
