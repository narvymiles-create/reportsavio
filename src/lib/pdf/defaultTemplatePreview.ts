import { supabase } from "@/integrations/supabase/client";
import { bytesToPdfBlob } from "./core";
import { loadPrimaryData, renderPrimaryBytes, type PrimaryData } from "./primaryReport";
import { loadNurseryData, renderNurseryReport, type NurseryData } from "./nurseryReport";
import type { Level } from "./template/registry";

/** Use the default renderer directly, never the school's active alternative. */
export async function defaultTemplatePreview(level: Level, schoolId: string): Promise<Blob> {
  const [{ data: learners, error: learnerError }, { data: terms, error: termError }] = await Promise.all([
    supabase.from(level === "primary" ? "learners" : "nursery_learners").select("id").eq("school_id", schoolId).order("full_name").limit(1),
    supabase.from("terms").select("*").eq("school_id", schoolId).order("is_current", { ascending: false }).limit(1),
  ]);
  if (learnerError) throw learnerError;
  if (termError) throw termError;
  const learner = learners?.[0];
  const term = terms?.[0];
  if (learner && term) {
    if (level === "primary") return bytesToPdfBlob(await renderPrimaryBytes(await loadPrimaryData(learner.id, term.id)));
    return bytesToPdfBlob(await (await renderNurseryReport(await loadNurseryData(learner.id, term.id))).save());
  }
  const [{ data: school }, { data: settings }, { data: bands }, { data: areas }, { data: colors }] = await Promise.all([
    supabase.from("school_info").select("*").eq("school_id", schoolId).eq("is_active", true).limit(1).maybeSingle(),
    supabase.from("system_settings").select("key,value").eq("school_id", schoolId),
    supabase.from("grading_scales").select("*").eq("school_id", schoolId).order("sort_order"),
    supabase.from("nursery_learning_areas").select("*").eq("school_id", schoolId).order("sort_order"),
    supabase.from("nursery_grade_colors").select("*").eq("school_id", schoolId).order("sort_order"),
  ]);
  const border = settings?.find(s => s.key === "border_style")?.value;
  const common = { school: school ?? {}, learner: { full_name: "" }, term: term ?? {}, stream: null, classTeacher: null,
    report: { class_teacher_comment: "", head_teacher_comment: "" }, borderStyle: typeof border === "string" ? border : "double",
    assets: { logo: null, photo: null, stamp: null, watermark: null, classSig: null, headSig: null } };
  if (level === "primary") {
    const data = { ...common, klass: null, bands: bands ?? [], subjects: [], marks: [], classSubjects: [], classMarks: [], classSize: 0,
      teachersById: {}, flags: { stream: true, house: true, section: true, pay_code: true, show_position: true }, order: [], templateSetting: null } as unknown as PrimaryData;
    return bytesToPdfBlob(await renderPrimaryBytes(data));
  }
  const data = { ...common, cls: null, areas: areas ?? [], areaImageUrls: [], colors: colors ?? [], assessments: {}, showPayCode: false } as unknown as NurseryData;
  return bytesToPdfBlob(await (await renderNurseryReport(data)).save());
}