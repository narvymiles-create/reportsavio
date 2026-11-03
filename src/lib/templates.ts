/**
 * Report card template upload + manual field mapping.
 *
 * The existing Nursery and Primary report cards stay the defaults. A school
 * can optionally upload a fixed PDF template per education level and map
 * system/custom fields onto it; an active custom template applies to every
 * class, learner, term and academic year of its level.
 */
import { supabase } from "@/integrations/supabase/client";

export type TemplateLevel = "nursery" | "primary";

export type ReportTemplate = {
  id: string;
  school_id: string;
  level: TemplateLevel;
  name: string;
  file_path: string;
  page_width: number;
  page_height: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FieldMapping = {
  id: string;
  template_id: string;
  field_key: string;
  page: number;
  /** PDF points, bottom-left origin (pdf-lib coordinates). */
  x: number;
  y: number;
  width: number;
  height: number;
  font_size: number;
  align: "left" | "center" | "right";
};

export type CustomFieldType = "text" | "number" | "date" | "percentage" | "multiline";
export type CustomFieldScope = "school" | "learner";

export type CustomField = {
  id: string;
  template_id: string;
  label: string;
  field_type: CustomFieldType;
  description: string | null;
  scope: CustomFieldScope;
  sort_order: number;
};

export const CUSTOM_KEY_PREFIX = "custom:";
export const customKey = (fieldId: string) => `${CUSTOM_KEY_PREFIX}${fieldId}`;
export const isCustomKey = (key: string) => key.startsWith(CUSTOM_KEY_PREFIX);
export const customIdFromKey = (key: string) => key.slice(CUSTOM_KEY_PREFIX.length);

export type SystemFieldDef = {
  key: string;
  label: string;
  kind: "text" | "image" | "multiline";
};

/** System fields available for mapping, per education level. */
export const SYSTEM_FIELDS: Record<TemplateLevel, SystemFieldDef[]> = {
  primary: [
    { key: "school_name", label: "School Name", kind: "text" },
    { key: "school_location", label: "School Location", kind: "text" },
    { key: "school_contacts", label: "School Contacts (Tel/Email)", kind: "text" },
    { key: "motto", label: "School Motto", kind: "text" },
    { key: "logo", label: "School Logo", kind: "image" },
    { key: "photo", label: "Learner Photo", kind: "image" },
    { key: "learner_name", label: "Learner Name", kind: "text" },
    { key: "class", label: "Class", kind: "text" },
    { key: "stream", label: "Stream", kind: "text" },
    { key: "section", label: "Section", kind: "text" },
    { key: "house", label: "House", kind: "text" },
    { key: "age", label: "Age", kind: "text" },
    { key: "sex", label: "Sex", kind: "text" },
    { key: "reg_no", label: "Registration No. (LIN/Index/REG)", kind: "text" },
    { key: "pay_code", label: "Pay Code", kind: "text" },
    { key: "term_name", label: "Term", kind: "text" },
    { key: "year", label: "Year", kind: "text" },
    { key: "total", label: "Total Marks", kind: "text" },
    { key: "average", label: "Average", kind: "text" },
    { key: "aggregate", label: "Aggregate", kind: "text" },
    { key: "division", label: "Division", kind: "text" },
    { key: "position", label: "Position", kind: "text" },
    { key: "conduct", label: "Conduct", kind: "text" },
    { key: "co_curricular", label: "Co-curricular Activities", kind: "text" },
    { key: "class_teacher_comment", label: "Class Teacher's Comment", kind: "multiline" },
    { key: "head_teacher_comment", label: "Head Teacher's Comment", kind: "multiline" },
    { key: "class_teacher_name", label: "Class Teacher's Name", kind: "text" },
    { key: "head_teacher_name", label: "Head Teacher's Name", kind: "text" },
    { key: "next_term_begins", label: "Next Term Begins", kind: "text" },
    { key: "term_ends", label: "Term Ends", kind: "text" },
  ],
  nursery: [
    { key: "school_name", label: "School Name", kind: "text" },
    { key: "motto", label: "School Motto", kind: "text" },
    { key: "logo", label: "School Logo", kind: "image" },
    { key: "photo", label: "Learner Photo", kind: "image" },
    { key: "learner_name", label: "Learner Name", kind: "text" },
    { key: "class", label: "Class", kind: "text" },
    { key: "stream", label: "Stream", kind: "text" },
    { key: "age", label: "Age", kind: "text" },
    { key: "sex", label: "Sex", kind: "text" },
    { key: "pay_code", label: "Pay Code", kind: "text" },
    { key: "term_name", label: "Term", kind: "text" },
    { key: "year", label: "Year", kind: "text" },
    { key: "class_teacher_comment", label: "Class Teacher's Comment", kind: "multiline" },
    { key: "head_teacher_comment", label: "Head Teacher's Comment", kind: "multiline" },
    { key: "class_teacher_name", label: "Class Teacher's Name", kind: "text" },
    { key: "head_teacher_name", label: "Head Teacher's Name", kind: "text" },
    { key: "next_term_begins", label: "Next Term Begins", kind: "text" },
    { key: "term_ends", label: "Term Ends", kind: "text" },
  ],
};

/** Default placement box (PDF points) per field kind. */
export function defaultBox(kind: "text" | "image" | "multiline" | CustomFieldType) {
  if (kind === "image") return { width: 80, height: 80 };
  if (kind === "multiline") return { width: 200, height: 48 };
  return { width: 140, height: 18 };
}

/** Formats a custom field value according to its type. */
export function formatFieldValue(value: string, type: CustomFieldType): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  if (type === "percentage") return v.endsWith("%") ? v : `${v}%`;
  if (type === "date") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    }
  }
  return v;
}

