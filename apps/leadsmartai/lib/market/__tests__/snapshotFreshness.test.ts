import { describe, expect, it } from "vitest";

import { judgeSnapshot, STALE_AFTER_DAYS } from "../snapshotFreshness";

/**
 * These thresholds decide what an AI tells an agent about their market, and
 * agents repeat that to sellers. The failure mode is not a wrong pixel — it is
 * a confident sentence about a price, sourced from a row that either has no
 * price or has a six-month-old one.
 */
describe("judgeSnapshot", () => {
  const now = new Date("2026-09-02T00:00:00Z");
  const daysAgo = (n: number) =>
    new Date(now.getTime() - n * 86_400_000).toISOString();

  it("treats a null or zero median as missing, not as $0", () => {
    // The whole reason this exists: 241 of 394 production rows land here, and
    // the old code formatted every one of them as "median $0".
    expect(judgeSnapshot({ median_price: null, last_fetched_at: daysAgo(1) }, now).medianPrice).toBeNull();
    expect(judgeSnapshot({ median_price: 0, last_fetched_at: daysAgo(1) }, now).medianPrice).toBeNull();
    expect(judgeSnapshot({ median_price: -5, last_fetched_at: daysAgo(1) }, now).medianPrice).toBeNull();
  });

  it("rejects a non-finite median", () => {
    expect(judgeSnapshot({ median_price: NaN, last_fetched_at: daysAgo(1) }, now).medianPrice).toBeNull();
    expect(
      judgeSnapshot({ median_price: Number.POSITIVE_INFINITY, last_fetched_at: daysAgo(1) }, now).medianPrice,
    ).toBeNull();
  });

  it("keeps a real median and reports its age in whole days", () => {
    const v = judgeSnapshot({ median_price: 850_000, last_fetched_at: daysAgo(3) }, now);
    expect(v.medianPrice).toBe(850_000);
    expect(v.ageDays).toBe(3);
    expect(v.stale).toBe(false);
  });

  it("marks a figure stale only past the threshold", () => {
    expect(judgeSnapshot({ median_price: 1, last_fetched_at: daysAgo(STALE_AFTER_DAYS) }, now).stale).toBe(false);
    expect(judgeSnapshot({ median_price: 1, last_fetched_at: daysAgo(STALE_AFTER_DAYS + 1) }, now).stale).toBe(true);
    // 267 of 394 production rows are past 90 days.
    expect(judgeSnapshot({ median_price: 1, last_fetched_at: daysAgo(163) }, now).stale).toBe(true);
  });

  it("treats an undated or unparseable row as stale", () => {
    // We cannot show it is current, and over-caveating a fresh number costs far
    // less than stating a six-month-old one as today's market.
    expect(judgeSnapshot({ median_price: 1, last_fetched_at: null }, now).stale).toBe(true);
    expect(judgeSnapshot({ median_price: 1 }, now).stale).toBe(true);
    expect(judgeSnapshot({ median_price: 1, last_fetched_at: "not a date" }, now).stale).toBe(true);
  });

  it("never calls a MISSING median stale", () => {
    // Staleness is a claim about a number we are going to state. With no
    // number there is nothing to caveat, and the caller takes the other path.
    const v = judgeSnapshot({ median_price: null, last_fetched_at: null }, now);
    expect(v.medianPrice).toBeNull();
    expect(v.stale).toBe(false);
  });

  it("clamps a future timestamp to zero rather than reporting negative age", () => {
    expect(judgeSnapshot({ median_price: 1, last_fetched_at: daysAgo(-5) }, now).ageDays).toBe(0);
  });
});
