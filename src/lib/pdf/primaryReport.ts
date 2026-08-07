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
  fillTemplate, loadTemplateBytes, type Box, type TplDef, type TplField, type ValueMap,
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

/** The template grid is fixed: five subject rows, six EOT columns. */
const EOT_ROW_KEYS = ["ENG", "MATH", "SCI", "SST", "ICT"] as const;
const EOT_COLS = ["FULLMARKS", "MARKS", "GRADE", "REMARKS", "INITIALS"] as const;
const EOT_HEADERS = ["SUBJECTS", "FULL MARKS", "MARKS GOT", "GRADE", "REMARKS", "INITIALS"];

const field = (name: string) => DEF.fields.find((f) => f.name === name);

const boxOf = (name: string, fallback: Box): Box => {
  const f = field(name);
  return f ? (f.box as Box) : fallback;
};


export function buildPrimaryValues(d: PrimaryData) {
  const c = computeAll(d);
  const s: Any = (d.school as Any) ?? {};
  const v: ValueMap = {};

  /* Header — only fields that exist in the template are ever stamped, each one
     clipped to its own horizontal slot so they can never collide. */
  v.SCHOOL_NAME = { text: (s.name ?? "").toUpperCase(), align: "center", maxLines: 1 };
  v.SCHOOL_ADDRESS = { text: s.location ?? "", maxLines: 1 };
  v.PO_BOX = { text: s.po_box ?? "", maxLines: 1 };
  v.TELEPHONE = { text: s.tel ?? "", maxLines: 1 };
  v.EMAIL = { text: s.email ?? "", maxLines: 1 };
  v.WEBSITE = { text: s.website ?? "", maxLines: 1 };
  v.SCHOOL_MOTTO = { text: s.motto ?? "", align: "center", maxLines: 1 };
  v.TERM = (d.term.name ?? "").replace(/term\s*/i, "").trim() || (d.term.name ?? "");
  v.YEAR = String(d.term.year ?? "");

  /* Image cells: the placeholder area is erased first, then the picture is
     contained (never stretched) inside the box. */
  v.SCHOOL_LOGO = { image: d.assets.logo, box: [34, 770, 128, 814] };
  v.STUDENT_PHOTO = { image: d.assets.photo, box: [34, 722, 128, 768] };


  /* Learner info */
  const regValue = d.learner.active_reg_type === "LIN"
    ? d.learner.lin_no
    : d.learner.active_reg_type === "REG" ? d.learner.reg_no : d.learner.index_no;
  v.STUDENT_NAME = { text: d.learner.full_name ?? "", width: field("STUDENT_NAME")?.maxWidth };
  v.CLASS = d.klass?.name ?? "";
  v.STREAM = d.flags.stream ? (d.stream?.name ?? "") : "";
  v.SECTION = d.flags.section ? (d.learner.section ?? "") : "";
  v.HOUSE = d.flags.house ? (d.learner.house ?? "") : "";
  v.AGE = d.learner.age != null ? String(d.learner.age) : "";
  v.SEX = d.learner.sex ?? "";
  v.LIN = d.learner.lin_no ?? "";
  v.PAY_CODE = d.flags.pay_code ? (d.learner.pay_code ?? "") : "";
  v.ADM_NO = String(regValue ?? "");

  /* BOT / MID grids (5 subject columns in the template) */
  const gridSubjects = d.subjects.slice(0, 5);
  const COLS = ["ENG", "MATH", "SCI", "SST", "RE"];
  (["BOT", "MOT"] as const).forEach((prefix) => {
    const phaseKey = prefix === "BOT" ? "bot" : "mid";
    gridSubjects.forEach((s2, i) => {
      const col = COLS[i];
      const m = c.bySubject.get(s2.id);
      const raw = m?.[phaseKey];
      const has = raw != null && raw !== "" && !isNaN(Number(raw));
      v[`${prefix}_SUBJ_${i + 1}`] = { text: codeFor(s2.name), align: "center", bold: true };
      v[`${prefix}_${col}_MARKS`] = { text: has ? String(raw) : "", align: "center" };
      v[`${prefix}_${col}_GRADE`] = { text: has ? (gradeFor(Number(raw), d.bands)?.grade ?? "") : "", align: "center" };
    });
    for (let i = gridSubjects.length; i < 5; i++) {
      const col = COLS[i];
      v[`${prefix}_SUBJ_${i + 1}`] = "";
      v[`${prefix}_${col}_MARKS`] = "";
      v[`${prefix}_${col}_GRADE`] = "";
    }
    const ph = prefix === "BOT" ? c.bot : c.mid;
    v[`${prefix}_TOTAL`] = { text: summaryText("TOTAL MARKS", ph.total ? String(ph.total) : ""), align: "center", bold: true };
    v[`${prefix}_AVERAGE`] = { text: summaryText("AVERAGE", ph.avg ? String(ph.avg) : ""), align: "center", bold: true };
    v[`${prefix}_AGGREGATES`] = { text: summaryText("AGGREGATES", ph.aggregateText), align: "center", bold: true };
    v[`${prefix}_DIVISION`] = { text: summaryText("DIVISION", ph.division), align: "center", bold: true };
  });

  /* EOT table */
  EOT_HEADERS.forEach((h, i) => { v[`EOT_HDR_${i + 1}`] = { text: h, align: "center", bold: true }; });

  const extraCount = Math.max(0, d.subjects.length - 5);
  const { fields: extraFields, keys: extraKeys } = extraEotRows(extraCount);
  const rowKeys = [...EOT_ROW_KEYS, ...extraKeys];

  d.subjects.forEach((s2, i) => {
    const key = rowKeys[i];
    if (!key) return;
    const m = c.bySubject.get(s2.id);
    const raw = m?.eot;
    const has = raw != null && raw !== "" && !isNaN(Number(raw));
    const band = has ? gradeFor(Number(raw), d.bands) : null;
    v[`EOT_SUBJ_${i + 1}`] = { text: (s2.name ?? "").toUpperCase(), align: "center", maxLines: 1 };
    v[`EOT_${key}_FULLMARKS`] = { text: String(s2.max_marks ?? 100), align: "center" };
    v[`EOT_${key}_MARKS`] = { text: has ? String(raw) : "", align: "center" };
    v[`EOT_${key}_GRADE`] = { text: band?.grade ?? "", align: "center" };
    v[`EOT_${key}_REMARKS`] = { text: band?.remark ?? "", align: "center" };
    v[`EOT_${key}_INITIALS`] = {
      text: (s2.subject_teacher_id && d.teachersById[s2.subject_teacher_id]?.initials) || m?.teacher_initials || "",
      align: "center",
    };
  });
  for (let i = d.subjects.length; i < 5; i++) {
    const key = rowKeys[i];
    v[`EOT_SUBJ_${i + 1}`] = "";
    ["FULLMARKS", "MARKS", "GRADE", "REMARKS", "INITIALS"].forEach((c2) => { v[`EOT_${key}_${c2}`] = ""; });
  }

  v.EOT_TOTAL = { text: summaryText("TOTAL MARKS", c.eot.total ? String(c.eot.total) : ""), align: "center", bold: true };
  v.EOT_AVERAGE = { text: summaryText("AVERAGE", c.eot.avg ? String(c.eot.avg) : ""), align: "center", bold: true };
  v.EOT_AGGREGATES = {
    text: d.flags.show_position && c.eot.position && c.eot.classSize
      ? `AGG: ${c.eot.aggregateText}  POS: ${c.eot.position}/${c.eot.classSize}`
      : summaryText("AGGREGATES", c.eot.aggregateText),
    align: "center", bold: true,
  };
  v.EOT_DIVISION = { text: summaryText("DIVISION", c.eot.division), align: "center", bold: true };

  /* Conduct, comments, signatures, dates */
  v.CONDUCT = { text: d.learner.conduct ?? "", maxLines: 1 };
  v.CO_CURRICULAR = { text: d.learner.co_curricular ?? "", maxLines: 1 };
  v.CLASS_TEACHER_COMMENT = { text: d.report?.class_teacher_comment ?? "", maxLines: 3 };
  v.HEADTEACHER_COMMENT = { text: d.report?.head_teacher_comment ?? "", maxLines: 3 };
  v.CLASS_TEACHER_NAME = { text: (d.classTeacher?.full_name ?? "").toUpperCase(), maxLines: 1 };
  v.HEADTEACHER_NAME = { text: (s.head_teacher_name ?? "").toUpperCase(), maxLines: 1 };

  const ctSig = field("CLASS_TEACHER_SIGNATURE");
  if (ctSig) {
    v.CLASS_TEACHER_SIGNATURE = {
      image: d.assets.classSig,
      box: [ctSig.x, ctSig.y - 2, Math.min(ctSig.x + 120, 566), ctSig.y + 12],
    };
  }
  const htSig = field("HEADTEACHER_SIGNATURE");
  if (htSig) {
    v.HEADTEACHER_SIGNATURE = {
      image: d.assets.headSig,
      box: [htSig.x, htSig.y - 2, Math.min(htSig.x + 120, 566), htSig.y + 12],
    };
  }

  v.TERM_END_DATE = { text: fmtDate(d.term.ends_on ?? d.term.end_date), maxLines: 1 };
  v.NEXT_TERM_DATE = { text: fmtDate(d.term.next_begins_on), maxLines: 1 };

  /* Grading scale row */
  const bandFor = (grade: string) => d.bands.find((b) => (b.grade ?? "").toUpperCase() === grade);
  ["D1", "D2", "C3", "C4", "C5", "C6", "P7", "P8", "F9"].forEach((g) => {
    const b = bandFor(g);
    v[`MARKS_${g}`] = { text: b ? `${b.min_mark}-${b.max_mark}` : "", align: "center" };
  });

  const delta = extraCount * EOT_ROW_H;
  return {
    values: v,
    extraFields,
    shiftBelow: delta ? { cutY: EOT_BAND_BOTTOM, delta } : undefined,
  };
}

/** Renders the primary report card and returns the finished PDF bytes. */
export async function primaryReportBytes(learnerId: string, termId: string): Promise<Uint8Array> {
  const d = await loadPrimaryData(learnerId, termId);
  return renderPrimaryBytes(d);
}

export async function renderPrimaryBytes(d: PrimaryData): Promise<Uint8Array> {
  const url = resolveTemplateUrl("primary", d.templateSetting);
  const bytes = await loadTemplateBytes(url);
  const { values, extraFields, shiftBelow } = buildPrimaryValues(d);
  return fillTemplate(bytes, DEF, values, { extraFields, shiftBelow });
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
