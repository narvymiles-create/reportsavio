import { supabase } from "@/integrations/supabase/client";
import type { Level } from "@/lib/pdf/template/registry";
import type { ReportDataSource } from "./reportDataSource";

export type SchoolTemplate = {
  id: string; school_id: string; level: string; name: string; file_path: string;
  is_active: boolean; page_count: number; field_names: unknown; created_at: string; section_map?: unknown;
};
export async function getActiveTemplate(level: Level): Promise<SchoolTemplate | null> {
  const { data: schoolId, error: contextError } = await supabase.rpc("current_user_school_id");
  if (contextError) throw contextError;
  if (!schoolId) return null;
  const { data, error } = await supabase.from("report_templates").select("*")
    .eq("school_id", schoolId).eq("level", level).eq("is_active", true).maybeSingle();
  if (error) throw error;
  return data;
}
export async function templateBytes(template: SchoolTemplate, source?: ReportDataSource) {
  if (source) {
    if (source.schoolId !== template.school_id) throw new Error("The template must belong to the current school.");
    return source.fileBytes("report-templates", template.file_path);
  }
  const { data, error } = await supabase.storage.from("report-templates").download(template.file_path);
  if (error) throw error;
  if (!data) throw new Error("The template file could not be loaded.");
  return new Uint8Array(await data.arrayBuffer());
}
/** Window event fired after a school changes its active template, so previews refresh immediately. */
export const REPORT_TEMPLATE_CHANGED = "report-template-changed";
