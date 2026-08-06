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
  fillTemplate, loadTemplateBytes, type Box, type TextValue, type TplDef, type ValueMap,
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
    subjects: subjects.slice(0, 7),
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

/**
 * The uploaded template has a fixed, locked grid: six subject columns in the
 * BOT/MID blocks and six rows in the EOT table. Nothing is cloned, shifted or
 * recalculated — values are stamped into the cells the design already defines.
 */
const COLS = ["ENG", "MATH", "SCI", "SST", "RE", "ICT"] as const;
type Col = typeof COLS[number];

const field = (name: string) => DEF.fields.find((f) => f.name === name);
const boxOf = (name: string): Box | undefined => {
  const f = field(name);
  return f ? (f.box as Box) : undefined;
};

const colKeyFor = (name: string): Col | null => {
  const n = (name ?? "").toUpperCase();
  if (n.includes("ENGLISH")) return "ENG";
  if (n.includes("MATH")) return "MATH";
  if (n.includes("SCIEN")) return "SCI";
  if (n.includes("SOCIAL") || n.includes("SST")) return "SST";
  if (n.includes("RELIG") || n.startsWith("R.E") || n === "RE" || n.includes("C.R.E") || n.includes("I.R.E")) return "RE";
  if (n.includes("COMPUT") || n.includes("ICT")) return "ICT";
  return null;
};

/** Maps the class subjects onto the template's fixed columns. */
function assignColumns(subjects: Any[]): { col: Col; subject: Any }[] {
  const taken = new Set<Col>();
  const out: { col: Col; subject: Any }[] = [];
  const leftovers: Any[] = [];
  subjects.forEach((s) => {
    const c = colKeyFor(s.name);
    if (c && !taken.has(c)) { taken.add(c); out.push({ col: c, subject: s }); }
    else leftovers.push(s);
  });
  leftovers.forEach((s) => {
    const free = COLS.find((c) => !taken.has(c));
    if (!free) return; // layout is locked — extra subjects are not drawn
    taken.add(free);
    out.push({ col: free, subject: s });
  });
  return out;
}

