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
    // Resolve current user's school via school_members (RLS-safe)
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return;
    const { data: mem } = await supabase
      .from("school_members" as any)
      .select("school_id")
      .eq("user_id", userId)
      .maybeSingle();
    const schoolId = (mem as any)?.school_id as string | undefined;
    if (!schoolId) return;
    await supabase
      .from("system_settings" as any)
      .upsert(
        { key: KEY, value: m as any, school_id: schoolId } as any,
        { onConflict: "school_id,key" }
      );
  }, []);

  return { module, setModule, loading };
}
