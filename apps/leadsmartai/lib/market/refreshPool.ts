/**
 * Run a refresh plan with a time budget and a few workers at once.
 *
 * The arithmetic is the whole reason this exists. A market is one AI
 * web-search call, and two measured against production took 25.9s and 40.7s —
 * call it 33s. One at a time inside a 240s budget is roughly seven markets a
 * run, and the plan is 394 markets:
 *
 *     sequential, weekly    394 / 7.3  =  54 runs  =  ~54 weeks per cycle
 *     sequential, daily     394 / 7.3  =  54 runs  =  ~54 days per cycle
 *     4 at a time, daily    394 / 29.1 = 13.5 runs =  ~14 days per cycle
 *
 * `STALE_AFTER_DAYS` is 30, so the middle row still fails: moving the cron to
 * daily on its own leaves every market past the threshold it is measured
 * against. The schedule and the concurrency only work as a pair.
 *
 * Four, not more, because each call spends most of its life waiting on
 * `web_search` rather than on us, and the ceiling that matters is the API's
 * rate limit rather than this process. Four is the number that reaches a
 * fortnightly cycle; going wider buys days off a figure that is already inside
 * the threshold, at a rate-limit risk nobody has measured.
 *
 * Pure but for the clock, which is injectable, so the budget rule is covered
 * by tests instead of by reading this comment and believing it.
 */

export type PoolOutcome<T> = {
  item: T;
  /** False when the worker threw. The reason travels with it. */
  ok: boolean;
  error?: unknown;
};

export type PoolReport<T> = {
  /** Items a worker actually started. Never more than the plan. */
  processed: number;
  outcomes: PoolOutcome<T>[];
  /** Items the budget never reached. Above zero means the schedule is behind. */
  remaining: number;
};

export async function runPooled<T>(
  items: readonly T[],
  worker: (item: T) => Promise<unknown>,
  options: {
    concurrency: number;
    budgetMs: number;
    /** Injectable for tests; `Date.now` in production. */
    now?: () => number;
  },
): Promise<PoolReport<T>> {
  const now = options.now ?? Date.now;
  const concurrency = Math.max(1, Math.floor(options.concurrency));
  const budgetMs = Math.max(0, options.budgetMs);
  const startedAt = now();

  const outcomes: PoolOutcome<T>[] = [];
  let next = 0;

  /*
   * Workers share one index rather than getting a slice each. A slice would
   * hand every worker an equal COUNT, and the calls are not equal in length —
   * one slow market would leave its worker running alone while the others sat
   * finished. Pulling from a shared cursor keeps all four busy until the
   * budget stops them.
   */
  async function drain(): Promise<void> {
    for (;;) {
      /*
       * Check the budget before claiming, not after finishing. A worker that
       * starts at 239s of a 240s budget still runs its full call, which is why
       * the caller leaves headroom under the route's maxDuration.
       */
      if (now() - startedAt >= budgetMs) return;
      const index = next;
      if (index >= items.length) return;
      next += 1;

      const item = items[index] as T;
      try {
        await worker(item);
        outcomes.push({ item, ok: true });
      } catch (error) {
        outcomes.push({ item, ok: false, error });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => drain()));

  return {
    processed: outcomes.length,
    outcomes,
    remaining: Math.max(0, items.length - outcomes.length),
  };
}
