/**
 * Template mapping editor: shows the actual uploaded report card PDF and lets
 * an administrator click on it to place system or custom fields, then manages
 * custom field definitions and their values.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  SYSTEM_FIELDS, customKey, defaultBox, deleteCustomField, deleteMapping, isCustomKey,
  customIdFromKey, listCustomFields, listCustomValues, listMappings, saveCustomField,
  saveCustomValue, templateFileUrl, upsertMapping,
  type CustomField, type CustomFieldType, type FieldMapping, type ReportTemplate,
} from "@/lib/templates";

type LearnerOption = { id: string; full_name: string };
type TermOption = { id: string; name: string; year: number };

const SCALE = 1.4; // canvas px per PDF point

export default function TemplateMappingPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<ReportTemplate | null>(null);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState<string | null>(null); // field_key being placed
  const [selected, setSelected] = useState<string | null>(null); // mapping field_key

  // Custom field dialog state
  const [cfOpen, setCfOpen] = useState(false);
  const [cfEditing, setCfEditing] = useState<CustomField | null>(null);
  const [cfLabel, setCfLabel] = useState("");
  const [cfType, setCfType] = useState<CustomFieldType>("text");
  const [cfScope, setCfScope] = useState<"school" | "learner">("learner");
  const [cfDesc, setCfDesc] = useState("");

  // Values tab state
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [learners, setLearners] = useState<LearnerOption[]>([]);
  const [valueTerm, setValueTerm] = useState<string>("");
  const [valueLearner, setValueLearner] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({}); // key: fieldId|learner|term

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ key: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const valueKey = (fieldId: string, learner: string | null, term: string | null) =>
    `${fieldId}|${learner ?? ""}|${term ?? ""}`;

  /* ---------------------------------------------------------------- loading */

  const reload = useCallback(async () => {
    if (!templateId) return;
    const [{ data: tpl }, maps, cfs] = await Promise.all([
      supabase.from("report_templates" as any).select("*").eq("id", templateId).maybeSingle(),
      listMappings(templateId),
      listCustomFields(templateId),
    ]);
    if (!tpl) throw new Error("Template not found");
    setTemplate(tpl as any);
    setMappings(maps);
    setCustomFields(cfs);

    const url = await templateFileUrl(tpl as any);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not download the template file (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const [pdfjs, worker] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
    setPdfDoc(doc);
    setPageCount(doc.numPages);

    const { data: termRows } = await supabase.from("terms").select("id,name,year").order("year", { ascending: false });
    setTerms((termRows as any) ?? []);
    const learnerTable = (tpl as any).level === "nursery" ? "nursery_learners" : "learners";
    const { data: learnerRows } = await supabase.from(learnerTable as any).select("id,full_name").order("full_name");
    setLearners((learnerRows as any) ?? []);

    const rows = await listCustomValues(cfs.map((f) => f.id));
    const map: Record<string, string> = {};
    rows.forEach((r) => { map[valueKey(r.field_id, r.learner_id, r.term_id)] = r.value; });
    setValues(map);
  }, [templateId]);

  useEffect(() => {
    reload().catch((e) => {
      console.error("[template mapping] load failed", e);
      toast({ title: "Could not open template", description: e.message, variant: "destructive" });
    }).finally(() => setLoading(false));
  }, [reload]);

  /* ---------------------------------------------------------- canvas render */

  useEffect(() => {
    if (!pdfDoc || loading) return;
    let cancelled = false;
    (async () => {
      const pdfPage = await pdfDoc.getPage(page);
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const viewport = pdfPage.getViewport({ scale: SCALE });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await pdfPage.render({ canvasContext: ctx, viewport }).promise;
    })().catch((err) => {
      console.error("[template preview] render failed", err);
      toast({ title: "Could not display the template page", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    });
    return () => { cancelled = true; };
  }, [pdfDoc, page, loading]);

  /* ------------------------------------------------------------- placement */

  const fieldLabel = (key: string) => {
    if (isCustomKey(key)) {
      return customFields.find((f) => f.id === customIdFromKey(key))?.label ?? "Custom field";
    }
    return SYSTEM_FIELDS[template?.level ?? "primary"].find((f) => f.key === key)?.label ?? key;
  };

  const fieldKind = (key: string): "text" | "image" | "multiline" => {
    if (isCustomKey(key)) {
      const t = customFields.find((f) => f.id === customIdFromKey(key))?.field_type;
      return t === "multiline" ? "multiline" : "text";
    }
    return SYSTEM_FIELDS[template?.level ?? "primary"].find((f) => f.key === key)?.kind ?? "text";
  };

  const onCanvasClick = async (e: React.MouseEvent) => {
    if (!placing || !template || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const box = defaultBox(fieldKind(placing));
    // Canvas top-left origin → PDF bottom-left origin, centred on the click.
    const x = Math.max(0, px / SCALE - box.width / 2);
    const y = Math.max(0, template.page_height - py / SCALE - box.height / 2);
    const mapping = {
      template_id: template.id, field_key: placing, page,
      x: Math.round(x), y: Math.round(y),
      width: box.width, height: box.height,
      font_size: 8, align: "left" as const,
    };
    try {
      await upsertMapping(mapping);
      setMappings((prev) => [...prev.filter((m) => !(m.field_key === placing && m.page === page)),
        { ...mapping, id: crypto.randomUUID() }]);
      toast({ title: `${fieldLabel(placing)} placed`, description: "Drag the box to fine-tune its position." });
    } catch (err: any) {
      toast({ title: "Could not save mapping", description: err.message, variant: "destructive" });
    }
    setPlacing(null);
  };

  /* ---------------------------------------------------------------- dragging */

  const onOverlayPointerDown = (e: React.PointerEvent, m: FieldMapping) => {
    e.stopPropagation();
    setSelected(m.field_key);
    dragRef.current = { key: m.field_key, startX: e.clientX, startY: e.clientY, origX: m.x, origY: m.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onOverlayPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !template) return;
    const dx = (e.clientX - drag.startX) / SCALE;
    const dy = (e.clientY - drag.startY) / SCALE;
    setMappings((prev) => prev.map((m) => m.field_key === drag.key
      ? { ...m, x: Math.round(drag.origX + dx), y: Math.round(drag.origY - dy) }
      : m));
  };

  const onOverlayPointerUp = async () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || !template) return;
    const m = mappings.find((x) => x.field_key === drag.key);
    if (!m) return;
    try {
      await upsertMapping({ ...m, template_id: template.id });
    } catch (err: any) {
      toast({ title: "Could not save position", description: err.message, variant: "destructive" });
    }
  };

  const updateSelected = async (patch: Partial<FieldMapping>) => {
    if (!selected || !template) return;
    const m = mappings.find((x) => x.field_key === selected);
    if (!m) return;
    const next = { ...m, ...patch };
    setMappings((prev) => prev.map((x) => (x.field_key === selected ? next : x)));
    await upsertMapping({ ...next, template_id: template.id }).catch((err: any) =>
      toast({ title: "Could not save mapping", description: err.message, variant: "destructive" }));
  };

  const removeMapping = async (key: string) => {
    if (!template) return;
    const m = mappings.find((x) => x.field_key === key);
    if (!m) return;
    await deleteMapping(template.id, key, m.page).catch(() => {});
    setMappings((prev) => prev.filter((x) => x.field_key !== key));
    if (selected === key) setSelected(null);
  };

  /* ------------------------------------------------------------ custom fields */

  const openCfDialog = (field?: CustomField) => {
    setCfEditing(field ?? null);
    setCfLabel(field?.label ?? "");
    setCfType(field?.field_type ?? "text");
    setCfScope(field?.scope ?? "learner");
    setCfDesc(field?.description ?? "");
    setCfOpen(true);
  };

  const saveCf = async () => {
    if (!template || !cfLabel.trim()) return;
    try {
      await saveCustomField({
        id: cfEditing?.id,
        template_id: template.id,
        label: cfLabel.trim(),
        field_type: cfType,
        scope: cfScope,
        description: cfDesc.trim() || null,
        sort_order: cfEditing?.sort_order ?? customFields.length,
      });
      toast({ title: cfEditing ? "Custom field updated" : "Custom field added" });
      setCfOpen(false);
      const cfs = await listCustomFields(template.id);
      setCustomFields(cfs);
    } catch (err: any) {
      toast({ title: "Could not save custom field", description: err.message, variant: "destructive" });
    }
  };

  const removeCf = async (field: CustomField) => {
    try {
      await deleteCustomField(field);
      setCustomFields((prev) => prev.filter((f) => f.id !== field.id));
      setMappings((prev) => prev.filter((m) => m.field_key !== customKey(field.id)));
      toast({ title: "Custom field removed" });
    } catch (err: any) {
      toast({ title: "Could not remove field", description: err.message, variant: "destructive" });
    }
  };

  /* ------------------------------------------------------------------ values */

  const saveValue = async (field: CustomField, learnerId: string | null, termId: string | null, value: string) => {
    const key = valueKey(field.id, learnerId, termId);
    setValues((prev) => ({ ...prev, [key]: value }));
    try {
      await saveCustomValue(field.id, value, learnerId, termId);
      toast({ title: "Value saved" });
    } catch (err: any) {
      toast({ title: "Could not save value", description: err.message, variant: "destructive" });
    }
  };

  /* ------------------------------------------------------------------- render */

  const pageMappings = useMemo(() => mappings.filter((m) => m.page === page), [mappings, page]);
  const selectedMapping = mappings.find((m) => m.field_key === selected);
  const mappedKeys = new Set(mappings.map((m) => m.field_key));

  if (loading) {
    return <div className="flex justify-center p-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!template) {
    return <div className="p-8 text-center text-muted-foreground">Template not found.</div>;
  }

  const systemFields = SYSTEM_FIELDS[template.level];

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => navigate("/templates")}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Templates
        </Button>
        <div>
          <h1 className="text-lg font-semibold">{template.name}</h1>
          <p className="text-sm text-muted-foreground">
            {template.level === "nursery" ? "Nursery" : "Primary"} template ·
            {template.is_active ? " active" : " inactive"} · click a field, then click on the report card to place it.
          </p>
        </div>
        {pageCount > 1 && (
          <div className="ml-auto flex items-center gap-2">
            <Label>Page</Label>
            <Select value={String(page)} onValueChange={(v) => setPage(Number(v))}>
              <SelectTrigger className="w-24" aria-label="Template page"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: pageCount }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ------------------------------------------------------ preview */}
        <div className="overflow-auto rounded-md border bg-muted/30 p-3">
          <div
            ref={overlayRef}
            className="relative mx-auto"
            style={{
              width: template.page_width * SCALE,
              height: template.page_height * SCALE,
              cursor: placing ? "crosshair" : "default",
            }}
            onClick={onCanvasClick}
            onPointerMove={onOverlayPointerMove}
            onPointerUp={onOverlayPointerUp}
          >
            <canvas ref={canvasRef} className="absolute inset-0" />
            {pageMappings.map((m) => (
              <div
                key={m.field_key}
                role="button"
                aria-label={`Mapped field ${fieldLabel(m.field_key)}`}
                onPointerDown={(e) => onOverlayPointerDown(e, m)}
                onClick={(e) => e.stopPropagation()}
                className={`absolute flex items-start justify-center border text-[10px] leading-tight select-none touch-none ${
                  selected === m.field_key ? "border-primary bg-primary/20" : "border-primary/60 bg-primary/10"
                }`}
                style={{
                  left: m.x * SCALE,
                  top: (template.page_height - m.y - m.height) * SCALE,
                  width: m.width * SCALE,
                  height: m.height * SCALE,
                }}
              >
                <span className="truncate px-0.5">{fieldLabel(m.field_key)}</span>
              </div>
            ))}
          </div>
          {placing && (
            <p className="mt-2 text-sm text-primary">
              Click on the report card to place “{fieldLabel(placing)}”.{" "}
              <Button variant="link" size="sm" onClick={() => setPlacing(null)}>Cancel</Button>
            </p>
          )}
        </div>

        {/* -------------------------------------------------------- panel */}
        <div>
          <Tabs defaultValue="fields">
            <TabsList className="w-full">
              <TabsTrigger value="fields" className="flex-1">Fields</TabsTrigger>
              <TabsTrigger value="custom" className="flex-1">Custom Fields</TabsTrigger>
              <TabsTrigger value="values" className="flex-1">Values</TabsTrigger>
            </TabsList>

            <TabsContent value="fields" className="space-y-2 mt-3">
              {selectedMapping && (
                <div className="rounded-md border p-3 space-y-2 mb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{fieldLabel(selectedMapping.field_key)}</span>
                    <Button size="sm" variant="destructive" onClick={() => removeMapping(selectedMapping.field_key)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Width (pt)</Label>
                      <Input type="number" value={selectedMapping.width}
                        onChange={(e) => updateSelected({ width: Number(e.target.value) || selectedMapping.width })} />
                    </div>
                    <div>
                      <Label className="text-xs">Height (pt)</Label>
                      <Input type="number" value={selectedMapping.height}
                        onChange={(e) => updateSelected({ height: Number(e.target.value) || selectedMapping.height })} />
                    </div>
                    <div>
                      <Label className="text-xs">Font size</Label>
                      <Input type="number" step="0.5" value={selectedMapping.font_size}
                        onChange={(e) => updateSelected({ font_size: Number(e.target.value) || selectedMapping.font_size })} />
                    </div>
                    <div>
                      <Label className="text-xs">Align</Label>
                      <Select value={selectedMapping.align}
                        onValueChange={(v) => updateSelected({ align: v as FieldMapping["align"] })}>
                        <SelectTrigger aria-label="Alignment"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">Left</SelectItem>
                          <SelectItem value="center">Center</SelectItem>
                          <SelectItem value="right">Right</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                System fields available on this template. Mapped fields show a check.
              </p>
              <div className="max-h-[520px] overflow-auto space-y-1">
                {systemFields.map((f) => {
                  const mapped = mappedKeys.has(f.key);
                  return (
                    <div key={f.key} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5">
                      <span className="text-sm flex items-center gap-2">
                        {f.label}
                        {mapped && <Badge variant="secondary" className="text-[10px]">Mapped</Badge>}
                      </span>
                      <div className="flex gap-1">
                        <Button size="sm" variant={placing === f.key ? "default" : "outline"}
                          onClick={() => setPlacing(placing === f.key ? null : f.key)}>
                          {mapped ? "Move" : "Place"}
                        </Button>
                        {mapped && (
                          <Button size="sm" variant="ghost" onClick={() => removeMapping(f.key)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="custom" className="space-y-2 mt-3">
              <Button size="sm" onClick={() => openCfDialog()}>
                <Plus className="mr-1 h-4 w-4" /> Add Custom Field
              </Button>
              <div className="space-y-1">
                {customFields.map((f) => {
                  const key = customKey(f.id);
                  const mapped = mappedKeys.has(key);
                  return (
                    <div key={f.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5">
                      <div className="text-sm">
                        <div className="flex items-center gap-2">
                          {f.label}
                          <Badge variant="outline" className="text-[10px]">{f.field_type}</Badge>
                          <Badge variant="outline" className="text-[10px]">{f.scope === "school" ? "School-wide" : "Per learner"}</Badge>
                          {mapped && <Badge variant="secondary" className="text-[10px]">Mapped</Badge>}
                        </div>
                        {f.description && <div className="text-xs text-muted-foreground">{f.description}</div>}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant={placing === key ? "default" : "outline"}
                          onClick={() => setPlacing(placing === key ? null : key)}>
                          {mapped ? "Move" : "Place"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openCfDialog(f)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => removeCf(f)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {!customFields.length && (
                  <p className="text-sm text-muted-foreground">
                    No custom fields yet. Add fields like Attendance, Conduct or Next Term Requirements.
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="values" className="space-y-3 mt-3">
              {customFields.filter((f) => f.scope === "school").length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">School-wide values</h3>
                  {customFields.filter((f) => f.scope === "school").map((f) => (
                    <div key={f.id} className="space-y-1">
                      <Label className="text-xs">{f.label}</Label>
                      {f.field_type === "multiline" ? (
                        <Textarea
                          value={values[valueKey(f.id, null, null)] ?? ""}
                          onChange={(e) => setValues((p) => ({ ...p, [valueKey(f.id, null, null)]: e.target.value }))}
                          onBlur={(e) => saveValue(f, null, null, e.target.value)}
                        />
                      ) : (
                        <Input
                          type={f.field_type === "date" ? "date" : f.field_type === "number" || f.field_type === "percentage" ? "number" : "text"}
                          value={values[valueKey(f.id, null, null)] ?? ""}
                          onChange={(e) => setValues((p) => ({ ...p, [valueKey(f.id, null, null)]: e.target.value }))}
                          onBlur={(e) => saveValue(f, null, null, e.target.value)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
              {customFields.some((f) => f.scope === "learner") && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Learner-specific values</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Learner</Label>
                      <Select value={valueLearner} onValueChange={setValueLearner}>
                        <SelectTrigger aria-label="Learner"><SelectValue placeholder="Choose learner" /></SelectTrigger>
                        <SelectContent>
                          {learners.map((l) => <SelectItem key={l.id} value={l.id}>{l.full_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Term (optional)</Label>
                      <Select value={valueTerm} onValueChange={setValueTerm}>
                        <SelectTrigger aria-label="Term"><SelectValue placeholder="All terms" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">All terms</SelectItem>
                          {terms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} {t.year}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {valueLearner ? (
                    customFields.filter((f) => f.scope === "learner").map((f) => {
                      const key = valueKey(f.id, valueLearner, valueTerm || null);
                      return (
                        <div key={f.id} className="space-y-1">
                          <Label className="text-xs">{f.label}</Label>
                          {f.field_type === "multiline" ? (
                            <Textarea
                              value={values[key] ?? ""}
                              onChange={(e) => setValues((p) => ({ ...p, [key]: e.target.value }))}
                              onBlur={(e) => saveValue(f, valueLearner, valueTerm || null, e.target.value)}
                            />
                          ) : (
                            <Input
                              type={f.field_type === "date" ? "date" : f.field_type === "number" || f.field_type === "percentage" ? "number" : "text"}
                              value={values[key] ?? ""}
                              onChange={(e) => setValues((p) => ({ ...p, [key]: e.target.value }))}
                              onBlur={(e) => saveValue(f, valueLearner, valueTerm || null, e.target.value)}
                            />
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-muted-foreground">Choose a learner to enter their values.</p>
                  )}
                </div>
              )}
              {!customFields.length && (
                <p className="text-sm text-muted-foreground">Add custom fields first, then enter their values here.</p>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* custom field dialog */}
      <Dialog open={cfOpen} onOpenChange={setCfOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{cfEditing ? "Edit Custom Field" : "Add Custom Field"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="cf-label">Field label</Label>
              <Input id="cf-label" value={cfLabel} onChange={(e) => setCfLabel(e.target.value)}
                placeholder="e.g. Attendance" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Field type</Label>
                <Select value={cfType} onValueChange={(v) => setCfType(v as CustomFieldType)}>
                  <SelectTrigger aria-label="Field type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="multiline">Multiline text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Scope</Label>
                <Select value={cfScope} onValueChange={(v) => setCfScope(v as "school" | "learner")}>
                  <SelectTrigger aria-label="Scope"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="learner">Learner-specific</SelectItem>
                    <SelectItem value="school">School-wide</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cf-desc">Description (optional)</Label>
              <Input id="cf-desc" value={cfDesc} onChange={(e) => setCfDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCfOpen(false)}>Cancel</Button>
            <Button onClick={saveCf} disabled={!cfLabel.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
