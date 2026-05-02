import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const BORDER_STYLES = [
  { key: "double", label: "Premium Double Frame" },
  { key: "classic", label: "Classic School Border" },
  { key: "corner", label: "Elegant Corner Border" },
  { key: "dotted", label: "Dotted Inner + Solid Outer" },
  { key: "accent", label: "Side Accent Border" },
  { key: "certificate", label: "Certificate Style Border" },
] as const;

export type BorderStyleKey = (typeof BORDER_STYLES)[number]["key"];

const KEY = "border_style";
const DEFAULT: BorderStyleKey = "double";

export function useBorderStyle() {
  const { schoolId } = useAuth();
  const [borderStyle, setBorderStyleState] = useState<BorderStyleKey>(DEFAULT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("system_settings" as any)
        .select("value")
        .eq("key", KEY)
        .maybeSingle();
      if (!alive) return;
      const v = (data as any)?.value;
      if (typeof v === "string" && BORDER_STYLES.some((b) => b.key === v)) {
        setBorderStyleState(v as BorderStyleKey);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const setBorderStyle = useCallback(
    async (style: BorderStyleKey) => {
      setBorderStyleState(style);
      if (!schoolId) return;
      await supabase
        .from("system_settings" as any)
        .upsert(
          { key: KEY, value: style as any, school_id: schoolId } as any,
          { onConflict: "school_id,key" }
        );
    },
    [schoolId]
  );

  return { borderStyle, setBorderStyle, loading };
}
