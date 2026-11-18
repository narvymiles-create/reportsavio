/**
 * Detects a wrong device clock from a sign-in token handed to the app.
 * A token the server just issued or renewed can never already be expired, nor
 * be issued in the future. If the device clock says otherwise, the clock is
 * wrong: every new sign-in looks expired, the app keeps renewing it until the
 * server refuses, and the user is signed out ("Please sign in again").
 */
export const CLOCK_SKEW_LIMIT_SECONDS = 5 * 60;

export function tokenTimes(token: string | null | undefined): { iat: number; exp: number } | null {
  const part = token?.split(".")[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
    const { iat, exp } = JSON.parse(json) ?? {};
    return Number.isFinite(iat) && Number.isFinite(exp) ? { iat: Number(iat), exp: Number(exp) } : null;
  } catch {
    return null;
  }
}

/** True when the device clock contradicts a token the server has just handed out. */
export function deviceClockWrong(token: string | null | undefined, nowMs: number = Date.now()): boolean {
  const t = tokenTimes(token);
  if (!t) return false;
  const now = nowMs / 1000;
  return now > t.exp + CLOCK_SKEW_LIMIT_SECONDS || now < t.iat - CLOCK_SKEW_LIMIT_SECONDS;
}
