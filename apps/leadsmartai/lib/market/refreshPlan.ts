/**
 * Which markets the weekly refresh should touch, and in what order.
 *
 * The refresh used to walk TRAFFIC_CITIES — a hardcoded list of 117 metros
 * behind the programmatic SEO pages — and nothing else. Those 117 were
 * immaculate. But `city_market_data` had 394 rows, because `getCityData`
 * writes one for any market an agent actually asks about, and none of the
 * other 277 was ever refreshed by anything:
 *
 *     in TRAFFIC_CITIES      117 rows   117 fresh within 30d    0 stale
 *     not in TRAFFIC_CITIES  277 rows     0 fresh within 30d  267 stale 90d+
 *
 * Zero. Not a slow drift — those rows were written once and abandoned. The
 * cities an agent looks up are, by definition, the ones they work in, so the
 * data most likely to be quoted to a seller was the data guaranteed to rot.
 *
 * So the plan is built from the TABLE as well as the seed list, oldest first.
 *
 * OLDEST FIRST IS THE POINT. Each entry costs an AI web-search call, and 394
 * of them will not fit in one function invocation. A run that always started
 * at the top of the same list would refresh the same prefix forever and never
 * reach the tail — which is a slower version of the bug being fixed. Ordering
 * by staleness makes the work rotate: whatever a budget-limited run leaves
 * behind is the oldest thing next week, so coverage drains rather than
 * stalling, and a partial run is still progress.
 *
 * AGE ALONE TURNED OUT NOT TO BE ENOUGH, for two reasons.
 *
 * The 116 seed metros were stamped 31 August by the failed-fetch path that
 * #1502 removed, so by age they are the FRESHEST placeholders in the table and
 * sort behind 227 rows from April — about eight days before Los Angeles or
 * Houston is touched. Their problem was never that they are old. It is that
 * they have never been measured, and age cannot see that.
 *
 * And a market that CANNOT be measured never moves. Athens and Bluewater have
 * no published market data, so they fail every time, keep their April stamp
 * under #1502, and are retried every single run forever.
 *
 * So the order is: never measured before measured, metros before the rest
 * within that, then least-recently-ATTEMPTED. Each part earns its place —
 *
 *   - "never measured" is what actually distinguishes a placeholder, and it
 *     LAPSES the moment a market is measured. A permanent metro priority would
 *     refresh the same 116 every cycle and starve the other 257, which is the
 *     bug this file already exists to prevent;
 *   - "attempted" rather than "fetched" is what stops a market with no data
 *     sitting at the head of the queue forever: trying Athens moves it to the
 *     back of its tier, so it costs one call a cycle instead of one a run.
 */

export type MarketKey = { city: string; state: string };

/** A row already in `city_market_data`. */
export type ExistingMarket = MarketKey & {
  /** ISO timestamp, or null for a row that has somehow never been stamped. */
  lastFetchedAt: string | null;
  /** When a refresh last TRIED, success or not. Falls back to lastFetchedAt. */
  lastAttemptedAt?: string | null;
  /** The row's source; only `ai_web_search` counts as measured. */
  source?: string | null;
};

export type RefreshTarget = MarketKey & {
  /** Whole days since this market was refreshed; null when never. */
  ageDays: number | null;
  /** Whole days since it was last tried; null when never. */
  attemptAgeDays: number | null;
  /** True when it exists only in the seed list, with no row yet. */
  seedOnly: boolean;
  /** False until a real lookup has landed on it. */
  measured: boolean;
  /** In TRAFFIC_CITIES: a market the SEO pages and agents actually ask about. */
  isMetro: boolean;
};

const norm = (m: MarketKey) => `${m.city.trim().toLowerCase()}|${m.state.trim().toUpperCase()}`;

/**
 * Merge the seed list with what the table actually holds, worst first.
 *
 * A market with no row and a market with no timestamp both sort ahead of every
 * dated one: "never refreshed" is the worst case, so it goes first. Ties break
 * on name purely so the order is deterministic and a test can assert it.
 */
export function planRefreshTargets(
  seed: MarketKey[],
  existing: ExistingMarket[],
  now: Date = new Date(),
): RefreshTarget[] {
  const byKey = new Map<string, RefreshTarget>();
  const metros = new Set(seed.map((m) => norm(m)));

  const daysSince = (iso: string | null | undefined): number | null => {
    if (!iso) return null;
    const t = new Date(iso);
    if (Number.isNaN(t.getTime())) return null;
    return Math.max(0, Math.floor((now.getTime() - t.getTime()) / 86_400_000));
  };

  for (const m of seed) {
    if (!m.city?.trim() || !m.state?.trim()) continue;
    byKey.set(norm(m), {
      city: m.city.trim(),
      state: m.state.trim().toUpperCase(),
      ageDays: null,
      attemptAgeDays: null,
      seedOnly: true,
      measured: false,
      isMetro: true,
    });
  }

  for (const row of existing) {
    if (!row.city?.trim() || !row.state?.trim()) continue;
    const key = norm(row);
    // A row wins over the seed entry for the same market: it carries the real
    // age, and the seed's `null` would otherwise claim it was never refreshed.
    byKey.set(key, {
      city: row.city.trim(),
      state: row.state.trim().toUpperCase(),
      ageDays: daysSince(row.lastFetchedAt),
      /*
       * Fall back to the fetch stamp when a row predates the attempt column.
       * Treating those as never-attempted would send every one of them to the
       * front at once and lose the ordering the backfill exists to preserve.
       */
      attemptAgeDays: daysSince(row.lastAttemptedAt ?? row.lastFetchedAt),
      seedOnly: false,
      measured: row.source === "ai_web_search",
      isMetro: metros.has(key),
    });
  }

  /** Nulls first: never attempted is worse than attempted long ago. */
  const byAge = (a: number | null, b: number | null) => {
    if (a === null && b === null) return 0;
    if (a === null) return -1;
    if (b === null) return 1;
    return b - a;
  };

  return [...byKey.values()].sort((a, b) => {
    // Tier 1: never measured. Lapses on the first successful lookup, so this
    // cannot become a permanent priority that starves everything else.
    if (a.measured !== b.measured) return a.measured ? 1 : -1;
    // Tier 2, among the unmeasured: the markets someone actually asks about.
    if (!a.measured && a.isMetro !== b.isMetro) return a.isMetro ? -1 : 1;
    // Tier 3: least recently TRIED, so a market that cannot be measured drops
    // to the back of its tier instead of being retried every run.
    const attempted = byAge(a.attemptAgeDays, b.attemptAgeDays);
    if (attempted !== 0) return attempted;
    return norm(a) < norm(b) ? -1 : 1;
  });
}
