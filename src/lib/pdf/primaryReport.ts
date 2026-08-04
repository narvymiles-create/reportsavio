/**
 * Primary report card — rendered natively with pdf-lib.
 *
 * The layout mirrors ReportCardSheet / PrintReportCard.css exactly, but is
 * drawn as real vector text and lines, so Preview, Print and Download all come
 * from one geometry definition and there is no HTML rasterisation involved.
 */
import { PDFDocument } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateDivision, gradeFor, applyF9Override, isCriticalCoreSubject, type GradeBand,
} from "@/lib/grading";
import {
  A4_H, A4_W, INK, Painter, embedImage, loadFonts, mm, bytesToPdfBlob,
  DEFAULT_ORDER_FALLBACK,
} from "./core";
import { drawBorder } from "./borders";

type Any = Record<string, any>;

const M = 13;              // page side margin
const X0 = M;
const W = A4_W - M * 2;    // 184mm content width
const LINE = "#000000";
const LW = 0.25;

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
    supabase.from("system_settings").select("key,value").in("key", ["learner_fields", "learner_info_order", "border_style"]),
  ]);
  if (!term) throw new Error("Term not found");

  const sMap: Any = {};
  ((settings as Any[]) ?? []).forEach((r) => { sMap[r.key] = r.value; });
  const flags = { stream: true, house: true, section: true, pay_code: true, show_position: true, ...(sMap.learner_fields ?? {}) };
  const order: string[] = Array.isArray(sMap.learner_info_order) && sMap.learner_info_order.length
    ? sMap.learner_info_order
    : [...FIELD_ORDER_DEFAULT];
  const borderStyle: string = typeof sMap.border_style === "string" ? sMap.border_style : "double";

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
    subjects: subjects.slice(0, 7),
    marks: marks ?? [],
    classSubjects, classMarks, classSize, teachersById,
    flags, order, borderStyle,
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
  const classCoreIds = new Set(d.classSubjects.filter((s) => s.is_core).map((s) => s.id));
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

/* ----------------------------------------------------------------- draw */

type Phase = ReturnType<typeof computeAll>["bot"];

function drawSummaryRow(p: Painter, y: number, h: number, ph: Phase, showPosition: boolean) {
  const cells: [string, string][] = [
    ["TOTAL MARKS:", ph.total ? String(ph.total) : ""],
    ["AVERAGE:", ph.avg ? String(ph.avg) : ""],
    ...(showPosition ? ([["POSITION:", ph.position && ph.classSize ? `${ph.position}/${ph.classSize}` : ""]] as [string, string][]) : []),
    ["AGGREGATES:", ph.aggregateText],
    ["DIVISION:", ph.division],
  ];
  const cw = W / cells.length;
  cells.forEach(([label, value], i) => {
    const x = X0 + i * cw;
    p.rect({ x, y, w: cw, h, border: LINE, lineWidth: LW });
    const size = 6.2;
    const text = value ? `${label} ${value}` : label;
    const lw = p.widthOf(label, size, { bold: true });
    const vw = value ? p.widthOf(` ${value}`, size, { bold: true }) : 0;
    const start = x + (cw - (lw + vw)) / 2;
    const ty = y + (h - (size * 1.2) / mm(1)) / 2;
    p.text(label, { x: start, y: ty, size, bold: true });
    if (value) p.text(` ${value}`, { x: start + lw, y: ty, size, bold: true });
  });
  return h;
}

