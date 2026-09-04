import { describe, expect, it } from "vitest";

import { planRefreshTargets } from "../refreshPlan";

/**
 * What the weekly market refresh actually visits.
 *
 * The bug this replaces was not a crash or a slow drift. The refresh walked a
 * hardcoded list of 117 metros and nothing else, so in production:
 *
 *     in the seed list      117 rows   117 fresh within 30d    0 stale
 *     not in the seed list  277 rows     0 fresh within 30d  267 stale 90d+
 *
 * Zero of 277, ever. And those are precisely the markets an agent looked up —
 * the ones they work in — so the figures most likely to reach a seller were
 * the ones guaranteed to be months old.
 */
describe("planRefreshTargets", () => {
  const now = new Date("2026-09-03T00:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

  it("includes rows that are not in the seed list", () => {
    // The whole bug in one assertion: Walnut was in the table and invisible
    // to the refresh because it was not one of the 117.
    const plan = planRefreshTargets(
      [{ city: "Los Angeles", state: "CA" }],
      [{ city: "Walnut", state: "CA", lastFetchedAt: daysAgo(152) }],
      now,
    );
    expect(plan.map((t) => t.city)).toContain("Walnut");
  });

  it("puts the stalest market first", () => {
    const plan = planRefreshTargets(
      [],
      [
        { city: "Fresh", state: "CA", lastFetchedAt: daysAgo(2) },
        { city: "Ancient", state: "CA", lastFetchedAt: daysAgo(200) },
        { city: "Middling", state: "CA", lastFetchedAt: daysAgo(40) },
      ],
      now,
    );
    expect(plan.map((t) => t.city)).toEqual(["Ancient", "Middling", "Fresh"]);
  });

  it("puts a never-refreshed market ahead of every dated one", () => {
    // "No row yet" and "row with no timestamp" are both worse than any age.
    const plan = planRefreshTargets(
      [{ city: "Brand New", state: "TX" }],
      [
        { city: "Ancient", state: "CA", lastFetchedAt: daysAgo(300) },
        { city: "Undated", state: "NV", lastFetchedAt: null },
      ],
      now,
    );
    expect(plan.slice(0, 2).map((t) => t.city).sort()).toEqual(["Brand New", "Undated"]);
    expect(plan[2].city).toBe("Ancient");
  });

  it("does not visit the same market twice when it is in both sources", () => {
    const plan = planRefreshTargets(
      [{ city: "Los Angeles", state: "CA" }],
      [{ city: "Los Angeles", state: "CA", lastFetchedAt: daysAgo(5) }],
      now,
    );
    expect(plan).toHaveLength(1);
    // And the ROW wins: the seed entry would claim it was never refreshed and
    // send a fresh market to the front of the queue every single week.
    expect(plan[0].ageDays).toBe(5);
    expect(plan[0].seedOnly).toBe(false);
  });

  it("matches a market across casing and whitespace", () => {
    const plan = planRefreshTargets(
      [{ city: "Los Angeles", state: "CA" }],
      [{ city: "los angeles ", state: "ca", lastFetchedAt: daysAgo(5) }],
      now,
    );
    expect(plan).toHaveLength(1);
  });

  it("is deterministic when ages tie", () => {
    // A budget-limited run truncates the list, so a stable order is what makes
    // "what got skipped" reproducible rather than arbitrary.
    const rows = [
      { city: "Bravo", state: "CA", lastFetchedAt: daysAgo(10) },
      { city: "Alpha", state: "CA", lastFetchedAt: daysAgo(10) },
    ];
    expect(planRefreshTargets([], rows, now).map((t) => t.city)).toEqual(["Alpha", "Bravo"]);
    expect(planRefreshTargets([], [...rows].reverse(), now).map((t) => t.city)).toEqual([
      "Alpha",
      "Bravo",
    ]);
  });

  it("skips blank entries rather than queueing a lookup for nothing", () => {
    const plan = planRefreshTargets(
      [{ city: "  ", state: "CA" }],
      [{ city: "Walnut", state: "  ", lastFetchedAt: null }],
      now,
    );
    expect(plan).toEqual([]);
  });

  it("clamps a future timestamp instead of ranking it below everything", () => {
    const plan = planRefreshTargets(
      [],
      [
        { city: "Future", state: "CA", lastFetchedAt: daysAgo(-30) },
        { city: "Old", state: "CA", lastFetchedAt: daysAgo(9) },
      ],
      now,
    );
    expect(plan.map((t) => t.city)).toEqual(["Old", "Future"]);
    expect(plan[1].ageDays).toBe(0);
  });

  it("drains rather than stalls when a run is budget-limited", () => {
    // The property that makes a partial run progress. Refresh the first two,
    // stamp them today, re-plan: the two it skipped are now at the front.
    const rows = [
      { city: "A", state: "CA", lastFetchedAt: daysAgo(100) },
      { city: "B", state: "CA", lastFetchedAt: daysAgo(90) },
      { city: "C", state: "CA", lastFetchedAt: daysAgo(80) },
      { city: "D", state: "CA", lastFetchedAt: daysAgo(70) },
    ];
    const first = planRefreshTargets([], rows, now).slice(0, 2).map((t) => t.city);
    expect(first).toEqual(["A", "B"]);

    const after = rows.map((r) =>
      first.includes(r.city) ? { ...r, lastFetchedAt: daysAgo(0) } : r,
    );
    expect(planRefreshTargets([], after, now).slice(0, 2).map((t) => t.city)).toEqual(["C", "D"]);
  });

  /*
   * Age alone put the 116 seed metros behind 227 April rows, because the
   * failed-fetch path #1502 removed had stamped them 31 August. Their problem
   * was never that they were old.
   */
  describe("priority", () => {
    const measured = (city: string, fetched: string) => ({
      city, state: "CA", lastFetchedAt: fetched, lastAttemptedAt: fetched,
      source: "ai_web_search",
    });
    const placeholder = (city: string, fetched: string, attempted?: string) => ({
      city, state: "CA", lastFetchedAt: fetched,
      lastAttemptedAt: attempted ?? fetched, source: "seed",
    });

    it("puts a never-measured market ahead of an older measured one", () => {
      const plan = planRefreshTargets(
        [],
        [measured("Old", daysAgo(200)), placeholder("New", daysAgo(4))],
        now,
      );
      expect(plan.map((t) => t.city)).toEqual(["New", "Old"]);
    });

    it("puts an unmeasured metro ahead of an older unmeasured backwater", () => {
      // Los Angeles (31 Aug, seed) vs an April county row. The real case.
      const plan = planRefreshTargets(
        [{ city: "Los Angeles", state: "CA" }],
        [placeholder("Los Angeles", daysAgo(4)), placeholder("Bluewater", daysAgo(154))],
        now,
      );
      expect(plan.map((t) => t.city)).toEqual(["Los Angeles", "Bluewater"]);
    });

    it("drops the metro priority once it is measured, so the tail is not starved", () => {
      /*
       * The guard on the whole idea. A permanent metro priority would refresh
       * the same 116 every cycle and never reach the other 257 — the exact bug
       * this file exists to prevent, reintroduced through a different door.
       */
      const plan = planRefreshTargets(
        [{ city: "Los Angeles", state: "CA" }],
        [measured("Los Angeles", daysAgo(0)), placeholder("Bluewater", daysAgo(154))],
        now,
      );
      expect(plan.map((t) => t.city)).toEqual(["Bluewater", "Los Angeles"]);
    });

    it("orders by when a market was TRIED, not when it last succeeded", () => {
      /*
       * Athens has no published market data, so it fails every run and keeps
       * its April fetch stamp. Without the attempt stamp it sits at the head of
       * the queue forever, costing a call every run rather than one a cycle.
       */
      const plan = planRefreshTargets(
        [],
        [
          placeholder("Athens", daysAgo(154), daysAgo(0)),
          placeholder("Adelanto", daysAgo(154), daysAgo(154)),
        ],
        now,
      );
      expect(plan.map((t) => t.city)).toEqual(["Adelanto", "Athens"]);
    });

    it("falls back to the fetch stamp for a row written before the column existed", () => {
      // Otherwise every pre-migration row reads as never-attempted and they all
      // rush the front at once, losing the order the backfill preserves.
      const plan = planRefreshTargets(
        [],
        [
          { city: "Older", state: "CA", lastFetchedAt: daysAgo(90), source: "seed" },
          { city: "Newer", state: "CA", lastFetchedAt: daysAgo(10), source: "seed" },
        ],
        now,
      );
      expect(plan.map((t) => t.city)).toEqual(["Older", "Newer"]);
    });

    it("still drains: a tried market moves behind the ones not yet tried", () => {
      const rows = [
        placeholder("A", daysAgo(100), daysAgo(100)),
        placeholder("B", daysAgo(100), daysAgo(100)),
        placeholder("C", daysAgo(100), daysAgo(100)),
      ];
      const first = planRefreshTargets([], rows, now).slice(0, 1).map((t) => t.city);
      expect(first).toEqual(["A"]);
      const after = rows.map((r) =>
        first.includes(r.city) ? { ...r, lastAttemptedAt: daysAgo(0) } : r,
      );
      expect(planRefreshTargets([], after, now).map((t) => t.city)).toEqual(["B", "C", "A"]);
    });
  });
});
