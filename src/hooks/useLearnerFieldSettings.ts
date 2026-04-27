import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LearnerFieldFlags = {
  stream: boolean;
  house: boolean;
  section: boolean;
  pay_code: boolean;
  show_position: boolean;
};

export const DEFAULT_LEARNER_FIELDS: LearnerFieldFlags = {
  stream: true,
  house: true,
  section: true,
  pay_code: true,
  show_position: true,
};

export function useLearnerFieldSettings() {
  const [flags, setFlags] = useState<LearnerFieldFlags>(DEFAULT_LEARNER_FIELDS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("system_settings" as any)
        .select("value")
        .eq("key", "learner_fields")
        .maybeSingle();
      if (active && data && (data as any).value) {
        setFlags({ ...DEFAULT_LEARNER_FIELDS, ...((data as any).value as Partial<LearnerFieldFlags>) });
      }
      if (active) setLoading(false);
    })();

    // Realtime: pick up changes from Settings page instantly
    const ch = supabase
      .channel("learner-field-settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_settings", filter: "key=eq.learner_fields" },
        (payload: any) => {
          const v = payload?.new?.value;
          if (v) setFlags({ ...DEFAULT_LEARNER_FIELDS, ...(v as Partial<LearnerFieldFlags>) });
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, []);

  return { flags, loading };
}
