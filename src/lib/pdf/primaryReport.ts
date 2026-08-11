/**
 * Primary report card — rendered by stamping dynamic data onto the school's
 * official uploaded A4 template (see src/lib/pdf/template/engine.ts).
 *
 * The template PDF itself is never redrawn: tables, borders, fonts, images,
 * spacing and colours all come from the uploaded design. Only placeholder
 * values are painted on top, at coordinates extracted from that same file.
 */
import { PDFDocument } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateDivision, gradeFor, applyF9Override, isCriticalCoreSubject, type GradeBand,
} from "@/lib/grading";
import { bytesToPdfBlob } from "./core";
import {
  fillTemplate, loadTemplateBytes, type Box, type TplDef, type ValueMap,
} from "./template/engine";
import primaryFields from "./template/primary.fields.json";
import { resolveTemplateUrl } from "./template/registry";

type Any = Record<string, any>;

const DEF = primaryFields as TplDef;

const FIELD_ORDER_DEFAULT = [
  "name", "stream", "house", "section", "age", "sex", "reg", "class", "pay_code",
] as const;

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";

const codeFor = (name: string): string => {
  const n = (name ?? "").toUpperCase();
  if (n.includes("ENGLISH")) return "ENG";
  if (n.includes("MATH")) return "MTC";
  if (n.includes("SCIEN")) return "SCI";
  if (n.includes("SOCIAL")) return "SST";
  if (n.includes("RELIG")) return "R.E";
  if (n.includes("COMPUT") || n.includes("ICT")) return "ICT";
  return (name ?? "").slice(0, 4).toUpperCase();
};

