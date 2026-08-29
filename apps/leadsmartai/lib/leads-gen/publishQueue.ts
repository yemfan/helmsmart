/**
 * Queue-state rules for the publish-scheduled cron. Pure functions, kept out of
 * the route so they're testable — the route owns the DB calls, this owns the
 * decisions.
 *
 * `scheduled_posts.status` has one transient value, 'posting', which means "a
 * cron tick has claimed this row". The claim and the outcome are two separate
 * writes, so anything that kills the run in between — a function timeout, a
 * deploy, an OOM — leaves the row claimed forever:
 *
 *   - the first-time queue only selects status='scheduled', and
 *   - the retry queue only selects rows with next_attempt_at <= now(), which in
 *     PostgREST never matches a NULL.
 *
 * So a row in 'posting' with next_attempt_at NULL is invisible to both queues.
 * Ten of them accumulated silently. `reapDecision` is the third queue that
 * catches them.
 */

/** Attempts a post gets before it's marked permanently failed. */
export const MAX_ATTEMPTS = 3;

/**
 * How long a row may sit in 'posting' with no progress before we treat the run
 * that claimed it as dead. The cron ticks every 5 min; 15 min is three ticks,
 * comfortably longer than any single publish (the slowest is a video upload).
 */
export const STALE_POSTING_MS = 15 * 60 * 1000;

/**
 * A revived post still has to be worth sending. Past this age the content is
 * stale — a "new listing" card from four days ago is worse than no post — so
 * the reaper fails it visibly instead of publishing it late behind the agent's
 * back. Visibly failed is the point: the Marketing Hub can show it, a stuck
 * row shows nothing at all.
 */
export const MAX_REVIVE_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Exponential backoff. attempt_count is incremented BEFORE the publish, so:
 *   - attempt 1 (first try) succeeds → done
 *   - attempt 1 fails, attempt_count=1 → next try in 5 min
 *   - attempt 2 fails, attempt_count=2 → next try in 30 min
 *   - attempt 3 fails, attempt_count=3 → permanently failed
 */
export function nextRetryDelay(attemptCount: number): number | null {
  if (attemptCount === 1) return 5 * 60 * 1000;
  if (attemptCount === 2) return 30 * 60 * 1000;
  return null;
}

export type StalePostingRow = {
  id: string;
  attempt_count: number | null;
  /** ISO. When the post was meant to go out. */
  scheduled_for: string | null;
  /** ISO. Last time any tick wrote to the row — i.e. when it was claimed. */
  updated_at: string | null;
};

export type ReapDecision =
  | { action: "requeue" }
  | { action: "fail"; reason: string }
  | { action: "leave" };

/**
 * What to do with a row sitting in 'posting'. `leave` means it's plausibly
 * still being worked on by a live run — never touch those, or two ticks
 * double-post.
 */
export function reapDecision(row: StalePostingRow, now: number): ReapDecision {
  const claimedAt = row.updated_at ? Date.parse(row.updated_at) : NaN;
  // No usable timestamp: don't guess, and don't strand it either — the next
  // write gives it one. Leaving is the safe half of the ambiguity.
  if (!Number.isFinite(claimedAt)) return { action: "leave" };
  if (now - claimedAt < STALE_POSTING_MS) return { action: "leave" };

  const attempts = row.attempt_count ?? 0;
  if (attempts >= MAX_ATTEMPTS) {
    return {
      action: "fail",
      reason:
        "Publishing was interrupted and the post ran out of retries. Reschedule it if you still want it to go out.",
    };
  }

  const scheduledAt = row.scheduled_for ? Date.parse(row.scheduled_for) : NaN;
  if (Number.isFinite(scheduledAt) && now - scheduledAt > MAX_REVIVE_AGE_MS) {
    return {
      action: "fail",
      reason:
        "Publishing was interrupted and the post is now more than a day old, so it wasn't sent late. Reschedule it if you still want it to go out.",
    };
  }

  return { action: "requeue" };
}

/**
 * Wall-clock budget for one tick's publishing, in ms. Held under the route's
 * maxDuration so the loop stops on its own terms — a row released before the
 * platform kills us is one the next tick retries cleanly, instead of another
 * orphan for the reaper to find 15 minutes later.
 */
export const DRAIN_BUDGET_MS = 240 * 1000;

/** True when there isn't enough budget left to safely start another publish. */
export function outOfDrainBudget(startedAtMs: number, now: number): boolean {
  return now - startedAtMs >= DRAIN_BUDGET_MS;
}
