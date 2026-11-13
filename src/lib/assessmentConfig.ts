// School-configured Primary assessment structure. Stored per school in system_settings
// (key PRIMARY_ASSESSMENT_KEY). Legacy assessments map to marks.bot/mid/eot; others to assessment_marks.
import { computeTotal } from "./grading";

export const PRIMARY_ASSESSMENT_KEY = "primary_assessments";
export type LegacyExam = "bot" | "mid" | "eot";
export type Assessment = { id: string; name: string; maxMarks: number; weight: number | null; active: boolean; onReport: boolean };
export type FinalMethod = "current" | "eot_only" | "average" | "weighted";
export type Arrangement = "separate" | "merged" | "merged_final";
export type ReportTable = { heading: string; assessmentIds: string[] };
export type AssessmentConfig = { assessments: Assessment[]; method: FinalMethod; finalIds: string[]; arrangement: Arrangement; tables: ReportTable[]; finalHeading: string };

export const LEGACY_IDS: LegacyExam[] = ["bot", "mid", "eot"];
export const isLegacy = (id: string): id is LegacyExam => (LEGACY_IDS as string[]).includes(id);

export const DEFAULT_ASSESSMENT_CONFIG: AssessmentConfig = {
  assessments: [
    { id: "bot", name: "Beginning of Term", maxMarks: 100, weight: null, active: true, onReport: true },
    { id: "mid", name: "Mid-Term", maxMarks: 100, weight: null, active: true, onReport: true },
    { id: "eot", name: "End of Term", maxMarks: 100, weight: null, active: true, onReport: true },
  ],
  method: "current", finalIds: ["bot", "mid", "eot"], arrangement: "separate", tables: [], finalHeading: "Final Results",
};

export function normaliseConfig(raw: unknown): AssessmentConfig {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<AssessmentConfig>;
  const list = Array.isArray(v.assessments) && v.assessments.length ? v.assessments : DEFAULT_ASSESSMENT_CONFIG.assessments;
  const assessments = list.filter(a => a && typeof a.id === "string").map(a => ({
    id: a.id, name: String(a.name ?? a.id), maxMarks: Number(a.maxMarks) > 0 ? Number(a.maxMarks) : 100,
    weight: a.weight == null || a.weight === ("" as any) ? null : Number(a.weight), active: a.active !== false, onReport: a.onReport !== false,
  }));
  const ids = new Set(assessments.map(a => a.id));
  return {
    assessments,
    method: (["current", "eot_only", "average", "weighted"] as const).includes(v.method as any) ? v.method! : "current",
    finalIds: (v.finalIds ?? DEFAULT_ASSESSMENT_CONFIG.finalIds).filter(id => ids.has(id)),
    arrangement: (["separate", "merged", "merged_final"] as const).includes(v.arrangement as any) ? v.arrangement! : "separate",
    tables: (v.tables ?? []).map(t => ({ heading: String(t.heading ?? ""), assessmentIds: (t.assessmentIds ?? []).filter(id => ids.has(id)) })),
    finalHeading: v.finalHeading ? String(v.finalHeading) : "Final Results",
  };
}

/** Assessments that open in Marks Entry. */
export const activeAssessments = (c: AssessmentConfig) => c.assessments.filter(a => a.active);
/** Assessments shown on the report card (active and selected). */
export const reportAssessments = (c: AssessmentConfig) => c.assessments.filter(a => a.active && a.onReport);

/** Tables to draw, in order. Separate = one per report assessment; merged = configured tables (or all in one). */
export function reportTables(c: AssessmentConfig): ReportTable[] {
  const shown = reportAssessments(c);
  if (c.arrangement === "separate") return shown.map(a => ({ heading: a.name, assessmentIds: [a.id] }));
  const allowed = new Set(shown.map(a => a.id));
  const tables = c.tables.map(t => ({ ...t, assessmentIds: t.assessmentIds.filter(id => allowed.has(id)) })).filter(t => t.assessmentIds.length);
  return tables.length ? tables : [{ heading: "Assessment Results", assessmentIds: shown.map(a => a.id) }];
}

export function slugAssessmentId(name: string, taken: string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "assessment";
  let id = base, n = 2;
  while (taken.includes(id) || isLegacy(id)) id = `${base}_${n++}`;
  return id;
}

/** Problems that block saving or calculating. Empty array = valid. */
export function validateConfig(c: AssessmentConfig): string[] {
  const errors: string[] = [];
  const names = c.assessments.map(a => a.name.trim().toLowerCase());
  if (!c.assessments.length) errors.push("Add at least one assessment.");
  if (names.some(n => !n)) errors.push("Every assessment needs a name.");
  if (new Set(names).size !== names.length) errors.push("Assessment names must be unique.");
  if (c.assessments.some(a => !(a.maxMarks > 0))) errors.push("Maximum marks must be greater than 0.");
  const byId = new Map(c.assessments.map(a => [a.id, a]));
  const finals = c.finalIds.map(id => byId.get(id)).filter((a): a is Assessment => !!a && a.active);
  if (c.method === "eot_only" && !byId.get("eot")?.active) errors.push("End-of-Term only needs the End of Term assessment to be active.");
  if (c.method === "current" && !byId.get("eot")?.active) errors.push("The standard calculation needs the End of Term assessment to be active.");
  if ((c.method === "average" || c.method === "weighted") && !finals.length) errors.push("Choose at least one active assessment for the final result.");
  if (c.method === "weighted") {
    if (finals.some(a => a.weight == null || !(a.weight > 0))) errors.push("Give every assessment in the final result a percentage above 0.");
    else {
      const sum = finals.reduce((s, a) => s + (a.weight ?? 0), 0);
      if (Math.abs(sum - 100) > 0.01) errors.push(`Final-result percentages must add up to 100 (currently ${Math.round(sum * 100) / 100}).`);
    }
  }
  if (c.arrangement !== "separate") {
    const t = c.tables.filter(x => x.assessmentIds.length);
    if (c.tables.length && !t.length) errors.push("Choose assessments for at least one table.");
    if (c.tables.some(x => !x.heading.trim())) errors.push("Every table needs a heading.");
  }
  return errors;
}

/** Final subject mark (0–100 scale) for one subject from its assessment marks. Null when it cannot be calculated. */
export function finalMark(c: AssessmentConfig, marks: Record<string, number | null | undefined>): number | null {
  const val = (id: string) => { const m = marks[id]; return m == null || Number.isNaN(Number(m)) ? null : Number(m); };
  const pct = (a: Assessment) => { const m = val(a.id); return m == null ? null : (m / a.maxMarks) * 100; };
  const round = (n: number) => Math.round(n * 100) / 100;
  if (c.method === "current") return computeTotal(val("bot"), val("mid"), val("eot"));
  if (c.method === "eot_only") return val("eot");
  const finals = c.finalIds.map(id => c.assessments.find(a => a.id === id)).filter((a): a is Assessment => !!a && a.active);
  if (!finals.length) return null;
  if (c.method === "average") {
    const parts = finals.map(pct).filter((n): n is number => n != null);
    return parts.length ? round(parts.reduce((s, n) => s + n, 0) / parts.length) : null;
  }
  // Weighted: every weighted assessment must have a mark; no silent re-weighting.
  if (validateConfig(c).length) return null;
  let total = 0;
  for (const a of finals) { const p = pct(a); if (p == null) return null; total += p * (a.weight! / 100); }
  return round(total);
}