async function signed(bucket: string, path: string | null | undefined) {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/* ------------------------------------------------------------------ data */

export type PrimaryData = Awaited<ReturnType<typeof loadPrimaryData>>;

export async function loadPrimaryData(learnerId: string, termId: string) {
  const { data: learner } = await supabase.from("learners").select("*").eq("id", learnerId).maybeSingle();
  if (!learner) throw new Error("Learner not found");

  const [{ data: term }, { data: report }, { data: school }, { data: gs }, { data: settings }] = await Promise.all([
    supabase.from("terms").select("*").eq("id", termId).maybeSingle(),
    supabase.from("report_cards").select("*").eq("learner_id", learnerId).eq("term_id", termId).maybeSingle(),
    supabase.from("school_info").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("grading_scales").select("grade,points,min_mark,max_mark,remark").order("sort_order"),
    supabase.from("system_settings").select("key,value").in("key", ["learner_fields", "learner_info_order", "border_style", "report_template_primary"]),
  ]);
  if (!term) throw new Error("Term not found");

  const sMap: Any = {};
  ((settings as Any[]) ?? []).forEach((r) => { sMap[r.key] = r.value; });
  const flags = { stream: true, house: true, section: true, pay_code: true, show_position: true, ...(sMap.learner_fields ?? {}) };
  const order: string[] = Array.isArray(sMap.learner_info_order) && sMap.learner_info_order.length
    ? sMap.learner_info_order
    : [...FIELD_ORDER_DEFAULT];
  const borderStyle: string = typeof sMap.border_style === "string" ? sMap.border_style : "double";
  const templateSetting = sMap.report_template_primary ?? null;

  let klass: Any | null = null, stream: Any | null = null, classTeacher: Any | null = null;
  let subjects: Any[] = [], classSubjects: Any[] = [], classMarks: Any[] = [], classSize = 0;
  const teachersById: Record<string, Any> = {};

  if (learner.class_id) {
    klass = (await supabase.from("classes").select("*").eq("id", learner.class_id).maybeSingle()).data;
    subjects = (await supabase.from("subjects").select("*").eq("class_id", learner.class_id).order("sort_order")).data ?? [];
    const teacherIds = Array.from(new Set(subjects.map((s) => s.subject_teacher_id).filter(Boolean)));
    if (teacherIds.length) {
      const { data: ts } = await supabase.from("teachers").select("id,initials,full_name").in("id", teacherIds as string[]);
      (ts ?? []).forEach((t: Any) => { teachersById[t.id] = t; });
    }
    classSubjects = (await supabase.from("subjects").select("id,is_core,class_id").eq("class_id", learner.class_id)).data ?? [];
    const { data: classLearners } = await supabase.from("learners").select("id").eq("class_id", learner.class_id);
    const ids = (classLearners ?? []).map((l: Any) => l.id);
    classSize = ids.length;
    if (ids.length) {
      classMarks = (await supabase.from("marks").select("learner_id,subject_id,bot,mid,eot").eq("term_id", termId).in("learner_id", ids)).data ?? [];
    }
  }
  if (learner.stream_id) stream = (await supabase.from("streams").select("*").eq("id", learner.stream_id).maybeSingle()).data;
  if (klass?.class_teacher_id) classTeacher = (await supabase.from("teachers").select("*").eq("id", klass.class_teacher_id).maybeSingle()).data;

  const { data: marks } = await supabase.from("marks").select("*").eq("term_id", termId).eq("learner_id", learnerId);

  const [logo, headSig, classSig, photo, stamp, watermark] = await Promise.all([
    signed("school-assets", school?.logo_path),
    signed("signatures", school?.head_teacher_signature_path),
    signed("signatures", klass?.class_signature_path),
    signed("learner-photos", learner.photo_path),
    signed("school-assets", school?.stamp_path),
    signed("school-assets", school?.watermark_path),
  ]);

  return {
    learner, term, report, school, klass, stream, classTeacher,
    bands: ((gs ?? []) as GradeBand[]),
    subjects: subjects.slice(0, 5),
    marks: marks ?? [],
    classSubjects, classMarks, classSize, teachersById,
    flags, order, borderStyle, templateSetting,
    assets: { logo, headSig, classSig, photo, stamp, watermark },
  };
}

/* --------------------------------------------------------------- compute */

function computeAll(d: PrimaryData) {
  const { subjects, marks, bands } = d;
  const bySubject = new Map<string, Any>();
  marks.forEach((m: Any) => bySubject.set(m.subject_id, m));
  const coreIds = new Set(subjects.filter((s) => s.is_core).map((s) => s.id));
  const coreOk = coreIds.size === 4;

  const summary = (phase: "bot" | "mid" | "eot") => {
    const vals = subjects.map((s) => {
      const raw = bySubject.get(s.id)?.[phase];
      const v = raw != null && raw !== "" ? Number(raw) : null;
      return { id: s.id, v: v != null && !isNaN(v) ? v : null };
    });
    const present = vals.map((x) => x.v).filter((v): v is number => v != null);
    const total = present.reduce((a, b) => a + b, 0);
    const avg = present.length ? Math.round((total / present.length) * 100) / 100 : 0;
    const aggregate = coreOk
      ? vals.reduce((sum, x) => (x.v == null || !coreIds.has(x.id) ? sum : sum + (gradeFor(x.v, bands)?.points ?? 0)), 0)
      : 0;
    return { total, avg, aggregate };
  };

  const classSubjIds = new Set(d.classSubjects.map((s) => s.id));
  const positionFor = (phase: "bot" | "mid" | "eot") => {
    const byLearner = new Map<string, { total: number; count: number }>();
    d.classMarks.forEach((m: Any) => {
      if (!classSubjIds.has(m.subject_id)) return;
      const acc = byLearner.get(m.learner_id) ?? { total: 0, count: 0 };
      const raw = m?.[phase];
      const v = raw != null && raw !== "" ? Number(raw) : null;
      if (v != null && !isNaN(v)) { acc.total += v; acc.count += 1; }
      byLearner.set(m.learner_id, acc);
    });
    const arr = Array.from(byLearner.entries()).filter(([, v]) => v.count > 0)
      .map(([id, v]) => ({ id, total: v.total })).sort((a, b) => b.total - a.total);
    let lastTotal: number | null = null, lastPos = 0;
    const map = new Map<string, number>();
    arr.forEach((r, i) => {
      if (r.total !== lastTotal) { lastPos = i + 1; lastTotal = r.total; }
      map.set(r.id, lastPos);
    });
    return map.get(d.learner.id) ?? null;
  };

  const hasPhase = (phase: "bot" | "mid" | "eot") =>
    marks.some((m: Any) => m?.[phase] != null && m?.[phase] !== "");

  const missingCore = (phase: "bot" | "mid" | "eot") => {
    let missing = 0;
    coreIds.forEach((id) => {
      const raw = bySubject.get(id as string)?.[phase];
      if (raw == null || raw === "" || isNaN(Number(raw))) missing += 1;
    });
    return missing;
  };

  const hasF9 = (phase: "bot" | "mid" | "eot") => subjects.some((s) => {
    if (!isCriticalCoreSubject(s.name)) return false;
    const raw = bySubject.get(s.id)?.[phase];
    if (raw == null || raw === "" || isNaN(Number(raw))) return false;
    return gradeFor(Number(raw), bands)?.grade === "F9";
  });

  const phase = (ph: "bot" | "mid" | "eot") => {
    const sum = summary(ph);
    const has = hasPhase(ph);
    let division = "";
    if (has && coreOk) {
      const base = missingCore(ph) > 0 ? "X" : calculateDivision(sum.aggregate);
      division = applyF9Override(base, hasF9(ph));
    }
    return {
      ...sum, has, division,
      position: positionFor(ph),
      classSize: d.classSize,
      aggregateText: coreOk && has ? String(sum.aggregate) : "",
    };
  };

  return { bySubject, coreOk, bot: phase("bot"), mid: phase("mid"), eot: phase("eot") };
}

/* ---------------------------------------------------------------- render */

type Ink = { bold?: boolean; italic?: boolean };

const GRID = "#222222";
const HEAD_FILL = "#f1f3f7";

/** Largest size <= `size` at which `text` fits in `w` mm (never below 4.4pt). */
function fitSize(p: Painter, text: string, size: number, w: number, o: Ink = {}) {
  let s = size;
  while (s > 4.4 && p.widthOf(text, s, o) > w) s -= 0.2;
  return Math.round(s * 10) / 10;
}

/** Single-line, shrink-to-fit text centred inside a cell box. */
function cellText(
  p: Painter,
  text: string,
  box: { x: number; y: number; w: number; h: number },
  o: Ink & { size?: number; align?: "left" | "center" | "right"; color?: string; pad?: number } = {},
) {
  const str = (text ?? "").toString().replace(/\s+/g, " ").trim();
  if (!str) return;
  const pad = o.pad ?? 1.2;
  const w = Math.max(2, box.w - pad * 2);
  const size = fitSize(p, str, o.size ?? 8, w, o);
  p.text(str, {
    x: box.x + pad,
    y: box.y + (box.h - (size * 1.0) / MM) / 2,
    width: w,
    size,
    align: o.align ?? "center",
    bold: o.bold,
    italic: o.italic,
    color: o.color ?? INK,
  });
}

/** Bold label followed by its value, kept together on one line inside a box. */
function labelValue(
  p: Painter,
  label: string,
  value: string,
  box: { x: number; y: number; w: number; h: number },
  size = 8,
) {
  const val = (value ?? "").toString().replace(/\s+/g, " ").trim();
  let s = size;
  const total = () => p.widthOf(`${label} `, s, { bold: true }) + p.widthOf(val, s);
  while (s > 4.4 && total() > box.w - 2) s -= 0.2;
  const lw = p.widthOf(`${label} `, s, { bold: true });
  const y = box.y + (box.h - (s * 1.0) / MM) / 2;
  p.text(label, { x: box.x + 1, y, size: s, bold: true });
  if (val) p.text(val, { x: box.x + 1 + lw, y, size: s });
}

function cellBox(p: Painter, box: { x: number; y: number; w: number; h: number }, fill?: string) {
  p.rect({ ...box, border: GRID, lineWidth: 0.22, fill });
}

/** Splits a width into columns from weights. */
const cols = (x: number, w: number, weights: number[]) => {
  const sum = weights.reduce((a, b) => a + b, 0);
  const out: { x: number; w: number }[] = [];
  let cx = x;
  weights.forEach((wt) => {
    const cw = (w * wt) / sum;
    out.push({ x: cx, w: cw });
    cx += cw;
  });
  return out;
};

const LEFT = 12;
const RIGHT = 198;
const CONTENT_W = RIGHT - LEFT;

export async function renderPrimaryBytes(d: PrimaryData): Promise<Uint8Array> {
  const c = computeAll(d);
  const s: Any = (d.school as Any) ?? {};
  const doc = await PDFDocument.create();
  const page = doc.addPage([mm(A4_W), mm(A4_H)]);
  const fonts = await loadFonts(doc);
  const p = new Painter(page, fonts);

  const [logo, photo, headSig, classSig, stamp, watermark] = await Promise.all([
    embedImage(doc, d.assets.logo),
    embedImage(doc, d.assets.photo),
    embedImage(doc, d.assets.headSig),
    embedImage(doc, d.assets.classSig),
    embedImage(doc, d.assets.stamp),
    embedImage(doc, d.assets.watermark),
  ]);

  /* Watermark sits underneath everything. */
  if (s.watermark_enabled && watermark) {
    const opacity = s.watermark_opacity ?? 0.3;
    const mode = (s.watermark_mode as string) || "custom";
    if (mode === "fit" || mode === "fill") {
      p.image(watermark, { x: 10, y: 10, w: A4_W - 20, h: A4_H - 20 }, { opacity, cover: mode === "fill" });
    } else {
      const scale = s.watermark_scale ?? 1;
      const w = A4_W * 0.4 * scale;
      const h = w;
      p.image(watermark, {
        x: (A4_W * (s.watermark_x ?? 50)) / 100 - w / 2,
        y: (A4_H * (s.watermark_y ?? 50)) / 100 - h / 2,
        w, h,
      }, { opacity });
    }
  }

  /* Outer frame comes only from Settings → Report Card Border Style. */
  drawBorder(p, d.borderStyle);

  const subjects = d.subjects;
  const n = Math.max(subjects.length, 1);

  /* ---------------------------------------------------------- header (3 cols) */
  let y = 13;
  const HEAD_H = 30;
  const logoBox = { x: LEFT + 1, y, w: 27, h: HEAD_H };
  const photoBox = { x: RIGHT - 26, y, w: 25, h: HEAD_H };
  if (logo) p.image(logo, logoBox);
  if (photo) p.image(photo, photoBox);

  const midX = logoBox.x + logoBox.w + 3;
  const midW = photoBox.x - 3 - midX;
  const lines: string[] = [];
  if (s.location) lines.push(String(s.location));
  if (s.po_box) lines.push(`P.O. Box ${s.po_box}`);
  if (s.tel) lines.push(`Tel: ${s.tel}`);
  const contact = [s.email ? `Email: ${s.email}` : "", s.website ? `Web: ${s.website}` : ""].filter(Boolean).join("   ");
  if (contact) lines.push(contact);

  const nameSize = fitSize(p, (s.name ?? "SCHOOL NAME").toUpperCase(), 17, midW, { bold: true });
  p.text((s.name ?? "SCHOOL NAME").toUpperCase(), {
    x: midX, y: y + 1, width: midW, size: nameSize, bold: true, align: "center",
  });
  let ly = y + 1 + (nameSize * 1.35) / MM;
  const lineSize = Math.min(8.5, Math.max(6, (HEAD_H - (ly - y) - 1) / Math.max(lines.length, 1) * MM / 1.35));
  lines.forEach((l) => {
    const sz = fitSize(p, l, lineSize, midW);
    p.text(l, { x: midX, y: ly, width: midW, size: sz, align: "center" });
    ly += (lineSize * 1.35) / MM;
  });

  y += HEAD_H + 1;
  p.line(LEFT, y, RIGHT, y, { color: GRID, width: 0.5 });
  y += 1.5;

  /* ------------------------------------------------------------------ title */
  const title = `LEARNER'S ASSESSMENT REPORT CARD    TERM: ${d.term.name ?? ""}    YEAR: ${d.term.year ?? ""}`;
  const tSize = fitSize(p, title, 11.5, CONTENT_W, { bold: true });
  p.text(title, { x: LEFT, y, width: CONTENT_W, size: tSize, bold: true, align: "center" });
  y += 6.5;

  /* ------------------------------------------- learner info — exactly 2 rows */
  const regLabel = d.learner.active_reg_type === "REG" ? "REG NO.:"
    : d.learner.active_reg_type === "INDEX" ? "INDEX NO.:" : "LIN NO.:";
  const regValue = d.learner.active_reg_type === "REG" ? d.learner.reg_no
    : d.learner.active_reg_type === "INDEX" ? d.learner.index_no : d.learner.lin_no;

  const row1 = [
    { label: "NAME:", value: d.learner.full_name ?? "", weight: 2.4, on: true },
    { label: "CLASS:", value: d.klass?.name ?? "", weight: 1.4, on: true },
    { label: "STREAM:", value: d.stream?.name ?? "", weight: 1.2, on: !!d.flags.stream },
    { label: "SECTION:", value: d.learner.section ?? "", weight: 1.2, on: !!d.flags.section },
    { label: "HOUSE:", value: d.learner.house ?? "", weight: 1.1, on: !!d.flags.house },
  ].filter((f) => f.on);
  const row2 = [
    { label: "AGE:", value: d.learner.age != null ? String(d.learner.age) : "", weight: 0.9, on: true },
    { label: "SEX:", value: d.learner.sex ?? "", weight: 0.9, on: true },
    { label: regLabel, value: String(regValue ?? ""), weight: 1.6, on: true },
    { label: "PAY CODE:", value: d.learner.pay_code ?? "", weight: 1.6, on: !!d.flags.pay_code },
    { label: "ADMISSION NO.:", value: String(d.learner.adm_no ?? d.learner.reg_no ?? regValue ?? ""), weight: 1.8, on: true },
  ].filter((f) => f.on);

  const INFO_ROW_H = 8.5;
  p.rect({ x: LEFT, y, w: CONTENT_W, h: INFO_ROW_H * 2, border: GRID, lineWidth: 0.4 });
  p.line(LEFT, y + INFO_ROW_H, RIGHT, y + INFO_ROW_H, { color: GRID, width: 0.22 });
  [row1, row2].forEach((row, ri) => {
    /* Weight each field by the space its label + value actually needs so long
       values shrink neighbours instead of falling to a third row. */
    const need = row.map((f) => Math.max(f.weight, p.widthOf(`${f.label} ${f.value}`, 8, {}) / 22));
    const boxes = cols(LEFT, CONTENT_W, need);
    row.forEach((f, i) => {
      labelValue(p, f.label, f.value, { x: boxes[i].x + 1, y: y + ri * INFO_ROW_H, w: boxes[i].w - 1, h: INFO_ROW_H }, 8);
    });
  });
  y += INFO_ROW_H * 2 + 2.5;

  /* ------------------------------------------------------- vertical budget */
  const BOTTOM_H = 34;      // conduct + comments + signatures
  const DATES_H = 8;
  const GRADE_BLOCK_H = 5.5 + 13;
  const MOTTO_H = 7;
  const PAGE_BOTTOM = 283;
  const tailH = BOTTOM_H + DATES_H + GRADE_BLOCK_H + MOTTO_H + 6;

  const phaseFixed = 5 + 3 * 6.2 + 6.5 + 2.5;   // label + 3 rows + summary + gap
  const eotFixed = 5 + 6.5 + 6.5 + 2.5;         // label + header + summary + gap
  const avail = PAGE_BOTTOM - tailH - y;
  const eotRowH = Math.min(9.5, Math.max(6, (avail - phaseFixed * 2 - eotFixed) / n));

  /* ------------------------------------------------------------ BOT / MID */
  const drawPhase = (
    label: string,
    phaseKey: "bot" | "mid",
    info: { total: number; avg: number; division: string; aggregateText: string; position: number | null; classSize: number },
  ) => {
    p.text(label, { x: LEFT, y, width: CONTENT_W, size: 9, bold: true, align: "center" });
    y += 5;
    const rowH = 6.2;
    const w = cols(LEFT, CONTENT_W, [1.5, ...subjects.map(() => 1)]);
    const rows: { text: (i: number) => string; bold?: boolean; fill?: string; label: string }[] = [
      { label: "SUBJECTS", bold: true, fill: HEAD_FILL, text: (i) => codeFor(subjects[i].name) },
      { label: "MARKS", text: (i) => {
        const raw = c.bySubject.get(subjects[i].id)?.[phaseKey];
        return raw != null && raw !== "" ? String(raw) : "";
      } },
      { label: "GRADE", text: (i) => {
        const raw = c.bySubject.get(subjects[i].id)?.[phaseKey];
        return raw != null && raw !== "" && !isNaN(Number(raw)) ? (gradeFor(Number(raw), d.bands)?.grade ?? "") : "";
      } },
    ];
    rows.forEach((r, ri) => {
      const ry = y + ri * rowH;
      cellBox(p, { x: w[0].x, y: ry, w: w[0].w, h: rowH }, HEAD_FILL);
      cellText(p, r.label, { x: w[0].x, y: ry, w: w[0].w, h: rowH }, { bold: true, size: 7.5 });
      subjects.forEach((_, i) => {
        const b = { x: w[i + 1].x, y: ry, w: w[i + 1].w, h: rowH };
        cellBox(p, b, r.fill);
        cellText(p, r.text(i), b, { bold: !!r.bold, size: 8 });
      });
    });
    y += rowH * rows.length;
    drawSummary(info);
    y += 2.5;
  };

  const drawSummary = (info: { total: number; avg: number; division: string; aggregateText: string; position: number | null; classSize: number }) => {
    const items = [
      { l: "TOTAL:", v: info.total ? String(info.total) : "" },
      { l: "AVERAGE:", v: info.avg ? String(info.avg) : "" },
      ...(d.flags.show_position
        ? [{ l: "POSITION:", v: info.position && info.classSize ? `${info.position}/${info.classSize}` : "" }]
        : []),
      { l: "AGGREGATES:", v: info.aggregateText },
      { l: "DIVISION:", v: info.division },
    ];
    const h = 6.5;
    const boxes = cols(LEFT, CONTENT_W, items.map(() => 1));
    items.forEach((it, i) => {
      const b = { x: boxes[i].x, y, w: boxes[i].w, h };
      cellBox(p, b);
      let size = 8;
      while (size > 4.6 && p.widthOf(`${it.l} ${it.v}`, size, { bold: true }) > b.w - 3) size -= 0.2;
      const lw = p.widthOf(`${it.l} `, size, { bold: true });
      const ty = b.y + (b.h - (size * 1.0) / MM) / 2;
      p.text(it.l, { x: b.x + 1.5, y: ty, size, bold: true });
      if (it.v) p.text(it.v, { x: b.x + 1.5 + lw, y: ty, size, bold: true });
    });
    y += h;
  };

  drawPhase("BEGINNING OF TERM EXAMINATION RESULTS", "bot", c.bot);
  drawPhase("MID TERM EXAMINATION RESULTS", "mid", c.mid);

  /* ----------------------------------------------------------------- EOT */
  p.text("END OF TERM EXAMINATION RESULTS", { x: LEFT, y, width: CONTENT_W, size: 9, bold: true, align: "center" });
  y += 5;
  const eotCols = cols(LEFT, CONTENT_W, [2.6, 1.3, 1.3, 1.1, 1.7, 1.1]);
  const eotHead = ["SUBJECTS", "FULL MARKS", "MARKS GOT", "GRADE", "REMARKS", "INITIALS"];
  eotHead.forEach((h, i) => {
    const b = { x: eotCols[i].x, y, w: eotCols[i].w, h: 6.5 };
    cellBox(p, b, HEAD_FILL);
    cellText(p, h, b, { bold: true, size: 7.8 });
  });
  y += 6.5;
  subjects.forEach((sub, ri) => {
    const m = c.bySubject.get(sub.id);
    const raw = m?.eot;
    const has = raw != null && raw !== "" && !isNaN(Number(raw));
    const band = has ? gradeFor(Number(raw), d.bands) : null;
    const vals = [
      (sub.name ?? "").toUpperCase(),
      String(sub.max_marks ?? 100),
      has ? String(raw) : "",
      band?.grade ?? "",
      band?.remark ?? "",
      (sub.subject_teacher_id && d.teachersById[sub.subject_teacher_id]?.initials) || m?.teacher_initials || "",
    ];
    vals.forEach((v, ci) => {
      const b = { x: eotCols[ci].x, y: y + ri * eotRowH, w: eotCols[ci].w, h: eotRowH };
      cellBox(p, b);
      cellText(p, v, b, { size: 8 });
    });
  });
  y += eotRowH * subjects.length;
  drawSummary(c.eot);
  y += 2.5;

  /* -------------------------------------- conduct, comments and signatures */
  const bottomTop = y;
  const leftW = CONTENT_W * 0.63;
  const rightW = CONTENT_W - leftW;
  const conductH = 7.5;
  const commentH = (BOTTOM_H - conductH) / 2;

  const conductCols = cols(LEFT, CONTENT_W, [1, 1]);
  [
    { l: "Learner's Conduct & Behavior:", v: d.learner.conduct ?? "" },
    { l: "Co-curricular Activities:", v: d.learner.co_curricular ?? "" },
  ].forEach((it, i) => {
    const b = { x: conductCols[i].x, y: bottomTop, w: conductCols[i].w, h: conductH };
    cellBox(p, b);
    labelValue(p, it.l, it.v, b, 8);
  });

  const comments = [
    { l: "Class Teacher's Comment:", v: d.report?.class_teacher_comment ?? "", sig: classSig, name: (d.classTeacher?.full_name ?? "").toUpperCase() },
    { l: "Head Teacher's Comment:", v: d.report?.head_teacher_comment ?? "", sig: headSig, name: (s.head_teacher_name ?? "").toUpperCase() },
  ];
  comments.forEach((cm, i) => {
    const cy = bottomTop + conductH + i * commentH;
    const lb = { x: LEFT, y: cy, w: leftW, h: commentH };
    cellBox(p, lb);
    const labelW = Math.min(34, leftW * 0.4);
    p.paragraph(cm.l, { x: lb.x + 1.2, y: cy + 1.4, width: labelW, size: 7.6, bold: true, maxLines: 2, lineHeight: 1.15 });
    const textW = leftW - labelW - 3;
    let cs = 8;
    while (cs > 5.5 && p.wrap(cm.v, cs, textW).length > 3) cs -= 0.2;
    const cl = p.wrap(cm.v, cs, textW).slice(0, 3);
    let ty = cy + (commentH - cl.length * (cs * 1.2) / MM) / 2;
    cl.forEach((line) => { ty += p.text(line, { x: lb.x + labelW + 2, y: ty, size: cs, lineHeight: 1.2 }); });

    const rb = { x: LEFT + leftW, y: cy, w: rightW, h: commentH };
    cellBox(p, rb);
    if (cm.sig) p.image(cm.sig, { x: rb.x + 6, y: rb.y + 1, w: rb.w - 12, h: commentH * 0.5 });
    cellText(p, cm.name, { x: rb.x, y: rb.y + commentH * 0.55, w: rb.w, h: commentH * 0.45 }, { size: 8 });
  });
  y = bottomTop + BOTTOM_H;

  /* ----------------------------------------------------------- term dates */
  const dateCols = cols(LEFT, CONTENT_W, [1, 1]);
  [
    { l: "Term Ends On:", v: fmtDate(d.term.ends_on ?? d.term.end_date) },
    { l: "Next Term Begins On:", v: fmtDate(d.term.next_begins_on) },
  ].forEach((it, i) => {
    const b = { x: dateCols[i].x, y, w: dateCols[i].w, h: DATES_H };
    cellBox(p, b);
    labelValue(p, it.l, it.v, b, 8);
  });
  y += DATES_H;

  /* ---------------------------------- grading system + motto, pinned bottom */
  const mottoY = PAGE_BOTTOM - MOTTO_H + 1;
  const gradeTableH = 12;
  const gradeTitleY = mottoY - gradeTableH - 6.5;
  p.text("SCHOOL GRADING SYSTEM", { x: LEFT, y: Math.max(y + 2, gradeTitleY), width: CONTENT_W, size: 9, bold: true, align: "center" });

  const bandsList = d.bands.filter((b) => b.grade);
  const gTop = Math.max(y + 2, gradeTitleY) + 5.5;
  const gRowH = gradeTableH / 2;
  const gCols = cols(LEFT, CONTENT_W, [1.3, ...bandsList.map(() => 1)]);
  ["GRADE", "MARKS"].forEach((rowLabel, ri) => {
    const ry = gTop + ri * gRowH;
    const lb = { x: gCols[0].x, y: ry, w: gCols[0].w, h: gRowH };
    cellBox(p, lb, HEAD_FILL);
    cellText(p, rowLabel, lb, { bold: true, size: 7.8 });
    bandsList.forEach((b, i) => {
      const cb = { x: gCols[i + 1].x, y: ry, w: gCols[i + 1].w, h: gRowH };
      cellBox(p, cb, ri === 0 ? HEAD_FILL : undefined);
      cellText(p, ri === 0 ? String(b.grade) : `${b.min_mark}-${b.max_mark}`, cb, { bold: ri === 0, size: 7.6 });
    });
  });

  if (s.motto) {
    const motto = `"${String(s.motto).replace(/^"|"$/g, "")}"`;
    const size = fitSize(p, motto, 9, CONTENT_W, { bold: true, italic: true });
    p.text(motto, { x: LEFT, y: mottoY, width: CONTENT_W, size, bold: true, italic: true, align: "center" });
  }

  /* Stamp last so it overlays the finished card. */
  if (stamp) {
    const size = 28 * (s.stamp_size ?? 1);
    p.image(stamp, {
      x: (A4_W * (s.stamp_x ?? 75)) / 100 - size / 2,
      y: (A4_H * (s.stamp_y ?? 78)) / 100 - size / 2,
      w: size, h: size,
    }, { opacity: s.stamp_opacity ?? 0.6 });
  }

  return doc.save();
}

/** Renders the primary report card and returns the finished PDF bytes. */
export async function primaryReportBytes(learnerId: string, termId: string): Promise<Uint8Array> {
  const d = await loadPrimaryData(learnerId, termId);
  return renderPrimaryBytes(d);
}

export async function primaryReportBlob(learnerId: string, termId: string): Promise<Blob> {
  return bytesToPdfBlob(await primaryReportBytes(learnerId, termId));
}

/** Appends one primary report page to an existing document (bulk output). */
export async function appendPrimaryReport(target: PDFDocument, learnerId: string, termId: string) {
  const bytes = await primaryReportBytes(learnerId, termId);
  const src = await PDFDocument.load(bytes);
  const [page] = await target.copyPages(src, [0]);
  target.addPage(page);
}

