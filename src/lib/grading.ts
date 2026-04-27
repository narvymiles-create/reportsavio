// Shared grading / division helpers used across marks entry and report cards.

export type GradeBand = {
  grade: string;
  points: number;
  min_mark: number;
  max_mark: number;
  remark: string | null;
};

export type DivisionRule = {
  division: string;
  min_aggregate: number;
  max_aggregate: number;
};

/** Compute total mark from BOT/MID/EOT. EOT is mandatory; the others are optional.
 *  When all three are present we average; otherwise we fall back to the EOT mark. */
export function computeTotal(bot: number | null, mid: number | null, eot: number | null): number | null {
  if (eot == null || isNaN(eot)) return null;
  const parts = [bot, mid, eot].filter((v): v is number => v != null && !isNaN(v));
  if (parts.length === 0) return null;
  const sum = parts.reduce((a, b) => a + b, 0);
  return Math.round((sum / parts.length) * 100) / 100;
}

export function gradeFor(total: number | null, bands: GradeBand[]): GradeBand | null {
  if (total == null) return null;
  return bands.find(b => total >= b.min_mark && total <= b.max_mark) ?? null;
}

export function calculateDivision(aggregate: number | null | undefined): string {
  const agg = Number(aggregate);
  if (!Number.isFinite(agg)) return "U";
  if (agg >= 4 && agg <= 12) return "1";
  if (agg >= 13 && agg <= 23) return "2";
  if (agg >= 24 && agg <= 30) return "3";
  if (agg >= 31 && agg <= 34) return "4";
  return "U";
}

export const divisionFor = calculateDivision;
