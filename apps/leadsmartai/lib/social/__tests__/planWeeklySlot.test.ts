import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/anthropic", () => ({
  getAnthropicClient: vi.fn(),
  isAnthropicConfigured: () => false,
}));

const { clampPostsPerDay, defaultAiSlotTimes, fixedSlotTimes } = await import("../planWeeklySlot");

const at = (h: number, m = 0) => h * 60 + m;

describe("clampPostsPerDay", () => {
  it("keeps values in range", () => {
    expect(clampPostsPerDay(1)).toBe(1);
    expect(clampPostsPerDay(5)).toBe(5);
  });

  it("clamps out-of-range values rather than rejecting them", () => {
    expect(clampPostsPerDay(0)).toBe(1);
    expect(clampPostsPerDay(-3)).toBe(1);
    expect(clampPostsPerDay(99)).toBe(5);
  });

  it("falls back to 1 for junk, so a bad payload never means zero posts", () => {
    expect(clampPostsPerDay(undefined)).toBe(1);
    expect(clampPostsPerDay(null)).toBe(1);
    expect(clampPostsPerDay("abc")).toBe(1);
    expect(clampPostsPerDay(NaN)).toBe(1);
  });

  it("truncates fractions", () => {
    expect(clampPostsPerDay(2.9)).toBe(2);
  });
});

describe("fixedSlotTimes", () => {
  it("a single post fires exactly at the chosen time", () => {
    expect(fixedSlotTimes(at(9), 1)).toEqual([at(9)]);
    expect(fixedSlotTimes(at(6, 30), 1)).toEqual([at(6, 30)]);
  });

  it("anchors the first post on the chosen time", () => {
    for (const count of [2, 3, 4, 5]) {
      expect(fixedSlotTimes(at(9), count)[0]).toBe(at(9));
    }
  });

  it("spreads extras across the day and finishes by 9pm", () => {
    const times = fixedSlotTimes(at(9), 3);
    expect(times).toEqual([at(9), at(15), at(21)]);
  });

  it("returns times in ascending order with no duplicates", () => {
    for (const start of [at(0), at(7, 15), at(13), at(20, 45)]) {
      for (const count of [1, 2, 3, 4, 5]) {
        const times = fixedSlotTimes(start, count);
        expect([...times].sort((a, b) => a - b)).toEqual(times);
        expect(new Set(times).size).toBe(times.length);
      }
    }
  });

  it("never schedules before the chosen time", () => {
    const times = fixedSlotTimes(at(14), 4);
    expect(Math.min(...times)).toBe(at(14));
  });

  it("falls back to hourly when the start leaves no room before 9pm", () => {
    // 22:00 start — there is no window to spread into, so extras go hourly.
    const times = fixedSlotTimes(at(22), 3);
    expect(times[0]).toBe(at(22));
    expect(times.every((m) => m <= at(23, 30))).toBe(true);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("never returns a time past midnight", () => {
    for (const count of [1, 2, 3, 4, 5]) {
      for (const time of fixedSlotTimes(at(23, 50), count)) {
        expect(time).toBeLessThanOrEqual(at(23, 59));
        expect(time).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("clamps a nonsense count instead of producing an empty day", () => {
    expect(fixedSlotTimes(at(9), 0)).toEqual([at(9)]);
    expect(fixedSlotTimes(at(9), 99)).toHaveLength(5);
  });
});

describe("defaultAiSlotTimes", () => {
  it("returns one time per requested post", () => {
    for (const count of [1, 2, 3, 4, 5]) {
      expect(defaultAiSlotTimes(count)).toHaveLength(count);
    }
  });

  it("spans the day rather than bunching at the start", () => {
    // Two posts should be morning + evening, not morning + lunch.
    const [first, second] = defaultAiSlotTimes(2);
    expect(first).toBeLessThanOrEqual(at(9));
    expect(second).toBeGreaterThanOrEqual(at(19));
  });

  it("stays within waking hours", () => {
    for (const time of defaultAiSlotTimes(5)) {
      expect(time).toBeGreaterThanOrEqual(at(7));
      expect(time).toBeLessThanOrEqual(at(21, 30));
    }
  });

  it("returns ascending, unique times", () => {
    for (const count of [1, 2, 3, 4, 5]) {
      const times = defaultAiSlotTimes(count);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      expect(new Set(times).size).toBe(times.length);
    }
  });
});
