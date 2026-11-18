/**
 * Learner-capacity evaluation shared by the dashboard and the offline desktop licence check.
 * Mirrors billing__capacity_row in the database. The 10% Growth Allowance is PERMANENT:
 * no countdown, expiry or extra charge — only enrolment above the allowance needs an upgrade.
 */
export type CapacityState = "ok" | "approaching" | "allowance" | "exceeded";

export interface CapacityInput {
  activeLearners: number;
  licensed: number;
  /** Licensed capacity plus the permanent Growth Allowance (e.g. 150 → 165). */
  graceLimit: number;
  /** When enrolment first went above the licensed capacity (ISO), kept for information only. */
  overSince: string | null;
  /** Ignored: older licence certificates carry a grace period, but the allowance never expires. */
  graceDays?: number;
  now?: Date;
}

export interface CapacityResult {
  state: CapacityState;
  overSince: string | null;
  /** Learners above the purchased package (covered by the allowance while state is "allowance"). */
  excess: number;
  /** Active learners that can still be added before an upgrade is needed. */
  remaining: number;
}

export function evaluateCapacity({ activeLearners, licensed, graceLimit, overSince, now = new Date() }: CapacityInput): CapacityResult {
  const excess = Math.max(0, activeLearners - licensed);
  const remaining = Math.max(0, graceLimit - activeLearners);
  if (activeLearners <= licensed) {
    return { state: activeLearners >= Math.ceil(licensed * 0.9) ? "approaching" : "ok", overSince: null, excess: 0, remaining };
  }
  const since = overSince ?? now.toISOString();
  return { state: activeLearners > graceLimit ? "exceeded" : "allowance", overSince: since, excess, remaining };
}

/** Whether a new active learner may be added (only blocks new enrolment, never existing records). */
export function canAddActiveLearner(input: CapacityInput): boolean {
  return evaluateCapacity({ ...input, activeLearners: input.activeLearners + 1 }).state !== "exceeded";
}
