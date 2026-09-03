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
 */

export type MarketKey = { city: string; state: string };

/** A row already in `city_market_data`. */
export type ExistingMarket = MarketKey & {
  /** ISO timestamp, or null for a row that has somehow never been stamped. */
  lastFetchedAt: string | null;
};

export type RefreshTarget = MarketKey & {
  /** Whole days since this market was refreshed; null when never. */
  ageDays: number | null;
  /** True when it exists only in the seed list, with no row yet. */
  seedOnly: boolean;
};

const norm = (m: MarketKey) => `${m.city.trim().toLowerCase()}|${m.state.trim().toUpperCase()}`;

/**
 * Merge the seed list with what the table actually holds, oldest first.
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

  for (const m of seed) {
    if (!m.city?.trim() || !m.state?.trim()) continue;
    byKey.set(norm(m), {
      city: m.city.trim(),
      state: m.state.trim().toUpperCase(),
      ageDays: null,
      seedOnly: true,
    });
  }

  for (const row of existing) {
    if (!row.city?.trim() || !row.state?.trim()) continue;
    const t = row.lastFetchedAt ? new Date(row.lastFetchedAt) : null;
    const ageDays =
      t && !Number.isNaN(t.getTime())
        ? Math.max(0, Math.floor((now.getTime() - t.getTime()) / 86_400_000))
        : null;
    // A row wins over the seed entry for the same market: it carries the real
    // age, and the seed's `null` would otherwise claim it was never refreshed.
    byKey.set(norm(row), {
      city: row.city.trim(),
      state: row.state.trim().toUpperCase(),
      ageDays,
      seedOnly: false,
    });
  }

  return [...byKey.values()].sort((a, b) => {
    if (a.ageDays === null && b.ageDays === null) return norm(a) < norm(b) ? -1 : 1;
    if (a.ageDays === null) return -1;
    if (b.ageDays === null) return 1;
    if (a.ageDays !== b.ageDays) return b.ageDays - a.ageDays;
    return norm(a) < norm(b) ? -1 : 1;
  });
}
