import { describe, expect, it } from "vitest";

import { judgeSnapshot, MEASURED_SOURCES, STALE_AFTER_DAYS } from "../snapshotFreshness";

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
    expect(judgeSnapshot({ median_price: null, last_fetched_at: daysAgo(1), source: "ai_web_search" }, now).medianPrice).toBeNull();
    expect(judgeSnapshot({ median_price: 0, last_fetched_at: daysAgo(1), source: "ai_web_search" }, now).medianPrice).toBeNull();
    expect(judgeSnapshot({ median_price: -5, last_fetched_at: daysAgo(1), source: "ai_web_search" }, now).medianPrice).toBeNull();
  });

  it("rejects a non-finite median", () => {
    expect(judgeSnapshot({ median_price: NaN, last_fetched_at: daysAgo(1), source: "ai_web_search" }, now).medianPrice).toBeNull();
    expect(
      judgeSnapshot({ median_price: Number.POSITIVE_INFINITY, last_fetched_at: daysAgo(1), source: "ai_web_search" }, now).medianPrice,
    ).toBeNull();
  });

  it("keeps a real median and reports its age in whole days", () => {
    const v = judgeSnapshot({ median_price: 850_000, last_fetched_at: daysAgo(3), source: "ai_web_search" }, now);
    expect(v.medianPrice).toBe(850_000);
    expect(v.ageDays).toBe(3);
    expect(v.stale).toBe(false);
  });

  it("marks a figure stale only past the threshold", () => {
    expect(judgeSnapshot({ median_price: 1, last_fetched_at: daysAgo(STALE_AFTER_DAYS), source: "ai_web_search" }, now).stale).toBe(false);
    expect(judgeSnapshot({ median_price: 1, last_fetched_at: daysAgo(STALE_AFTER_DAYS + 1), source: "ai_web_search" }, now).stale).toBe(true);
    // 267 of 394 production rows are past 90 days.
    expect(judgeSnapshot({ median_price: 1, last_fetched_at: daysAgo(163), source: "ai_web_search" }, now).stale).toBe(true);
  });

  it("treats an undated or unparseable row as stale", () => {
    // We cannot show it is current, and over-caveating a fresh number costs far
    // less than stating a six-month-old one as today's market.
    expect(judgeSnapshot({ median_price: 1, last_fetched_at: null, source: "ai_web_search" }, now).stale).toBe(true);
    expect(judgeSnapshot({ median_price: 1, source: "ai_web_search" }, now).stale).toBe(true);
    expect(judgeSnapshot({ median_price: 1, last_fetched_at: "not a date", source: "ai_web_search" }, now).stale).toBe(true);
  });

  it("never calls a MISSING median stale", () => {
    // Staleness is a claim about a number we are going to state. With no
    // number there is nothing to caveat, and the caller takes the other path.
    const v = judgeSnapshot({ median_price: null, last_fetched_at: null, source: "ai_web_search" }, now);
    expect(v.medianPrice).toBeNull();
    expect(v.stale).toBe(false);
  });

  it("clamps a future timestamp to zero rather than reporting negative age", () => {
    expect(judgeSnapshot({ median_price: 1, last_fetched_at: daysAgo(-5), source: "ai_web_search" }, now).ageDays).toBe(0);
  });

  /*
   * The gate age cannot enforce. Every one of the 394 production rows was a
   * placeholder stamped with a recent date, because the failed-fetch path wrote
   * the seed constants back as if it had looked them up.
   */
  describe("source", () => {
    const seedLa = { median_price: 955_000, source: "seed", last_fetched_at: daysAgo(1) };

    it("withholds a placeholder median however fresh it looks", () => {
      const v = judgeSnapshot(seedLa, now);
      expect(v.medianPrice).toBeNull();
      expect(v.unmeasured).toBe(true);
      // One day old. Age had nothing to object to, which was the whole problem.
      expect(v.ageDays).toBe(1);
    });

    it("withholds every placeholder source in the table, including retired vendors", () => {
      // rentcast was removed in #790-797; 10 rows of it are still in the table.
      for (const source of [
        "seed",
        "fallback",
        "seed_socal_county_json",
        "seed_socal_county_pipeline",
        "rentcast",
      ]) {
        const v = judgeSnapshot({ median_price: 850_000, source, last_fetched_at: daysAgo(1) }, now);
        expect(v.medianPrice, source).toBeNull();
        expect(v.unmeasured, source).toBe(true);
      }
    });

    it("withholds an unrecognised source rather than trusting it", () => {
      // Allowlist, not denylist: a new brand of placeholder must not be quoted
      // just because nobody thought to add it to a list of known-bad names.
      const v = judgeSnapshot({ median_price: 850_000, source: "seed_v2", last_fetched_at: daysAgo(1) }, now);
      expect(v.medianPrice).toBeNull();
      expect(v.unmeasured).toBe(true);
    });

    it("withholds a row with no source at all", () => {
      expect(judgeSnapshot({ median_price: 850_000, last_fetched_at: daysAgo(1) }, now).medianPrice).toBeNull();
    });

    it("passes a measured median through, and still ages it", () => {
      const v = judgeSnapshot(
        { median_price: 850_000, source: "ai_web_search", last_fetched_at: daysAgo(200) },
        now,
      );
      expect(v.medianPrice).toBe(850_000);
      expect(v.unmeasured).toBe(false);
      // Measured does not mean current: the age caveat still has to apply.
      expect(v.stale).toBe(true);
    });

    it("never calls a withheld placeholder stale", () => {
      // Same reasoning as a missing median: there is no number to caveat, and
      // "out of date" would be the wrong thing to say about it anyway.
      expect(judgeSnapshot(seedLa, now).stale).toBe(false);
    });

    it("recognises exactly one source today", () => {
      // A guard on the allowlist itself: widening it is a decision, and this
      // test is where someone has to make it deliberately.
      expect([...MEASURED_SOURCES]).toEqual(["ai_web_search"]);
    });
  });
});
