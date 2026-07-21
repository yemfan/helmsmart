// Spreading a period's posts across real times. Pure date math, no I/O.
//
// Extracted from CloseBoss, where the original bug is worth stating because it
// is invisible until it fires: autopilot handed EVERY generated post
// `scheduled_for = now()`, so a whole week drained on a single publish tick —
// several posts to the same feed within minutes. It had never fired in
// production only because no account had autopilot enabled.

/** Posts per period when the owner hasn't chosen. */
export const DEFAULT_POSTS_PER_PERIOD = 3;

/** 16:00 UTC = 9am PT / noon ET — inside the workday on both US coasts. */
export const DEFAULT_PUBLISH_HOUR_UTC = 16;

export type SpreadOptions = {
  /** Posts per 7-day period. Clamped to 1-7. */
  postsPerPeriod?: number;
  /** Hour of day (UTC) to publish at. */
  hourUtc?: number;
  /** Treated as "now" — past slots collapse to it. Defaults to the real clock. */
  now?: Date;
};

/**
 * When the i-th auto-scheduled post of a period should publish.
 *
 * Days are DERIVED rather than listed — `floor(i * 7 / n)` gives Mon/Thu at 2,
 * Mon/Wed/Fri at 3, and every day at 7, with no lookup table to drift out of
 * sync with the cadence.
 *
 * Past times collapse to `now` (a mid-period generate, or a late worker run), so
 * a post is never silently dropped for being scheduled in the past. Beyond the
 * n-th post the schedule rolls into the following period rather than piling
 * several onto the last day.
 *
 * @param periodStart YYYY-MM-DD, the Monday (or whatever day anchors the period)
 * @param index       0-based position of this post within the period
 */
export function spreadPublishTime(
  periodStart: string,
  index: number,
  opts: SpreadOptions = {},
): string {
  const now = opts.now ?? new Date();
  const hour = opts.hourUtc ?? DEFAULT_PUBLISH_HOUR_UTC;
  const n = Math.min(
    7,
    Math.max(1, Math.floor(opts.postsPerPeriod ?? DEFAULT_POSTS_PER_PERIOD) || DEFAULT_POSTS_PER_PERIOD),
  );

  const offset = Math.floor(((index % n) * 7) / n) + 7 * Math.floor(index / n);
  const when = new Date(`${periodStart}T00:00:00Z`);
  when.setUTCDate(when.getUTCDate() + offset);
  when.setUTCHours(hour, 0, 0, 0);
  return (when.getTime() < now.getTime() ? now : when).toISOString();
}

/** Normalise a stored cadence to the supported 1-7, falling back to the default. */
export function normalizePostsPerPeriod(v: unknown): number {
  return typeof v === "number" && v >= 1 && v <= 7 ? v : DEFAULT_POSTS_PER_PERIOD;
}
