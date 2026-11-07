import { supabase } from "@/integrations/supabase/client";
import type { Level } from "@/lib/pdf/template/registry";

export type SchoolTemplate = {
  id: string; school_id: string; level: string; name: string; file_path: string;
  is_active: boolean; page_count: number; field_names: unknown; created_at: string;
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
export async function templateBytes(template: SchoolTemplate) {
  const { data, error } = await supabase.storage.from("report-templates").download(template.file_path);
  if (error) throw error;
  if (!data) throw new Error("The template file could not be loaded.");
  return new Uint8Array(await data.arrayBuffer());
}