/* ------------------------------------------------------------------ CRUD */

export async function listTemplates(): Promise<ReportTemplate[]> {
  const { data, error } = await supabase
    .from("report_templates" as any)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as any) ?? [];
}

export async function getActiveTemplate(level: TemplateLevel): Promise<ReportTemplate | null> {
  const { data, error } = await supabase
    .from("report_templates" as any)
    .select("*")
    .eq("level", level)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return (data as any) ?? null;
}

export async function currentSchoolId(): Promise<string> {
  const { data, error } = await supabase.rpc("current_user_school_id" as any);
  if (error) throw error;
  if (!data) throw new Error("No school context for the current user");
  return data as unknown as string;
}

export async function uploadTemplate(level: TemplateLevel, name: string, file: File): Promise<ReportTemplate> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Only PDF templates are supported");
  }
  const schoolId = await currentSchoolId();
  const id = crypto.randomUUID();
  const path = `${schoolId}/${id}/${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const { error: upErr } = await supabase.storage.from("report-templates").upload(path, file, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) throw upErr;

  // Read the real page dimensions so mapping coordinates stay true.
  let pageWidth = 595.28;
  let pageHeight = 841.89;
  try {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(await file.arrayBuffer());
    const size = doc.getPages()[0]?.getSize();
    if (size) { pageWidth = size.width; pageHeight = size.height; }
  } catch { /* keep A4 defaults */ }

  const { data, error } = await supabase
    .from("report_templates" as any)
    .insert({ id, level, name: name.trim() || file.name, file_path: path, page_width: pageWidth, page_height: pageHeight })
    .select("*")
    .single();
  if (error) {
    await supabase.storage.from("report-templates").remove([path]);
    throw error;
  }
  return data as any;
}

export async function setTemplateActive(template: ReportTemplate, active: boolean): Promise<void> {
  if (active) {
    // One active custom template per level: deactivate siblings first.
    const { error } = await supabase
      .from("report_templates" as any)
      .update({ is_active: false })
      .eq("level", template.level)
      .eq("is_active", true);
    if (error) throw error;
  }
  const { error } = await supabase
    .from("report_templates" as any)
    .update({ is_active: active })
    .eq("id", template.id);
  if (error) throw error;
}

export async function replaceTemplateFile(template: ReportTemplate, file: File): Promise<void> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Only PDF templates are supported");
  }
  const path = `${template.school_id}/${template.id}/${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const { error: upErr } = await supabase.storage.from("report-templates").upload(path, file, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) throw upErr;
  let pageWidth = template.page_width;
  let pageHeight = template.page_height;
  try {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(await file.arrayBuffer());
    const size = doc.getPages()[0]?.getSize();
    if (size) { pageWidth = size.width; pageHeight = size.height; }
  } catch { /* keep previous dimensions */ }
  const { error } = await supabase
    .from("report_templates" as any)
    .update({ file_path: path, page_width: pageWidth, page_height: pageHeight })
    .eq("id", template.id);
  if (error) throw error;
  if (template.file_path !== path) {
    await supabase.storage.from("report-templates").remove([template.file_path]);
  }
}

