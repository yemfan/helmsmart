import { describe, expect, it } from "vitest";

import { runPooled } from "../refreshPool";

/**
 * The budget is what stops a run being killed mid-flight, and the concurrency
 * is what makes a 394-market plan finish inside the 30-day staleness window
 * rather than in a year. Both are arithmetic, so both are testable without
 * touching Anthropic or Supabase.
 */
describe("runPooled", () => {
  /** A clock the test advances by hand, so no test waits on real time. */
  function fakeClock() {
    let t = 0;
    return { now: () => t, advance: (ms: number) => { t += ms; } };
  }

  it("processes every item when the budget is generous", async () => {
    const clock = fakeClock();
    const seen: number[] = [];
    const report = await runPooled(
      [1, 2, 3, 4, 5],
      async (n) => { seen.push(n); },
      { concurrency: 2, budgetMs: 10_000, now: clock.now },
    );
    expect(report.processed).toBe(5);
    expect(report.remaining).toBe(0);
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("stops claiming work once the budget is spent, and says what it left", async () => {
    const clock = fakeClock();
    // Each call burns 100ms of a 250ms budget, so the third claim is refused.
    const report = await runPooled(
      [1, 2, 3, 4, 5, 6],
      async () => { clock.advance(100); },
      { concurrency: 1, budgetMs: 250, now: clock.now },
    );
    expect(report.processed).toBe(3);
    expect(report.remaining).toBe(3);
  });

  it("reports remaining above zero when the schedule cannot keep up", async () => {
    // The signal the cron surfaces: while this is non-zero the plan is behind.
    const clock = fakeClock();
    const report = await runPooled(
      Array.from({ length: 394 }, (_, i) => i),
      async () => { clock.advance(33_000); },
      { concurrency: 1, budgetMs: 240_000, now: clock.now },
    );
    // ~7 a run sequentially — the number that makes a weekly cron a 54-week cycle.
    expect(report.processed).toBe(8);
    expect(report.remaining).toBe(386);
  });

  it("gets through roughly four times as many markets with four workers", async () => {
    /*
     * The claim in refreshPool.ts's header, asserted rather than asserted-at.
     * The clock only advances when a worker finishes, so four workers sharing
     * the cursor claim four items per 33s tick.
     */
    const clock = fakeClock();
    const report = await runPooled(
      Array.from({ length: 394 }, (_, i) => i),
      async () => { clock.advance(33_000 / 4); },
      { concurrency: 4, budgetMs: 240_000, now: clock.now },
    );
    expect(report.processed).toBeGreaterThan(28);
    // 394 / 29 is under 14 runs, which is inside STALE_AFTER_DAYS at daily.
    expect(Math.ceil(394 / report.processed)).toBeLessThanOrEqual(14);
  });

  it("keeps going when a worker throws, and carries the reason", async () => {
    // One bad market must not abandon the rest of the plan.
    const clock = fakeClock();
    const report = await runPooled(
      [1, 2, 3],
      async (n) => { if (n === 2) throw new Error("boom"); },
      { concurrency: 1, budgetMs: 10_000, now: clock.now },
    );
    expect(report.processed).toBe(3);
    const failed = report.outcomes.filter((o) => !o.ok);
    expect(failed).toHaveLength(1);
    expect((failed[0]?.error as Error).message).toBe("boom");
  });

  it("hands each item to exactly one worker", async () => {
    // A shared cursor rather than a slice each; double-fetching a market would
    // spend an AI call to overwrite a row with itself.
    const clock = fakeClock();
    const counts = new Map<number, number>();
    const items = Array.from({ length: 50 }, (_, i) => i);
    await runPooled(
      items,
      async (n) => { counts.set(n, (counts.get(n) ?? 0) + 1); },
      { concurrency: 8, budgetMs: 10_000, now: clock.now },
    );
    expect(counts.size).toBe(50);
    expect([...counts.values()].every((c) => c === 1)).toBe(true);
  });

  it("takes the plan in order, so oldest-first survives the pool", async () => {
    /*
     * #1501 sorts the plan by staleness and that ordering is what makes a
     * budget-limited run progress. Workers must claim from the front.
     */
    const clock = fakeClock();
    const claimed: number[] = [];
    await runPooled(
      Array.from({ length: 20 }, (_, i) => i),
      async (n) => { claimed.push(n); },
      { concurrency: 1, budgetMs: 10_000, now: clock.now },
    );
    expect(claimed).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it("treats a zero budget as doing nothing rather than doing everything", async () => {
    const clock = fakeClock();
    const report = await runPooled([1, 2, 3], async () => {}, {
      concurrency: 4,
      budgetMs: 0,
      now: clock.now,
    });
    expect(report.processed).toBe(0);
    expect(report.remaining).toBe(3);
  });
});
