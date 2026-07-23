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

/** Hours between multiple posts placed on the SAME day. */
export const DEFAULT_SAME_DAY_STEP_HOURS = 3;

/** 0=Sunday … 6=Saturday, matching Date#getUTCDay. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const EVERY_DAY: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

/**
 * Coerce a stored day allow-list to valid, de-duplicated, ordered weekdays.
 * Anything empty or unusable means "no restriction" — a controller that saved
 * a broken list should post on the default cadence, not go silent.
 */
export function normalizeWeekdays(v: unknown): number[] {
  if (!Array.isArray(v)) return [...EVERY_DAY];
  const days = [...new Set(v.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort(
    (a, b) => a - b,
  );
  return days.length > 0 ? days : [...EVERY_DAY];
}

export type PublishPlanOptions = {
  /** How many posts to place. */
  count: number;
  /** Allowed weekdays (0=Sun…6=Sat). Empty/absent = every day. */
  days?: readonly number[];
  /** Cap on posts placed on any ONE day. Defaults to 1 (one per day). */
  maxPerDay?: number;
  /** First publish hour of the day, UTC. */
  hourUtc?: number;
  /** Gap between same-day posts, in hours. */
  hourStepUtc?: number;
  /** Treated as "now" — past slots collapse to it. */
  now?: Date;
};

/**
 * Place `count` posts on real times, honouring an explicit day allow-list and a
 * per-day cap.
 *
 * This is the controller-driven counterpart to `spreadPublishTime`, which
 * DERIVES days from the cadence and can only do one post per day. Here the
 * owner says "Mon/Wed/Fri, twice a day" and we lay the slots out accordingly,
 * rolling into following weeks when a period can't hold them all rather than
 * stacking the remainder onto the last day.
 *
 * Past slots collapse to `now` for the same reason as `spreadPublishTime`: a
 * mid-period generate must never silently drop a post for being in the past.
 */
export function planPublishTimes(
  periodStart: string,
  opts: PublishPlanOptions,
): string[] {
  const now = opts.now ?? new Date();
  const hour = Math.min(23, Math.max(0, Math.floor(opts.hourUtc ?? DEFAULT_PUBLISH_HOUR_UTC)));
  const step = Math.max(1, Math.floor(opts.hourStepUtc ?? DEFAULT_SAME_DAY_STEP_HOURS));
  const perDay = Math.max(1, Math.floor(opts.maxPerDay ?? 1));
  const count = Math.max(0, Math.floor(opts.count));
  const allowed = normalizeWeekdays(opts.days);

  const out: string[] = [];
  const base = new Date(`${periodStart}T00:00:00Z`);
  // Bounded so a pathological config can never spin: 53 weeks is far more than
  // any real cadence needs to place a period's posts.
  for (let week = 0; week < 53 && out.length < count; week++) {
    for (let d = 0; d < 7 && out.length < count; d++) {
      const day = new Date(base);
      day.setUTCDate(base.getUTCDate() + week * 7 + d);
      if (!allowed.includes(day.getUTCDay())) continue;
      for (let k = 0; k < perDay && out.length < count; k++) {
        const slot = new Date(day);
        slot.setUTCHours(Math.min(23, hour + k * step), 0, 0, 0);
        out.push((slot.getTime() < now.getTime() ? now : slot).toISOString());
      }
    }
  }
  return out;
}