export async function deleteTemplate(template: ReportTemplate): Promise<void> {
  const { error } = await supabase.from("report_templates" as any).delete().eq("id", template.id);
  if (error) throw error;
  await supabase.storage.from("report-templates").remove([template.file_path]);
}

export async function templateFileUrl(template: ReportTemplate): Promise<string> {
  const { data, error } = await supabase.storage
    .from("report-templates")
    .createSignedUrl(template.file_path, 3600);
  if (error || !data?.signedUrl) throw error ?? new Error("Could not read the template file");
  return data.signedUrl;
}

/* --------------------------------------------------------------- mappings */

export async function listMappings(templateId: string): Promise<FieldMapping[]> {
  const { data, error } = await supabase
    .from("template_field_mappings" as any)
    .select("*")
    .eq("template_id", templateId);
  if (error) throw error;
  return (data as any) ?? [];
}

export async function upsertMapping(mapping: Omit<FieldMapping, "id"> & { id?: string }): Promise<void> {
  const { error } = await supabase
    .from("template_field_mappings" as any)
    .upsert(mapping as any, { onConflict: "template_id,field_key,page" });
  if (error) throw error;
}

export async function deleteMapping(templateId: string, fieldKey: string, page: number): Promise<void> {
  const { error } = await supabase
    .from("template_field_mappings" as any)
    .delete()
    .eq("template_id", templateId)
    .eq("field_key", fieldKey)
    .eq("page", page);
  if (error) throw error;
}

/* ----------------------------------------------------------- custom fields */

export async function listCustomFields(templateId: string): Promise<CustomField[]> {
  const { data, error } = await supabase
    .from("template_custom_fields" as any)
    .select("*")
    .eq("template_id", templateId)
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return (data as any) ?? [];
}

export async function saveCustomField(field: Partial<CustomField> & { template_id: string; label: string }): Promise<void> {
  const { error = null } = field.id
    ? await supabase.from("template_custom_fields" as any).update({
        label: field.label, field_type: field.field_type, description: field.description, scope: field.scope,
      }).eq("id", field.id)
    : await supabase.from("template_custom_fields" as any).insert(field as any);
  if (error) throw error;
}

/** Removes a custom field, its mapping and its values — nothing else. */
export async function deleteCustomField(field: CustomField): Promise<void> {
  const { error } = await supabase.from("template_custom_fields" as any).delete().eq("id", field.id);
  if (error) throw error;
  await supabase
    .from("template_field_mappings" as any)
    .delete()
    .eq("template_id", field.template_id)
    .eq("field_key", customKey(field.id));
}

/* ----------------------------------------------------------------- values */

export type CustomValueRow = {
  field_id: string;
  learner_id: string | null;
  term_id: string | null;
  value: string;
};

export async function listCustomValues(fieldIds: string[]): Promise<CustomValueRow[]> {
  if (!fieldIds.length) return [];
  const { data, error } = await supabase
    .from("custom_field_values" as any)
    .select("field_id,learner_id,term_id,value")
    .in("field_id", fieldIds);
  if (error) throw error;
  return (data as any) ?? [];
}

export async function saveCustomValue(
  fieldId: string,
  value: string,
  learnerId: string | null,
  termId: string | null,
): Promise<void> {
  const { data: existing } = await supabase
    .from("custom_field_values" as any)
    .select("id")
    .eq("field_id", fieldId)
    .is("learner_id", learnerId)
    .is("term_id", termId)
    .maybeSingle();
  if ((existing as any)?.id) {
    const { error } = await supabase
      .from("custom_field_values" as any)
      .update({ value })
      .eq("id", (existing as any).id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("custom_field_values" as any)
      .insert({ field_id: fieldId, value, learner_id: learnerId, term_id: termId } as any);
    if (error) throw error;
  }
}

/**
 * Resolves a learner-specific value for the learner + term being generated:
 * a term-specific value wins over the learner's standing value.
 */
export function resolveLearnerValue(
  rows: CustomValueRow[],
  fieldId: string,
  learnerId: string,
  termId: string,
): string {
  const forField = rows.filter((r) => r.field_id === fieldId && r.learner_id === learnerId);
  const termRow = forField.find((r) => r.term_id === termId);
  if (termRow) return termRow.value;
  const standing = forField.find((r) => r.term_id == null);
  return standing?.value ?? "";
}

export function resolveSchoolValue(rows: CustomValueRow[], fieldId: string): string {
  return rows.find((r) => r.field_id === fieldId && r.learner_id == null)?.value ?? "";
}
