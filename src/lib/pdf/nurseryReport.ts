/**
 * Nursery report card — rendered natively with pdf-lib.
 * Mirrors NurseryReportSheet / NurseryReportSheet.css geometry.
 */
import { PDFDocument } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import { nurserySignedUrl } from "@/lib/nurseryStorage";
import { A4_H, A4_W, Painter, embedImage, loadFonts, mm, bytesToPdfBlob } from "./core";
import { drawBorder } from "./borders";

type Any = Record<string, any>;

const M = 12;
const X0 = M;
const W = A4_W - M * 2;
const LINE = "#1f2937";
const LW = 0.22;

const fmtDate = (d?: string | null) => {
  if (!d) return "";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
};

async function signed(bucket: string, path: string | null | undefined) {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function loadNurseryData(learnerId: string, termId: string) {
  const { data: settingsRows } = await supabase
    .from("system_settings" as any).select("key,value")
    .in("key", ["border_style", "learner_fields"]);
  const sMap: Any = {};
  ((settingsRows as Any[]) ?? []).forEach((r) => { sMap[r.key] = r.value; });
  const borderStyle: string = typeof sMap.border_style === "string" ? sMap.border_style : "double";
  const showPayCode = !!sMap.learner_fields?.pay_code;

  const { data: school } = await supabase.from("school_info" as any).select("*")
    .eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const s = school as Any;

  const { data: learner } = await supabase.from("nursery_learners" as any).select("*").eq("id", learnerId).maybeSingle();
  if (!learner) throw new Error("Learner not found");
  const l = learner as Any;

  let cls: Any | null = null, stream: Any | null = null, classTeacher: Any | null = null;
  let classSigPath: string | null = null;
  if (l.class_id) {
    cls = (await supabase.from("nursery_classes" as any).select("*").eq("id", l.class_id).maybeSingle()).data as Any;
    classSigPath = cls?.class_signature_path ?? null;
    if (cls?.class_teacher_id) {
      classTeacher = (await supabase.from("teachers" as any).select("*").eq("id", cls.class_teacher_id).maybeSingle()).data as Any;
      if (!classSigPath) classSigPath = classTeacher?.signature_path ?? null;
    }
  }
  if (l.stream_id) stream = (await supabase.from("nursery_streams" as any).select("*").eq("id", l.stream_id).maybeSingle()).data as Any;

  const { data: term } = await supabase.from("terms" as any).select("*").eq("id", termId).maybeSingle();
  const { data: areasRaw } = await supabase.from("nursery_learning_areas" as any).select("*").order("sort_order");
  const areas = ((areasRaw as Any[]) ?? []);
  const areaImageUrls = await Promise.all(areas.map((a) => nurserySignedUrl(a.image_path)));
  const { data: colors } = await supabase.from("nursery_grade_colors" as any).select("grade,label,color").order("sort_order");
  const { data: ams } = await supabase.from("nursery_assessments" as any).select("*").eq("learner_id", learnerId).eq("term_id", termId);
  const assessments: Record<string, { grade: string | null; comment: string | null }> = {};
  ((ams as Any[]) ?? []).forEach((r) => { assessments[r.learning_area_id] = { grade: r.grade, comment: r.comment }; });
  const { data: rc } = await supabase.from("nursery_report_cards" as any).select("*").eq("learner_id", learnerId).eq("term_id", termId).maybeSingle();

  const headSigPath = s?.nursery_head_teacher_signature_path ?? s?.head_teacher_signature_path;
  const [logo, stamp, watermark, headSig, classSig, photo] = await Promise.all([
    signed("school-assets", s?.logo_path),
    signed("school-assets", s?.stamp_path),
    signed("school-assets", s?.watermark_path),
    signed("signatures", headSigPath),
    signed("signatures", classSigPath),
    nurserySignedUrl(l.photo_path),
  ]);

  return {
    school: s ?? {}, learner: l, cls, stream, classTeacher, term: term as Any,
    areas, areaImageUrls, colors: ((colors as Any[]) ?? []), assessments,
    report: {
      class_teacher_comment: (rc as Any)?.class_teacher_comment ?? "",
      head_teacher_comment: (rc as Any)?.head_teacher_comment ?? "",
    },
    borderStyle, showPayCode,
    assets: { logo, stamp, watermark, headSig, classSig, photo },
  };
}

export type NurseryData = Awaited<ReturnType<typeof loadNurseryData>>;

export async function buildNurseryReportPdf(learnerId: string, termId: string, doc?: PDFDocument): Promise<PDFDocument> {
  const d = await loadNurseryData(learnerId, termId);
  return renderNurseryReport(d, doc);
}

/** Draws one nursery report page onto a (new or existing) document. */
export async function renderNurseryReport(d: NurseryData, doc?: PDFDocument): Promise<PDFDocument> {
  const pdf = doc ?? (await PDFDocument.create());
  const page = pdf.addPage([mm(A4_W), mm(A4_H)]);
  const fonts = await loadFonts(pdf);
  const p = new Painter(page, fonts);
  const s: Any = d.school ?? {};

  const [logo, photo, stamp, watermark, classSig, headSig] = await Promise.all([
    embedImage(pdf, d.assets.logo),
    embedImage(pdf, d.assets.photo),
    embedImage(pdf, d.assets.stamp),
    embedImage(pdf, d.assets.watermark),
    embedImage(pdf, d.assets.classSig),
    embedImage(pdf, d.assets.headSig),
  ]);
  const areaImages = await Promise.all(d.areaImageUrls.map((u) => embedImage(pdf, u)));

  if (watermark && s.watermark_enabled !== false) {
    const scale = Number(s.watermark_scale ?? 1);
    const w = A4_W * 0.5 * scale;
    const h = w / (watermark.width / watermark.height);
    const cx = (A4_W * Number(s.watermark_x ?? 50)) / 100;
    const cy = (A4_H * Number(s.watermark_y ?? 50)) / 100;
    p.image(watermark, { x: cx - w / 2, y: cy - h / 2, w, h }, { opacity: Number(s.watermark_opacity ?? 0.15) });
  }

  drawBorder(p, d.borderStyle);

  /* Header ------------------------------------------------------------- */
  let y = 13;
  const headH = 34;
  const boxW = 26;
  p.rect({ x: X0, y, w: boxW, h: 24, border: LINE, lineWidth: LW });
  if (logo) p.image(logo, { x: X0 + 1, y: y + 1, w: boxW - 2, h: 22 });
  else p.textInBox("SCHOOL\nLOGO", { x: X0, y, w: boxW, h: 24 }, { size: 6, bold: true });

  const photoX = X0 + W - boxW;
  p.rect({ x: photoX, y, w: boxW, h: 30, border: LINE, lineWidth: LW });
  if (photo) p.image(photo, { x: photoX + 1, y: y + 1, w: boxW - 2, h: 28 });
  else p.textInBox("PHOTO", { x: photoX, y, w: boxW, h: 30 }, { size: 6.5, bold: true });

  const midX = X0 + boxW + 3;
  const midW = photoX - midX - 3;
  let ty = y;
  ty += p.text((s.name ?? "SCHOOL NAME").toUpperCase(), { x: midX, y: ty, width: midW, align: "center", size: 13, bold: true, color: "#1a2a52" });
  if (s.motto) ty += p.text(String(s.motto), { x: midX, y: ty, width: midW, align: "center", size: 6.8, italic: true, color: "#444444" });
  ty += 1;
  p.line(midX + midW * 0.15, ty, midX + midW * 0.85, ty, { color: "#1a2a52", width: 0.4 });
  ty += 1.6;
  ty += p.text(d.term ? `${(d.term.name ?? "").toUpperCase()} ASSESSMENT` : "TERM ASSESSMENT",
    { x: midX, y: ty, width: midW, align: "center", size: 8.6, bold: true });
  ty += 0.8;

  const field = (label: string, value: string, x: number, yy: number) => {
    const size = 7.2;
    const lw = p.widthOf(label, size, { bold: true });
    p.text(label, { x, y: yy, size, bold: true });
    p.text(value ?? "", { x: x + lw + 1, y: yy, size });
    return lw + 1 + p.widthOf(value ?? "", size);
  };
  field("Pupil's Name:", d.learner.full_name ?? "", midX, ty);
  ty += 4.4;
  const cols3 = midW / 3;
  field("Age:", d.learner.age != null ? String(d.learner.age) : "", midX, ty);
  field("Class:", d.cls?.name ?? "", midX + cols3, ty);
  field("Stream:", d.stream?.name ?? "", midX + cols3 * 2, ty);
  ty += 4.4;
  field("Sex:", d.learner.sex ?? "", midX, ty);
  if (d.showPayCode) field("Pay Code:", d.learner.pay_code ?? "", midX + cols3, ty);

  y = Math.max(y + headH, ty + 5);

  /* Bottom-pinned blocks ------------------------------------------------ */
  const MOTTO_Y = 283;
  const FOOTER_Y = MOTTO_Y - 6;
  const COMMENTS_H = 30;
  const commentsTop = FOOTER_Y - 2 - COMMENTS_H;
  const KEY_H = 6.5;
  const keyTop = commentsTop - 2 - KEY_H;

  /* Learning areas ------------------------------------------------------ */
  const areasTop = y;
  const areasH = keyTop - 2 - areasTop;
  const n = Math.max(d.areas.length, 1);
  const rowH = Math.max(6, Math.min(26, areasH / n));
  const imgW = Math.min(18, rowH * 1.3);
  const gradeW = 16;
  const colorMap = new Map<string, string>();
  d.colors.forEach((c) => colorMap.set(String(c.grade).toUpperCase(), c.color));

  d.areas.forEach((a, i) => {
    const ry = areasTop + i * rowH;
    if (ry + rowH > keyTop) return;
    p.rect({ x: X0, y: ry, w: W, h: rowH, border: LINE, lineWidth: LW });
    p.line(X0 + imgW, ry, X0 + imgW, ry + rowH, { color: LINE, width: LW });
    p.line(X0 + W - gradeW, ry, X0 + W - gradeW, ry + rowH, { color: LINE, width: LW });
    if (areaImages[i]) p.image(areaImages[i], { x: X0 + 0.8, y: ry + 0.8, w: imgW - 1.6, h: rowH - 1.6 });

    const textX = X0 + imgW + 2;
    const textW = W - imgW - gradeW - 4;
    p.text(a.name ?? "", { x: textX, y: ry + 1.2, size: 7.4, bold: true, width: textW });
    const comment = d.assessments[a.id]?.comment ?? "";
    if (comment) {
      p.paragraph(comment, { x: textX, y: ry + 5.4, size: 6.8, width: textW, maxLines: Math.max(1, Math.floor((rowH - 6) / 3)), color: "#1f2937" });
    }

    const grade = (d.assessments[a.id]?.grade ?? "").toUpperCase();
    if (grade) {
      const bg = colorMap.get(grade) ?? "#e5e7eb";
      const gx = X0 + W - gradeW + 2.5;
      const gh = Math.min(8, rowH - 2);
      p.rect({ x: gx, y: ry + (rowH - gh) / 2, w: gradeW - 5, h: gh, fill: bg, border: "#333333", lineWidth: 0.2 });
      p.textInBox(grade, { x: gx, y: ry + (rowH - gh) / 2, w: gradeW - 5, h: gh }, { size: 7.4, bold: true });
    }
  });

  /* Key ----------------------------------------------------------------- */
  let kx = X0 + 1;
  p.text("KEY", { x: kx, y: keyTop + 1.6, size: 7, bold: true });
  kx += 8;
  d.colors.forEach((c) => {
    p.rect({ x: kx, y: keyTop + 1, w: 6, h: 4.5, fill: c.color, border: "#333333", lineWidth: 0.2 });
    p.textInBox(String(c.grade), { x: kx, y: keyTop + 1, w: 6, h: 4.5 }, { size: 6 });
    kx += 7;
    const label = `- ${c.label}`;
    p.text(label, { x: kx, y: keyTop + 1.6, size: 6.6 });
    kx += p.widthOf(label, 6.6) + 4;
  });

  /* Comments ------------------------------------------------------------ */
  const halfW = W / 2;
  const commentCell = (x: number, title: string, body: string, img: typeof classSig, name: string) => {
    p.rect({ x, y: commentsTop, w: halfW, h: COMMENTS_H, border: LINE, lineWidth: LW });
    p.text(title, { x: x + 2, y: commentsTop + 1.6, size: 7, bold: true });
    p.paragraph(body ?? "", { x: x + 2, y: commentsTop + 5.6, size: 6.8, width: halfW - 4, maxLines: 4 });
    const signY = commentsTop + COMMENTS_H - 9;
    p.text("Sign:", { x: x + 2, y: signY + 4, size: 6.6, bold: true });
    const lineX1 = x + 11, lineX2 = x + halfW * 0.62;
    if (img) p.image(img, { x: lineX1, y: signY - 1.5, w: lineX2 - lineX1, h: 7 });
    p.line(lineX1, signY + 6.4, lineX2, signY + 6.4, { color: "#333333", width: 0.2 });
    p.text((name ?? "").toUpperCase(), { x: lineX2 + 1.5, y: signY + 4, size: 6.2, bold: true });
  };
  commentCell(X0, "Class teacher's Comment:", d.report.class_teacher_comment, classSig, d.classTeacher?.full_name ?? "");
  commentCell(X0 + halfW, "Head teacher's Comment:", d.report.head_teacher_comment, headSig,
    s.nursery_head_teacher_name ?? s.head_teacher_name ?? "");

  /* Footer + motto ------------------------------------------------------ */
  p.text(`Next term begins on: ${fmtDate(d.term?.next_begins_on)}`, { x: X0, y: FOOTER_Y, width: W / 2, align: "center", size: 7, bold: true });
  p.text(`Ends on: ${fmtDate(d.term?.ends_on ?? d.term?.end_date)}`, { x: X0 + W / 2, y: FOOTER_Y, width: W / 2, align: "center", size: 7, bold: true });
  if (s.motto) p.text(String(s.motto), { x: X0, y: MOTTO_Y, width: W, align: "center", size: 7.4, bold: true, italic: true, color: "#1a2a52" });

  if (stamp) {
    const size = 28 * Number(s.stamp_size ?? 1);
    const cx = (A4_W * Number(s.stamp_x ?? 75)) / 100;
    const cy = (A4_H * Number(s.stamp_y ?? 78)) / 100;
    p.image(stamp, { x: cx - size / 2, y: cy - size / 2, w: size, h: size }, { opacity: Number(s.stamp_opacity ?? 0.6) });
  }

  return pdf;
}

export async function nurseryReportBlob(learnerId: string, termId: string): Promise<Blob> {
  const pdf = await buildNurseryReportPdf(learnerId, termId);
  return bytesToPdfBlob(await pdf.save());
}
