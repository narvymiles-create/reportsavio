/** Platform feature switches (managed by Skavio administrators in Feature Management). */
export type FeatureKey =
  | "learner_editing" | "marks_entry" | "report_comments" | "primary_reports" | "nursery_reports"
  | "download" | "bulk_download" | "print" | "bulk_print" | "marksheet_output"
  | "template_view" | "template_select" | "template_create" | "template_edit" | "custom_fields" | "appearance";

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  learner_editing: "Learner information editing", marks_entry: "Marks and assessments", report_comments: "Report card comments",
  primary_reports: "Primary report cards", nursery_reports: "Nursery report cards", download: "Download", bulk_download: "Bulk Download",
  print: "Print", bulk_print: "Bulk Print", marksheet_output: "Marksheet print and download", template_view: "Template viewing",
  template_select: "Template selection", template_create: "Template creation", template_edit: "Template editing",
  custom_fields: "Custom report fields", appearance: "Layout and colour customisation",
};

/** A school-specific setting wins; otherwise the global default; unknown features stay on. */
export function resolveFeature(globalEnabled: boolean | undefined, schoolOverride: boolean | null | undefined): boolean {
  if (schoolOverride === true || schoolOverride === false) return schoolOverride;
  return globalEnabled !== false;
}

export const featureOffText = (key: FeatureKey) => `${FEATURE_LABELS[key]} is turned off for your school by Skavio. Your existing data is kept.`;
