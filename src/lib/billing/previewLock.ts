/**
 * Whether a report preview must be watermarked and its Open/Download/Print locked.
 * - sampleOnly: blank artwork with no learner data → never locked.
 * - cleared: the database already allowed output for this preview → unlocked.
 * - watermark: per-card answer from the database quote, when the page has one.
 * - otherwise the school's active package decides; null while it is still being checked.
 */
export function resolvePreviewLock(o: { sampleOnly?: boolean; watermark?: boolean; entitled: boolean | null; cleared?: boolean }): boolean | null {
  if (o.sampleOnly || o.cleared) return false;
  if (o.watermark !== undefined) return o.watermark;
  if (o.entitled === null) return null;
  return !o.entitled;
}
