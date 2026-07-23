import { describe, expect, it } from "vitest";

import { normalizeWeekdays, planPublishTimes } from "./schedule";

// 2026-07-20 is a Monday.
const MONDAY = "2026-07-20";
// Well before any slot so nothing collapses to "now" unless a test wants it.
const EARLY = new Date("2026-07-19T00:00:00Z");

const dayOf = (iso: string) => new Date(iso).getUTCDay();
const hourOf = (iso: string) => new Date(iso).getUTCHours();
const dateOf = (iso: string) => iso.slice(0, 10);

describe("normalizeWeekdays", () => {
  it("dedupes and orders", () => {
    expect(normalizeWeekdays([5, 1, 1, 3])).toEqual([1, 3, 5]);
  });

  it("falls back to every day rather than going silent on junk", () => {
    // A broken saved list must not stop posting entirely.
    expect(normalizeWeekdays([])).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(normalizeWeekdays(["x", 9, -1])).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(normalizeWeekdays(undefined)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe("planPublishTimes", () => {
  it("places posts only on the allowed weekdays", () => {
    const times = planPublishTimes(MONDAY, {
      count: 3,
      days: [1, 3, 5], // Mon/Wed/Fri
      now: EARLY,
    });
    expect(times).toHaveLength(3);
    expect(times.map(dayOf)).toEqual([1, 3, 5]);
  });

  it("honours the requested hour", () => {
    const times = planPublishTimes(MONDAY, { count: 2, hourUtc: 9, now: EARLY });
    expect(times.every((t) => hourOf(t) === 9)).toBe(true);
  });

  it("stacks multiple posts on one day, staggered by the step", () => {
    const times = planPublishTimes(MONDAY, {
      count: 2,
      days: [1],
      maxPerDay: 2,
      hourUtc: 9,
      hourStepUtc: 4,
      now: EARLY,
    });
    expect(times.map(dateOf)).toEqual([MONDAY, MONDAY]);
    expect(times.map(hourOf)).toEqual([9, 13]);
  });

  it("respects the per-day cap, moving the overflow to the next allowed day", () => {
    const times = planPublishTimes(MONDAY, {
      count: 3,
      days: [1, 3],
      maxPerDay: 2,
      now: EARLY,
    });
    // 2 on Monday, then the 3rd rolls to Wednesday — not stacked onto Monday.
    expect(times.map(dayOf)).toEqual([1, 1, 3]);
  });

  it("rolls into the following week instead of piling onto the last day", () => {
    const times = planPublishTimes(MONDAY, {
      count: 3,
      days: [1], // only Mondays, one per day
      now: EARLY,
    });
    expect(times.map(dayOf)).toEqual([1, 1, 1]);
    expect(times.map(dateOf)).toEqual(["2026-07-20", "2026-07-27", "2026-08-03"]);
  });

  it("collapses past slots to now so a mid-week generate never drops a post", () => {
    const now = new Date("2026-07-22T12:00:00Z"); // Wednesday
    const times = planPublishTimes(MONDAY, {
      count: 2,
      days: [1, 5], // Monday already passed
      now,
    });
    expect(times[0]).toBe(now.toISOString());
    expect(dayOf(times[1])).toBe(5);
  });

  it("returns nothing for a zero count", () => {
    expect(planPublishTimes(MONDAY, { count: 0, now: EARLY })).toEqual([]);
  });

  it("still schedules when the day list is unusable", () => {
    const times = planPublishTimes(MONDAY, { count: 2, days: [], now: EARLY });
    expect(times).toHaveLength(2);
  });
});
