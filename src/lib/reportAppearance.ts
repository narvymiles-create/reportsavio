/** Semantic report colours. Missing overrides deliberately preserve each renderer's original palette. */
export const APPEARANCE_KEY = "report_appearance";
export const APPEARANCE_CHANGED = "report-appearance-changed";
export const COLOUR_GROUPS = [
  { title: "School branding", fields: [["schoolName", "School name"], ["schoolInfo", "School information"], ["reportTitle", "Report title"], ["pageBackground", "Page background"]] },
  { title: "Learner information", fields: [["infoLabel", "Field labels"], ["infoValue", "Learner values"], ["infoBackground", "Section background"], ["infoBorder", "Borders and separators"]] },
  { title: "Assessment tables & grading system", fields: [["tableTitle", "Table titles"], ["columnHeading", "Column headings"], ["rowHeading", "Row headings"], ["columnBackground", "Column heading background"], ["rowBackground", "Row heading background"], ["tableBackground", "Table body background"], ["tableBorder", "Borders and gridlines"], ["tableText", "Table contents"]] },
  { title: "Conduct, comments & dates", fields: [["conductLabel", "Conduct and activities labels"], ["conductText", "Conduct and activities values"], ["commentHeading", "Teacher comment headings"], ["commentText", "Comment text"], ["commentBackground", "Section background"], ["commentBorder", "Section borders"], ["designation", "Signatures and designation text"], ["dates", "Term dates and other information"]] },
] as const;
export type AppearanceRole = typeof COLOUR_GROUPS[number]["fields"][number][0];
export type ReportAppearance = Partial<Record<AppearanceRole, string>>;
export const DEFAULT_COLOURS: Record<AppearanceRole, string> = {
  schoolName: "#111111", schoolInfo: "#111111", reportTitle: "#111111", pageBackground: "#ffffff",
  infoLabel: "#111111", infoValue: "#111111", infoBackground: "#ffffff", infoBorder: "#222222",
  tableTitle: "#111111", columnHeading: "#111111", rowHeading: "#111111", columnBackground: "#f1f3f7", rowBackground: "#f1f3f7", tableBackground: "#ffffff", tableBorder: "#222222", tableText: "#111111",
  conductLabel: "#111111", conductText: "#111111", commentHeading: "#111111", commentText: "#111111", commentBackground: "#ffffff", commentBorder: "#222222", designation: "#111111", dates: "#111111",
};
export function defaultColours(level: string) { return level === "nursery" ? { ...DEFAULT_COLOURS, schoolName: "#1a2a52", commentText: "#1d4ed8", infoBorder: "#1f2937", tableBorder: "#1f2937", commentBorder: "#1f2937" } : DEFAULT_COLOURS; }
export function parseAppearance(value: unknown): ReportAppearance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.keys(DEFAULT_COLOURS).flatMap(key => {
    const colour = (value as Record<string, unknown>)[key];
    return typeof colour === "string" && /^#[0-9a-f]{6}$/i.test(colour) ? [[key, colour.toLowerCase()]] : [];
  }));
}
export function luminance(hex: string) {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
export function contrast(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
export function appearanceWarnings(value: ReportAppearance, level = "primary") {
  if (!Object.keys(value).length) return [];
  const c = { ...defaultColours(level), ...value };
  const pairs: [AppearanceRole, AppearanceRole][] = [["schoolName", "pageBackground"], ["schoolInfo", "pageBackground"], ["reportTitle", "pageBackground"], ["tableTitle", "pageBackground"], ["dates", "pageBackground"], ["infoLabel", "infoBackground"], ["infoValue", "infoBackground"], ["columnHeading", "columnBackground"], ["rowHeading", "rowBackground"], ["tableText", "tableBackground"], ["conductLabel", "commentBackground"], ["conductText", "commentBackground"], ["commentHeading", "commentBackground"], ["commentText", "commentBackground"], ["designation", "commentBackground"]];
  const label = (role: AppearanceRole) => COLOUR_GROUPS.flatMap(g => g.fields).find(f => f[0] === role)?.[1] ?? role;
  return [...pairs.filter(([text, bg]) => contrast(c[text], c[bg]) < 4.5).map(([text]) => `${label(text)} needs more contrast (minimum 4.5:1).`),
    ...(["pageBackground", "infoBackground", "tableBackground", "commentBackground"] as AppearanceRole[]).filter(k => luminance(c[k]) < 0.65).map(k => `${label(k)} must stay light to protect logos, signatures and watermarks.`)];
}
const preset = (accent: string, pale: string): ReportAppearance => ({ ...DEFAULT_COLOURS, schoolName: accent, reportTitle: accent, tableTitle: accent, infoLabel: accent, columnHeading: accent, rowHeading: accent, columnBackground: pale, rowBackground: pale, tableBorder: accent, infoBorder: accent, commentBorder: accent, commentHeading: accent, conductLabel: accent });
export const APPEARANCE_PRESETS = [{ name: "Forest", colours: preset("#14532d", "#ecfdf5") }, { name: "Burgundy", colours: preset("#7f1d1d", "#fff1f2") }, { name: "Graphite", colours: preset("#27272a", "#f4f4f5") }];
/** Resolve editable template data to a semantic colour; original static artwork is never altered. */
export function appearanceRoleForSource(source: string): AppearanceRole {
  if (source === "school.name") return "schoolName";
  if (source.startsWith("school.")) return "schoolInfo";
  if (source.includes("comment") || source.endsWith(".remark")) return "commentText";
  if (source.includes("teacher") || source.endsWith(".initials")) return "designation";
  if (source.includes("conduct") || source.includes("curricular")) return "conductText";
  if (source.startsWith("term.") || source === "academic.year") return "dates";
  if (source.startsWith("table.") || /^(bot|mid|eot|subject)\./.test(source)) return "tableText";
  return "infoValue";
}