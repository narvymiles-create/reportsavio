import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { toast } from "@/hooks/use-toast";
import { sectionMapOf, templateFieldNames } from "@/lib/pdf/customReport";
import { templateTextLines } from "@/lib/templateHeadings";
import { COLUMN_LABELS, looksLikeTableHeading, recogniseHeading, sectionLabel, summariseRecognition, tableSections, type ColumnId, type Level, type SectionMap, type StaticTable } from "@/lib/templateSections";
import type { SchoolTemplate } from "@/lib/reportTemplates";

function SectionSelect({ label, value, level, onChange, allowNone = false, disabled }: { label: string; value: string; level: Level; onChange: (v: string) => void; allowNone?: boolean; disabled?: boolean }) {
  return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={label} className="w-72 max-w-full"><SelectValue placeholder="Choose the report section" /></SelectTrigger><SelectContent>
    {allowNone && <SelectItem value="none">Not a report section</SelectItem>}
    {tableSections(level).map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
  </SelectContent></Select>;
}

/** Recognition summary plus the only corrections an administrator may need: uncertain tables and one-time table positions. */
export function TemplateSectionsPanel({ template, canManage, onChanged }: { template: SchoolTemplate; canManage: boolean; onChanged?: (t: SchoolTemplate) => void }) {
  const level = (template.level === "nursery" ? "nursery" : "primary") as Level;
  const [map, setMap] = useState<SectionMap>(() => sectionMapOf(template));
  const [lines, setLines] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Omit<StaticTable, "id">>({ section: tableSections(level)[0].id, page: 1, x: 40, y: 200, width: 500, height: 160, rows: 8, columns: ["subject", "marks", "grade", "remark"] });
  useEffect(() => { setMap(sectionMapOf(template)); }, [template.id]);
  useEffect(() => { let alive = true; templateTextLines(template).then(l => { if (alive) setLines(l); }).catch(() => { if (alive) setLines([]); }); return () => { alive = false; }; }, [template.id]);
  const names = templateFieldNames(template);
  const headings = useMemo(() => (lines ?? []).filter(l => recogniseHeading(l, level) || looksLikeTableHeading(l)), [lines, level]);
  const summary = summariseRecognition(level, names, map, headings);
  const uncertain = headings.filter(h => !recogniseHeading(h, level));
  const save = async (next: SectionMap) => {
    if (!canManage) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from("report_templates").update({ section_map: next as never }).eq("id", template.id).eq("school_id", template.school_id).select("*").single();
      if (error) throw error;
      setMap(next); onChanged?.(data as SchoolTemplate); toast({ title: "Report sections saved" });
    } catch (e) { toast({ title: "Could not save", description: e instanceof Error ? e.message : String(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const columns = tableSections(level).find(s => s.id === draft.section)?.columns ?? [];
  return <div className="space-y-5">
    <section className="space-y-2"><h3 className="text-sm font-semibold">Recognised report sections</h3>
      {summary.sections.length ? <ul className="flex flex-wrap gap-2" aria-label="Recognised report sections">{summary.sections.map(s => <li key={s.id} className="rounded border px-2 py-1 text-xs">{s.label}{s.fields ? ` · ${s.fields} place${s.fields === 1 ? "" : "s"} filled automatically` : " · heading found, position its table below"}</li>)}</ul>
        : <p className="text-sm text-muted-foreground">{lines == null ? <Loader2 className="inline h-4 w-4 animate-spin" /> : "No report sections were recognised yet. For a scanned design, position each table once below."}</p>}
    </section>
    {(summary.unassigned.length > 0 || uncertain.length > 0) && <section className="space-y-3"><h3 className="text-sm font-semibold">Please confirm these tables</h3>
      {summary.unassigned.map(g => <div key={g.group} className="flex flex-wrap items-center gap-3"><span className="text-sm">A table with {g.fields.length} cells{g.group !== "table" ? ` (“${g.group}”)` : ""}</span><SectionSelect label={`Section for ${g.group}`} level={level} value={map.groups?.[g.group] ?? ""} disabled={!canManage || busy} onChange={v => save({ ...map, groups: { ...map.groups, [g.group]: v } })} /></div>)}
      {uncertain.map(h => <div key={h} className="flex flex-wrap items-center gap-3"><span className="text-sm">Heading “{h}”</span><SectionSelect label={`Section for ${h}`} level={level} allowNone value={map.headings?.[h] ?? ""} disabled={!canManage || busy} onChange={v => save({ ...map, headings: { ...map.headings, [h]: v } })} /></div>)}
    </section>}
    {summary.unrecognised.length > 0 && <section className="space-y-1"><h3 className="text-sm font-semibold">Labels not recognised</h3><p className="text-sm text-muted-foreground">These stay blank. To fill one, add a custom field with exactly the same label under Fields.</p><ul className="flex flex-wrap gap-2">{summary.unrecognised.map(n => <li key={n} className="rounded border border-dashed px-2 py-1 text-xs">{n}</li>)}</ul></section>}
    <section className="space-y-3"><h3 className="text-sm font-semibold">Table positions (scanned or fixed designs)</h3>
      <p className="text-sm text-muted-foreground">Only needed when a table has no fillable boxes. Give the table's area once, in points from the top-left of the page; rows fill with the school's own subjects or learning areas.</p>
      {(map.tables ?? []).map(t => <div key={t.id} className="flex flex-wrap items-center gap-2 text-sm"><span>{sectionLabel(level, t.section)} · page {t.page} · {t.rows} rows · {t.columns.map(c => COLUMN_LABELS[c]).join(", ")}</span>{canManage && <Button size="icon" variant="ghost" aria-label="Remove table position" disabled={busy} onClick={() => save({ ...map, tables: (map.tables ?? []).filter(x => x.id !== t.id) })}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</div>)}
      {canManage && <form className="space-y-3 rounded border p-3" onSubmit={e => { e.preventDefault(); if (!draft.columns.length) return; save({ ...map, tables: [...(map.tables ?? []), { ...draft, id: crypto.randomUUID() }] }); }}>
        <SectionSelect label="Table section" level={level} value={draft.section} onChange={v => setDraft(d => ({ ...d, section: v, columns: (tableSections(level).find(s => s.id === v)?.columns ?? []).filter(c => d.columns.includes(c)) }))} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">{(["page", "x", "y", "width", "height", "rows"] as const).map(k => <div key={k} className="space-y-1"><Label htmlFor={`tbl-${k}`}>{({ page: "Page", x: "Left", y: "Top", width: "Width", height: "Height", rows: "Rows" })[k]}</Label><Input id={`tbl-${k}`} type="number" min={k === "x" || k === "y" ? 0 : 1} max={k === "page" ? template.page_count : undefined} value={draft[k]} onChange={e => setDraft(d => ({ ...d, [k]: Number(e.target.value) }))} required /></div>)}</div>
        <div className="flex flex-wrap gap-4">{columns.map(c => <label key={c} className="flex items-center gap-2 text-sm"><Checkbox checked={draft.columns.includes(c)} onCheckedChange={v => setDraft(d => ({ ...d, columns: v === true ? [...d.columns, c] : d.columns.filter(x => x !== c) }))} />{COLUMN_LABELS[c]}</label>)}</div>
        <p className="text-xs text-muted-foreground">Tick the columns in the order they appear from left to right.</p>
        <Button type="submit" size="sm" disabled={busy || !draft.columns.length}><Plus className="mr-2 h-4 w-4" />Add table position</Button>
      </form>}
    </section>
  </div>;
}