export function buildPrimaryValues(d: PrimaryData) {
  const c = computeAll(d);
  const s: Any = (d.school as Any) ?? {};
  const v: ValueMap = {};

  const header = boxOf("SCHOOL_NAME");
  const headerLine = (name: string, text: string, extra: Partial<TextValue> = {}) => {
    v[name] = { text, align: "center", box: header, vcenter: false, maxLines: 1, ...extra };
  };

  /* Header */
  headerLine("SCHOOL_NAME", (s.name ?? "").toUpperCase(), { bold: true });
  headerLine("SCHOOL_MOTTO", s.motto ?? "");
  v.SCHOOL_MOTTO_FOOTER = {
    text: s.motto ?? "", align: "center", maxLines: 1, vcenter: false, box: boxOf("SCHOOL_MOTTO_FOOTER"),
  };
  v.SCHOOL_ADDRESS = { text: s.location ?? "", maxLines: 1 };
  v.PO_BOX = { text: s.po_box ?? "", maxLines: 1 };
  v.TELEPHONE = { text: s.tel ?? "", maxLines: 1 };
  v.EMAIL = { text: s.email ?? "", maxLines: 1 };
  v.WEBSITE = { text: s.website ?? "", maxLines: 1 };
  v.TERM = { text: (d.term.name ?? "").replace(/term\s*/i, "").trim() || (d.term.name ?? ""), maxLines: 1 };
  v.YEAR = { text: String(d.term.year ?? ""), maxLines: 1 };

  /* Logo + learner photo — the cell is masked first so the static
     "SCHOOL LOGO" / "LEARNER'S PHOTO" labels disappear. */
  const logoBox = boxOf("SCHOOL_LOGO");
  if (logoBox) v.SCHOOL_LOGO = { image: d.assets.logo, box: inset(logoBox), mask: true };
  const photoBox = boxOf("STUDENT_PHOTO");
  if (photoBox) v.STUDENT_PHOTO = { image: d.assets.photo, box: inset(photoBox), mask: true };

  /* Learner info — single line, shrink to fit, never wrap. */
  const regValue = d.learner.active_reg_type === "LIN"
    ? d.learner.lin_no
    : d.learner.active_reg_type === "REG" ? d.learner.reg_no : d.learner.index_no;
  const info = (name: string, text: string) => { v[name] = { text, maxLines: 1 }; };
  info("STUDENT_NAME", d.learner.full_name ?? "");
  info("CLASS", d.klass?.name ?? "");
  info("STREAM", d.flags.stream ? (d.stream?.name ?? "") : "");
  info("SECTION", d.flags.section ? (d.learner.section ?? "") : "");
  info("HOUSE", d.flags.house ? (d.learner.house ?? "") : "");
  info("AGE", d.learner.age != null ? String(d.learner.age) : "");
  info("SEX", d.learner.sex ?? "");
  info("LIN", d.learner.lin_no ?? "");
  info("PAY_CODE", d.flags.pay_code ? (d.learner.pay_code ?? "") : "");
  info("ADM_NO", String(regValue ?? ""));

  /* BOT / MID / EOT grids */
  const assigned = assignColumns(d.subjects);

  (["BOT", "MOT"] as const).forEach((prefix) => {
    const phaseKey = prefix === "BOT" ? "bot" : "mid";
    COLS.forEach((col) => {
      v[`${prefix}_${col}_MARKS`] = { text: "", align: "center", maxLines: 1 };
      v[`${prefix}_${col}_GRADE`] = { text: "", align: "center", maxLines: 1 };
    });
    assigned.forEach(({ col, subject }) => {
      const raw = c.bySubject.get(subject.id)?.[phaseKey];
      const has = raw != null && raw !== "" && !isNaN(Number(raw));
      v[`${prefix}_${col}_MARKS`] = {
        text: has ? String(raw) : "", align: "center", maxLines: 1, box: boxOf(`${prefix}_${col}_MARKS`),
      };
      v[`${prefix}_${col}_GRADE`] = {
        text: has ? (gradeFor(Number(raw), d.bands)?.grade ?? "") : "",
        align: "center", maxLines: 1, box: boxOf(`${prefix}_${col}_GRADE`),
      };
    });
    const ph = prefix === "BOT" ? c.bot : c.mid;
    v[`${prefix}_TOTAL`] = { text: ph.total ? String(ph.total) : "", maxLines: 1, bold: true };
    v[`${prefix}_AVERAGE`] = { text: ph.avg ? String(ph.avg) : "", maxLines: 1, bold: true };
    v[`${prefix}_AGGREGATES`] = { text: ph.aggregateText, maxLines: 1, bold: true };
    v[`${prefix}_DIVISION`] = { text: ph.division, maxLines: 1, bold: true };
  });

  COLS.forEach((col) => {
    ["FULLMARKS", "MARKS", "GRADE", "REMARKS", "INITIALS"].forEach((cell) => {
      v[`EOT_${col}_${cell}`] = { text: "", align: "center", maxLines: 1 };
    });
  });
  assigned.forEach(({ col, subject }) => {
    const m = c.bySubject.get(subject.id);
    const raw = m?.eot;
    const has = raw != null && raw !== "" && !isNaN(Number(raw));
    const band = has ? gradeFor(Number(raw), d.bands) : null;
    const cell = (name: string, text: string) => {
      v[`EOT_${col}_${name}`] = { text, align: "center", maxLines: 1, box: boxOf(`EOT_${col}_${name}`) };
    };
    cell("FULLMARKS", String(subject.max_marks ?? 100));
    cell("MARKS", has ? String(raw) : "");
    cell("GRADE", band?.grade ?? "");
    cell("REMARKS", band?.remark ?? "");
    cell("INITIALS", (subject.subject_teacher_id && d.teachersById[subject.subject_teacher_id]?.initials) || m?.teacher_initials || "");
  });

  v.EOT_TOTAL = { text: c.eot.total ? String(c.eot.total) : "", maxLines: 1, bold: true };
  v.EOT_AVERAGE = { text: c.eot.avg ? String(c.eot.avg) : "", maxLines: 1, bold: true };
  v.EOT_AGGREGATES = {
    text: d.flags.show_position && c.eot.position && c.eot.classSize
      ? `${c.eot.aggregateText}  (POS ${c.eot.position}/${c.eot.classSize})`
      : c.eot.aggregateText,
    maxLines: 1, bold: true,
  };
  v.EOT_DIVISION = { text: c.eot.division, maxLines: 1, bold: true };

  /* Conduct, comments, signatures, dates */
  v.CONDUCT = { text: d.learner.conduct ?? "", maxLines: 1 };
  v.CO_CURRICULAR = { text: d.learner.co_curricular ?? "", maxLines: 1 };
  const commentBox = (name: string): Box | undefined => {
    const cf = field(name);
    return cf ? [cf.x - 1, cf.box[1], cf.box[2] - 2, cf.box[3]] : undefined;
  };
  v.CLASS_TEACHER_COMMENT = {
    text: d.report?.class_teacher_comment ?? "", maxLines: 2, box: commentBox("CLASS_TEACHER_COMMENT"),
  };
  v.HEADTEACHER_COMMENT = {
    text: d.report?.head_teacher_comment ?? "", maxLines: 2, box: commentBox("HEADTEACHER_COMMENT"),
  };
  v.CLASS_TEACHER_NAME = { text: (d.classTeacher?.full_name ?? "").toUpperCase(), maxLines: 1 };
  v.HEADTEACHER_NAME = { text: (s.head_teacher_name ?? "").toUpperCase(), maxLines: 1 };

  const sigBox = (name: string): Box | undefined => {
    const f = field(name);
    if (!f) return undefined;
    return [f.x, f.y - 3, Math.min(f.x + 70, f.box[2] - 2), f.y + 13];
  };
  v.CLASS_TEACHER_SIGNATURE = { image: d.assets.classSig, box: sigBox("CLASS_TEACHER_SIGNATURE") ?? [0, 0, 0, 0], mask: false };
  v.HEADTEACHER_SIGNATURE = { image: d.assets.headSig, box: sigBox("HEADTEACHER_SIGNATURE") ?? [0, 0, 0, 0], mask: false };

  v.TERM_END_DATE = { text: fmtDate(d.term.ends_on ?? d.term.end_date), maxLines: 1 };
  v.NEXT_TERM_DATE = { text: fmtDate(d.term.next_begins_on), maxLines: 1 };

  /* Grading scale row */
  const bandFor = (grade: string) => d.bands.find((b) => (b.grade ?? "").toUpperCase() === grade);
  ["D1", "D2", "C3", "C4", "C5", "C6", "P7", "P8", "F9"].forEach((g) => {
    const b = bandFor(g);
    v[`MARKS_${g}`] = { text: b ? `${b.min_mark}-${b.max_mark}` : "", align: "center", maxLines: 1, box: boxOf(`MARKS_${g}`) };
  });

  return { values: v };
}

function inset(box: Box, pad = 3): Box {
  return [box[0] + pad, box[1] + pad, box[2] - pad, box[3] - pad];
}

/** Renders the primary report card and returns the finished PDF bytes. */
export async function primaryReportBytes(learnerId: string, termId: string): Promise<Uint8Array> {
  const d = await loadPrimaryData(learnerId, termId);
  return renderPrimaryBytes(d);
}

export async function renderPrimaryBytes(d: PrimaryData): Promise<Uint8Array> {
  const url = resolveTemplateUrl("primary", d.templateSetting);
  const bytes = await loadTemplateBytes(url);
  const { values } = buildPrimaryValues(d);
  return fillTemplate(bytes, DEF, values);
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
