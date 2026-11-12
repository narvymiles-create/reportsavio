import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { validateFieldValue, type ReportField, type ReportValue } from "@/lib/reportCustomFields";

type Level = "primary" | "nursery";
type Scope = "school" | "learner";

/** Active custom field definitions of one scope plus their general (not term/year-specific) saved values. */
export function useCustomFields(schoolId: string | null | undefined, level: Level, scope: Scope) {
  const [fields, setFields] = useState<ReportField[]>([]);
  const [values, setValues] = useState<ReportValue[]>([]);
  const reload = async () => {
    if (!schoolId) return;
    const [f, v] = await Promise.all([
      supabase.from("report_field_definitions").select("*").eq("school_id", schoolId).eq("level", level).eq("scope", scope).eq("archived", false).order("created_at"),
      supabase.from("report_field_values").select("*").eq("school_id", schoolId).eq("level", level).is("term_id", null).is("academic_year", null),
    ]);
    setFields(f.data ?? []);
    const ids = new Set((f.data ?? []).map(x => x.id));
    setValues((v.data ?? []).filter(x => ids.has(x.definition_id)));
  };
  useEffect(() => { reload(); }, [schoolId, level, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  return { fields, values, reload };
}

export const valuesFor = (fields: ReportField[], values: ReportValue[], learnerId: string | null) =>
  Object.fromEntries(fields.map(f => [f.id, values.find(v => v.definition_id === f.id && v.learner_id === learnerId)?.value ?? ""]));

/** Save changed values only; other saved values (and term/year-specific ones) are left untouched. */
export async function saveCustomValues(schoolId: string, level: Level, fields: ReportField[], existing: ReportValue[], draft: Record<string, string>, learnerId: string | null) {
  for (const f of fields) {
    const value = (draft[f.id] ?? "").trim();
    validateFieldValue(f.field_type, value);
    const row = existing.find(v => v.definition_id === f.id && v.learner_id === learnerId);
    if ((row?.value ?? "") === value) continue;
    const result = row
      ? await supabase.from("report_field_values").update({ value }).eq("id", row.id)
      : await supabase.from("report_field_values").insert({ school_id: schoolId, level, definition_id: f.id, learner_id: learnerId, term_id: null, academic_year: null, value });
    if (result.error) throw new Error(`${f.label}: ${result.error.message}`);
  }
}

export function CustomFieldInputs({ fields, draft, onChange, idPrefix }: { fields: ReportField[]; draft: Record<string, string>; onChange: (id: string, value: string) => void; idPrefix: string }) {
  if (!fields.length) return null;
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    {fields.map(f => {
      const id = `${idPrefix}-${f.id}`;
      const common = { id, value: draft[f.id] ?? "", onChange: (e: { target: { value: string } }) => onChange(f.id, e.target.value) };
      return <div key={f.id} className={`space-y-1.5 ${f.field_type === "multiline" ? "md:col-span-2" : ""}`}>
        <Label htmlFor={id}>{f.label}{f.field_type === "percentage" ? " (%)" : ""}</Label>
        {f.field_type === "multiline" ? <Textarea {...common} rows={3} maxLength={5000} />
          : <Input {...common} type={f.field_type === "date" ? "date" : f.field_type === "text" ? "text" : "number"} step="any" min={f.field_type === "percentage" ? 0 : undefined} max={f.field_type === "percentage" ? 100 : undefined} maxLength={5000} />}
      </div>;
    })}
  </div>;
}

/** School-wide custom fields of one level, editable on the School Information page. */
export function SchoolCustomFieldsSection({ schoolId, level, onSave }: { schoolId: string; level: Level; onSave: (run: () => Promise<void>) => void }) {
  const custom = useCustomFields(schoolId, level, "school");
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => { setDraft(valuesFor(custom.fields, custom.values, null)); }, [custom.fields, custom.values]);
  if (!custom.fields.length) return null;
  return <div className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
    <p className="text-sm font-semibold">{level === "primary" ? "Primary" : "Nursery"} report fields</p>
    <CustomFieldInputs idPrefix={`school-${level}`} fields={custom.fields} draft={draft} onChange={(id, v) => setDraft(d => ({ ...d, [id]: v }))} />
    <button type="button" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      onClick={() => onSave(async () => { await saveCustomValues(schoolId, level, custom.fields, custom.values, draft, null); await custom.reload(); })}>
      Save {level} fields
    </button>
  </div>;
}
