/** Learner-capacity grace evaluation shared by the dashboard and the offline desktop licence check. Mirrors billing__capacity_row in the database. */
export type CapacityState = "ok" | "approaching" | "grace" | "exceeded" | "upgrade_required";

export interface CapacityInput {
  activeLearners: number;
  licensed: number;
  graceLimit: number;
  /** When enrolment first went above the licensed capacity (ISO), if still above. */
  overSince: string | null;
  graceDays?: number;
  now?: Date;
}

export interface CapacityResult {
  state: CapacityState;
  overSince: string | null;
  graceEndsAt: string | null;
  remainingGraceDays: number | null;
  excess: number;
}

const DAY_MS = 86_400_000;

export function evaluateCapacity({ activeLearners, licensed, graceLimit, overSince, graceDays = 30, now = new Date() }: CapacityInput): CapacityResult {
  const excess = Math.max(0, activeLearners - licensed);
  if (activeLearners <= licensed) {
    return {
      state: activeLearners >= Math.ceil(licensed * 0.9) ? "approaching" : "ok",
      overSince: null, graceEndsAt: null, remainingGraceDays: null, excess: 0,
    };
  }
  const since = overSince ? new Date(overSince) : now;
  const ends = new Date(since.getTime() + graceDays * DAY_MS);
  const remainingGraceDays = Math.max(0, Math.ceil((ends.getTime() - now.getTime()) / DAY_MS));
  let state: CapacityState;
  if (activeLearners > graceLimit) state = "exceeded";
  else if (now.getTime() > ends.getTime()) state = "upgrade_required";
  else state = "grace";
  return { state, overSince: since.toISOString(), graceEndsAt: ends.toISOString(), remainingGraceDays, excess };
}

/** Whether a new active learner may be added (only blocks new enrolment, never existing records). */
export function canAddActiveLearner(input: CapacityInput): boolean {
  const next = evaluateCapacity({ ...input, activeLearners: input.activeLearners + 1 });
  return next.state !== "exceeded" && next.state !== "upgrade_required";
}
