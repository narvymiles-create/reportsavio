import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const NURSERY_FONT_STYLES = [
  { key: "cursive", label: "Cursive (Handwriting)", css: "'Brush Script MT', 'Comic Sans MS', cursive" },
  { key: "serif", label: "Serif (Formal)", css: "Georgia, 'Times New Roman', serif" },
  { key: "sans", label: "Sans-Serif (Clean)", css: "Arial, Helvetica, sans-serif" },
  { key: "comic", label: "Comic Sans", css: "'Comic Sans MS', 'Comic Neue', cursive" },
  { key: "monospace", label: "Monospace (Typewriter)", css: "'Courier New', Courier, monospace" },
] as const;

export type NurseryFontStyleKey = (typeof NURSERY_FONT_STYLES)[number]["key"];

const KEY = "nursery_font_style";
const DEFAULT: NurseryFontStyleKey = "cursive";

export function useNurseryFontStyle() {
  const { schoolId } = useAuth();
  const [fontStyle, setFontStyleState] = useState<NurseryFontStyleKey>(DEFAULT);
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
      if (typeof v === "string" && NURSERY_FONT_STYLES.some((f) => f.key === v)) {
        setFontStyleState(v as NurseryFontStyleKey);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const setFontStyle = useCallback(
    async (style: NurseryFontStyleKey) => {
      setFontStyleState(style);
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

  const getFontCss = useCallback(
    () => NURSERY_FONT_STYLES.find((f) => f.key === fontStyle)?.css ?? NURSERY_FONT_STYLES[0].css,
    [fontStyle]
  );

  return { fontStyle, setFontStyle, getFontCss, loading };
}
