/**
 * Report card template registry.
 *
 * The official uploaded designs ship with the app as CDN assets and are the
 * defaults for each education level. A school can point a level at its own
 * uploaded template by storing a URL (or storage path) in system_settings
 * under `report_template_primary` / `report_template_nursery`.
 */
import primaryAsset from "@/assets/templates/primary-default.pdf.asset.json";
import nurseryAsset from "@/assets/templates/nursery-default.pdf.asset.json";

export type Level = "primary" | "nursery";

export const DEFAULT_TEMPLATE_URL: Record<Level, string> = {
  primary: primaryAsset.url,
  nursery: nurseryAsset.url,
};

/**
 * Resolves the template URL for a level. `setting` is the raw system_settings
 * value; a string URL wins, anything else falls back to the built-in default.
 */
export function resolveTemplateUrl(level: Level, setting?: unknown): string {
  if (typeof setting === "string" && setting.trim()) return setting.trim();
  if (setting && typeof setting === "object") {
    const url = (setting as Record<string, unknown>).url;
    if (typeof url === "string" && url.trim()) return url.trim();
  }
  return DEFAULT_TEMPLATE_URL[level];
}