function drawPhaseTable(
  p: Painter, y: number, label: string, phaseKey: "bot" | "mid",
  d: PrimaryData, c: ReturnType<typeof computeAll>, ph: Phase,
): number {
  const subjects = d.subjects;
  const labelH = 4.6;
  p.rect({ x: X0, y, w: W, h: labelH, fill: "#eeeeee", border: LINE, lineWidth: LW });
  p.textInBox(label, { x: X0, y, w: W, h: labelH }, { size: 6.6, bold: true });
  let cy = y + labelH;

  const rowH = 5;
  const labelW = 26;
  const colW = subjects.length ? (W - labelW) / subjects.length : W - labelW;

  const rows: { name: string; get: (s: Any) => string }[] = [
    { name: "SUBJECTS", get: (s) => codeFor(s.name) },
    { name: "MARKS", get: (s) => { const v = c.bySubject.get(s.id)?.[phaseKey]; return v != null && v !== "" ? String(v) : ""; } },
    { name: "GRADE", get: (s) => { const v = c.bySubject.get(s.id)?.[phaseKey]; return v != null && v !== "" ? (gradeFor(Number(v), d.bands)?.grade ?? "") : ""; } },
  ];

  rows.forEach((row, ri) => {
    p.rect({ x: X0, y: cy, w: labelW, h: rowH, border: LINE, lineWidth: LW, fill: "#f3f4f6" });
    p.textInBox(row.name, { x: X0, y: cy, w: labelW, h: rowH }, { size: 6.2, bold: true });
    subjects.forEach((s, i) => {
      const x = X0 + labelW + i * colW;
      p.rect({ x, y: cy, w: colW, h: rowH, border: LINE, lineWidth: LW, fill: ri === 0 ? "#f3f4f6" : undefined });
      p.textInBox(row.get(s), { x, y: cy, w: colW, h: rowH }, { size: 6.4, bold: ri === 0 });
    });
    cy += rowH;
  });

  cy += drawSummaryRow(p, cy, 5, ph, !!d.flags.show_position);
  return cy - y;
}

function drawEotTable(p: Painter, y: number, d: PrimaryData, c: ReturnType<typeof computeAll>, rowH: number): number {
  const labelH = 4.6;
  p.rect({ x: X0, y, w: W, h: labelH, fill: "#eeeeee", border: LINE, lineWidth: LW });
  p.textInBox("END OF TERM EXAMS", { x: X0, y, w: W, h: labelH }, { size: 6.6, bold: true });
  let cy = y + labelH;

  const cols = [52, 20, 20, 16, 46, 30];
  const scale = W / cols.reduce((a, b) => a + b, 0);
  const cw = cols.map((v) => v * scale);
  const heads = ["SUBJECTS", "FULL MARKS", "MARKS GOT", "GRADE", "REMARKS", "INITIALS"];

  const drawRow = (vals: string[], h: number, head: boolean) => {
    let x = X0;
    vals.forEach((v, i) => {
      p.rect({ x, y: cy, w: cw[i], h, border: LINE, lineWidth: LW, fill: head ? "#f3f4f6" : undefined });
      p.textInBox(v, { x, y: cy, w: cw[i], h }, {
        size: head ? 6.2 : 6.6,
        bold: head,
        align: i === 0 ? "left" : "center",
      });
      x += cw[i];
    });
    cy += h;
  };

  drawRow(heads, 5, true);
  d.subjects.forEach((s) => {
    const m = c.bySubject.get(s.id);
    const raw = m?.eot;
    const band = raw != null && raw !== "" && !isNaN(Number(raw)) ? gradeFor(Number(raw), d.bands) : null;
    drawRow([
      (s.name ?? "").toUpperCase(),
      String(s.max_marks ?? 100),
      raw != null && raw !== "" ? String(raw) : "",
      band?.grade ?? "",
      band?.remark ?? "",
      (s.subject_teacher_id && d.teachersById[s.subject_teacher_id]?.initials) || m?.teacher_initials || "",
    ], rowH, false);
  });

  cy += drawSummaryRow(p, cy, 5, c.eot, !!d.flags.show_position);
  return cy - y;
}

