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

/** Keys for the learner-info section labels rendered on the report card. */
export type LearnerInfoFieldKey =
  | "name"
  | "stream"
  | "house"
  | "section"
  | "age"
  | "sex"
  | "reg"      // INDEX/LIN/REG NO.
  | "class"
  | "pay_code";

export const DEFAULT_LEARNER_INFO_ORDER: LearnerInfoFieldKey[] = [
  "name", "stream", "house",
  "section", "age", "sex",
  "reg", "class", "pay_code",
];

export const LEARNER_INFO_LABELS: Record<LearnerInfoFieldKey, string> = {
  name: "Name",
  stream: "Stream",
  house: "House",
  section: "Section",
  age: "Age",
  sex: "Sex",
  reg: "Index / LIN / REG No.",
  class: "Class",
  pay_code: "Pay Code",
};

export function useLearnerFieldSettings() {
  const [flags, setFlags] = useState<LearnerFieldFlags>(DEFAULT_LEARNER_FIELDS);
  const [order, setOrder] = useState<LearnerInfoFieldKey[]>(DEFAULT_LEARNER_INFO_ORDER);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: f }, { data: o }] = await Promise.all([
        supabase.from("system_settings" as any).select("value").eq("key", "learner_fields").maybeSingle(),
        supabase.from("system_settings" as any).select("value").eq("key", "learner_info_order").maybeSingle(),
      ]);
      if (!active) return;
      if (f && (f as any).value) {
        setFlags({ ...DEFAULT_LEARNER_FIELDS, ...((f as any).value as Partial<LearnerFieldFlags>) });
      }
      if (o && Array.isArray((o as any).value)) {
        setOrder(normalizeOrder((o as any).value as LearnerInfoFieldKey[]));
      }
      setLoading(false);
    })();

    const ch = supabase
      .channel(`learner-field-settings-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_settings", filter: "key=eq.learner_fields" },
        (payload: any) => {
          const v = payload?.new?.value;
          if (v) setFlags({ ...DEFAULT_LEARNER_FIELDS, ...(v as Partial<LearnerFieldFlags>) });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_settings", filter: "key=eq.learner_info_order" },
        (payload: any) => {
          const v = payload?.new?.value;
          if (Array.isArray(v)) setOrder(normalizeOrder(v as LearnerInfoFieldKey[]));
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, []);

  return { flags, order, loading };
}

/** Ensures every key appears exactly once and unknown keys are dropped. */
export function normalizeOrder(input: LearnerInfoFieldKey[]): LearnerInfoFieldKey[] {
  const seen = new Set<LearnerInfoFieldKey>();
  const out: LearnerInfoFieldKey[] = [];
  input.forEach(k => {
    if (DEFAULT_LEARNER_INFO_ORDER.includes(k) && !seen.has(k)) {
      seen.add(k); out.push(k);
    }
  });
  DEFAULT_LEARNER_INFO_ORDER.forEach(k => { if (!seen.has(k)) out.push(k); });
  return out;
}