export async function buildPrimaryReportPdf(learnerId: string, termId: string, doc?: PDFDocument): Promise<PDFDocument> {
  const d = await loadPrimaryData(learnerId, termId);
  const pdf = doc ?? (await PDFDocument.create());
  const page = pdf.addPage([mm(A4_W), mm(A4_H)]);
  const fonts = await loadFonts(pdf);
  const p = new Painter(page, fonts);
  const c = computeAll(d);
  const s = d.school ?? {};

  const [logo, photo, stamp, watermark, classSig, headSig] = await Promise.all([
    embedImage(pdf, d.assets.logo),
    embedImage(pdf, d.assets.photo),
    embedImage(pdf, d.assets.stamp),
    embedImage(pdf, d.assets.watermark),
    embedImage(pdf, d.assets.classSig),
    embedImage(pdf, d.assets.headSig),
  ]);

  // Watermark (behind everything else)
  if (watermark && s.watermark_enabled) {
    const opacity = Number(s.watermark_opacity ?? 0.3);
    const mode = s.watermark_mode ?? "custom";
    if (mode === "fit" || mode === "fill") {
      p.image(watermark, { x: 8, y: 8, w: A4_W - 16, h: A4_H - 16 }, { opacity, cover: mode === "fill" });
    } else {
      const w = (A4_W * 0.4) * Number(s.watermark_scale ?? 1);
      const h = w / (watermark.width / watermark.height);
      const cx = (A4_W * Number(s.watermark_x ?? 50)) / 100;
      const cy = (A4_H * Number(s.watermark_y ?? 50)) / 100;
      p.image(watermark, { x: cx - w / 2, y: cy - h / 2, w, h }, { opacity });
    }
  }

  drawBorder(p, d.borderStyle);

  /* Header ---------------------------------------------------------- */
  let y = 13;
  const headH = 25;
  const logoW = 26, photoW = 23;
  p.rect({ x: X0, y, w: logoW, h: headH, border: LINE, lineWidth: LW });
  if (logo) p.image(logo, { x: X0 + 1, y: y + 1, w: logoW - 2, h: headH - 2 });
  else p.textInBox("SCHOOL\nLOGO", { x: X0, y, w: logoW, h: headH }, { size: 6, bold: true });

  const photoX = X0 + W - photoW;
  p.rect({ x: photoX, y, w: photoW, h: headH, border: LINE, lineWidth: LW });
  if (photo) p.image(photo, { x: photoX + 1, y: y + 1, w: photoW - 2, h: headH - 2 });
  else p.textInBox("STUDENT\nPHOTO", { x: photoX, y, w: photoW, h: headH }, { size: 6, bold: true });

  const midX = X0 + logoW + 2;
  const midW = photoX - midX - 2;
  let ty = y + 1;
  ty += p.text((s.name ?? "SCHOOL NAME").toUpperCase(), { x: midX, y: ty, width: midW, align: "center", size: 12.5, bold: true, lineHeight: 1.15 });
  const infoLines = [
    s.location ? `Location: ${s.location}` : null,
    s.po_box ? `P.O.BOX ${s.po_box}` : null,
    s.tel ? `TEL: ${s.tel}` : null,
    s.email ? `Email: ${s.email}` : null,
    s.website ? `Website: ${s.website}` : null,
  ].filter(Boolean) as string[];
  infoLines.forEach((l) => { ty += p.text(l, { x: midX, y: ty, width: midW, align: "center", size: 6.6, lineHeight: 1.28 }); });
  y += headH + 1.5;

  /* Title ----------------------------------------------------------- */
  const titleH = 6.4;
  p.rect({ x: X0, y, w: W, h: titleH, fill: "#e8ecf5", border: LINE, lineWidth: LW });
  p.textInBox(
    `LEARNER'S ASSESSMENT REPORT CARD TERM \u2013 ${(d.term.name ?? "").toUpperCase()} ${d.term.year ?? ""}`.trim(),
    { x: X0, y, w: W, h: titleH }, { size: 8.2, bold: true },
  );
  y += titleH + 1.2;

  /* Learner info ----------------------------------------------------- */
  const regLabel = d.learner.active_reg_type === "LIN" ? "LIN NO.:" : d.learner.active_reg_type === "REG" ? "REG NO.:" : "INDEX NO.:";
  const regValue = d.learner.active_reg_type === "LIN" ? d.learner.lin_no : d.learner.active_reg_type === "REG" ? d.learner.reg_no : d.learner.index_no;
  const cellMap: Record<string, { enabled: boolean; label: string; value: string }> = {
    name: { enabled: true, label: "NAME:", value: d.learner.full_name ?? "" },
    stream: { enabled: !!d.flags.stream, label: "STREAM:", value: d.stream?.name ?? "" },
    house: { enabled: !!d.flags.house, label: "HOUSE:", value: d.learner.house ?? "" },
    section: { enabled: !!d.flags.section, label: "SECTION:", value: d.learner.section ?? "" },
    age: { enabled: true, label: "AGE:", value: d.learner.age != null ? String(d.learner.age) : "" },
    sex: { enabled: true, label: "SEX:", value: d.learner.sex ?? "" },
    reg: { enabled: true, label: regLabel, value: String(regValue ?? "") },
    class: { enabled: true, label: "CLASS:", value: d.klass?.name ?? "" },
    pay_code: { enabled: !!d.flags.pay_code, label: "PAY CODE:", value: d.learner.pay_code ?? "" },
  };
  const visible = d.order.map((k) => cellMap[k]).filter((c2) => c2?.enabled);
  while (visible.length % 3 !== 0) visible.push(null as any);
  const infoRowH = 5.6;
  const infoColW = W / 3;
  for (let i = 0; i < visible.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      const cell = visible[i + j];
      const x = X0 + j * infoColW;
      p.rect({ x, y, w: infoColW, h: infoRowH, border: LINE, lineWidth: LW });
      if (cell) {
        const size = 6.8;
        const lw = p.widthOf(cell.label, size, { bold: true });
        const vw = cell.value ? p.widthOf(` ${cell.value}`, size) : 0;
        const startX = x + Math.max(1.4, (infoColW - (lw + vw)) / 2);
        const tyy = y + (infoRowH - (size * 1.2) / mm(1)) / 2;
        p.text(cell.label, { x: startX, y: tyy, size, bold: true });
        if (cell.value) p.text(` ${cell.value}`, { x: startX + lw, y: tyy, size });
      }
    }
    y += infoRowH;
  }
  y += 1.4;

  /* Exam sections ----------------------------------------------------- */
  y += drawPhaseTable(p, y, "BEGINNING OF TERM EXAMS", "bot", d, c, c.bot) + 1.4;
  y += drawPhaseTable(p, y, "MID-TERM EXAMS", "mid", d, c, c.mid) + 1.4;

  /* Bottom blocks are pinned so the sheet always fills exactly one page. */
  const MOTTO_Y = 283;
  const GRADING_ROW_H = 4.8;
  const gradingTitleY = MOTTO_Y - 2.4 - GRADING_ROW_H * 2 - 4.4;
  const datesY = gradingTitleY - 6.2;
  const bottomTableBottom = datesY - 1.6;

  // EOT table grows/shrinks to consume the free space above the bottom blocks.
  const bottomTableH = 26;
  const availableForEot = bottomTableBottom - bottomTableH - 1.6 - y;
  const fixedEot = 4.6 + 5 + 5;                       // label + head row + summary row
  const nSub = Math.max(d.subjects.length, 1);
  const eotRowH = Math.max(4.2, Math.min(6.4, (availableForEot - fixedEot) / nSub));
  y += drawEotTable(p, y, d, c, eotRowH) + 1.6;

  /* Conduct / comments + signatures ------------------------------------ */
  const btTop = Math.max(y, bottomTableBottom - bottomTableH);
  const btH = bottomTableBottom - btTop;
  const rowTopH = btH * 0.4;
  const rowBotH = btH - rowTopH;
  const leftW = W * 0.66;
  const rightW = W - leftW;
  const rightX = X0 + leftW;

  p.rect({ x: X0, y: btTop, w: leftW, h: rowTopH, border: LINE, lineWidth: LW });
  p.rect({ x: rightX, y: btTop, w: rightW, h: rowTopH, border: LINE, lineWidth: LW });
  p.rect({ x: X0, y: btTop + rowTopH, w: leftW, h: rowBotH, border: LINE, lineWidth: LW });
  p.rect({ x: rightX, y: btTop + rowTopH, w: rightW, h: rowBotH, border: LINE, lineWidth: LW });

  const inlineField = (label: string, value: string, x: number, yy: number, width: number, size = 6.6) => {
    const lw2 = p.widthOf(label, size, { bold: true });
    p.text(label, { x, y: yy, size, bold: true });
    p.paragraph(value ?? "", { x: x + lw2 + 1, y: yy, size, width: width - lw2 - 1, maxLines: 2 });
  };

  let by = btTop + 1.6;
  inlineField("Learner's Conduct & Behavior:", d.learner.conduct ?? "", X0 + 1.6, by, leftW - 3.2);
  by += 4.6;
  inlineField("Co-curricular Activities:", d.learner.co_curricular ?? "", X0 + 1.6, by, leftW - 3.2);

  const labelColW = 30;
  let cy2 = btTop + rowTopH + 1.6;
  const commentBlock = (label: string, value: string) => {
    p.text(label, { x: X0 + 1.6, y: cy2, size: 6.6, bold: true });
    const used = p.paragraph(value ?? "", {
      x: X0 + labelColW, y: cy2, size: 6.8, width: leftW - labelColW - 2, maxLines: 3,
    });
    cy2 += Math.max(used, 4.4) + 1.6;
  };
  commentBlock("Class Teacher's comment:", d.report?.class_teacher_comment ?? "");
  commentBlock("Head Teacher's comment:", d.report?.head_teacher_comment ?? "");

  const signature = (img: typeof classSig, name: string, role: string, boxY: number, boxH: number) => {
    const cx = rightX + rightW / 2;
    const sigW = rightW - 8;
    const sigH = Math.min(9, boxH - 10);
    if (img) p.image(img, { x: cx - sigW / 2, y: boxY + 1.2, w: sigW, h: sigH });
    const lineY = boxY + 1.2 + sigH + 0.6;
    p.line(cx - sigW / 2, lineY, cx + sigW / 2, lineY, { color: "#333333", width: 0.2, dashArray: [0.6, 0.6] });
    p.text(name.toUpperCase(), { x: rightX, y: lineY + 0.8, width: rightW, align: "center", size: 6.4, bold: true });
    p.text(role, { x: rightX, y: lineY + 3.6, width: rightW, align: "center", size: 6, italic: true });
  };
  signature(classSig, d.classTeacher?.full_name ?? "", "Class Teacher", btTop, rowTopH);
  signature(headSig, s.head_teacher_name ?? "", "Head Teacher", btTop + rowTopH, rowBotH);

  /* Term dates -------------------------------------------------------- */
  const dateSize = 6.8;
  const d1 = `Next Term Begins On: ${fmtDate(d.term.next_begins_on)}`;
  const d2 = `Ends On: ${fmtDate(d.term.ends_on ?? d.term.end_date)}`;
  p.text(d1, { x: X0, y: datesY, width: W / 2, align: "center", size: dateSize, bold: true });
  p.text(d2, { x: X0 + W / 2, y: datesY, width: W / 2, align: "center", size: dateSize, bold: true });

  /* Grading system ----------------------------------------------------- */
  p.text("SCHOOL GRADING SYSTEM", { x: X0, y: gradingTitleY, width: W, align: "center", size: 7.2, bold: true });
  const gTop = gradingTitleY + 4.4;
  const gCols = d.bands.length + 1;
  const gLabelW = 22;
  const gColW = (W - gLabelW) / Math.max(d.bands.length, 1);
  ["GRADE", "MARKS"].forEach((rowLabel, ri) => {
    const ry = gTop + ri * GRADING_ROW_H;
    p.rect({ x: X0, y: ry, w: gLabelW, h: GRADING_ROW_H, border: LINE, lineWidth: LW, fill: "#f3f4f6" });
    p.textInBox(rowLabel, { x: X0, y: ry, w: gLabelW, h: GRADING_ROW_H }, { size: 6.2, bold: true });
    d.bands.forEach((b, i) => {
      const x = X0 + gLabelW + i * gColW;
      p.rect({ x, y: ry, w: gColW, h: GRADING_ROW_H, border: LINE, lineWidth: LW });
      p.textInBox(ri === 0 ? b.grade : `${b.min_mark}-${b.max_mark}`, { x, y: ry, w: gColW, h: GRADING_ROW_H }, { size: 6, bold: ri === 0 });
    });
  });
  void gCols;

  /* Motto -------------------------------------------------------------- */
  if (s.motto) {
    p.text(String(s.motto), { x: X0, y: MOTTO_Y, width: W, align: "center", size: 7.4, bold: true, italic: true, color: "#1a2a52" });
  }

  /* Stamp (on top) ------------------------------------------------------ */
  if (stamp) {
    const size = 28 * Number(s.stamp_size ?? 1);
    const cx = (A4_W * Number(s.stamp_x ?? 75)) / 100;
    const cy = (A4_H * Number(s.stamp_y ?? 78)) / 100;
    p.image(stamp, { x: cx - size / 2, y: cy - size / 2, w: size, h: size }, { opacity: Number(s.stamp_opacity ?? 0.6) });
  }

  void INK;
  return pdf;
}

export async function primaryReportBlob(learnerId: string, termId: string): Promise<Blob> {
  const pdf = await buildPrimaryReportPdf(learnerId, termId);
  return bytesToPdfBlob(await pdf.save());
}

void DEFAULT_ORDER_FALLBACK;
