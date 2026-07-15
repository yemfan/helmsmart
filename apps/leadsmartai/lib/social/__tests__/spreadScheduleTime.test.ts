import { describe, expect, it, vi } from "vitest";

// recommend.ts reaches for the service-role client + card renderer at import
// time; none of that is needed to exercise the pure scheduling math.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseServer", () => ({ supabaseServer: {} }));
vi.mock("@/lib/newsletter/db", () => ({ getLatestDigest: vi.fn() }));
vi.mock("@/lib/presentations/loadPresentationAgent", () => ({
  loadPresentationAgent: vi.fn(),
}));
vi.mock("@/lib/social/renderCard", () => ({ renderCardPng: vi.fn() }));
vi.mock("@/lib/social/customization", () => ({
  agentHasSocialCustomization: vi.fn(),
}));
vi.mock("@/lib/agent-ai/settings", () => ({ getAgentAiSettings: vi.fn() }));

const { spreadScheduleTime } = await import("../recommend");

// A Monday. Autopilot generates on Monday 14:00 UTC.
const WEEK = "2026-07-20";
const MON_MORNING = new Date("2026-07-20T14:00:00Z");

describe("spreadScheduleTime", () => {
  it("defaults to Mon / Wed / Fri instead of firing the week at once", () => {
    const days = [0, 1, 2].map((i) => spreadScheduleTime(WEEK, i, 3, MON_MORNING));
    expect(days).toEqual([
      "2026-07-20T16:00:00.000Z", // Mon
      "2026-07-22T16:00:00.000Z", // Wed
      "2026-07-24T16:00:00.000Z", // Fri
    ]);
    // The regression that motivated this: three identical timestamps meant the
    // publish-scheduled cron drained the whole week on one tick.
    expect(new Set(days).size).toBe(3);
  });

  it("gives one post per day at the daily cadence the brand runs", () => {
    const days = [0, 1, 2, 3, 4, 5, 6].map((i) =>
      spreadScheduleTime(WEEK, i, 7, MON_MORNING).slice(0, 10),
    );
    expect(days).toEqual([
      "2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23",
      "2026-07-24", "2026-07-25", "2026-07-26",
    ]);
    expect(new Set(days).size).toBe(7); // no doubling up on any day
  });

  it("spreads 2/week to Mon + Thu — the brand's previous cadence", () => {
    expect([0, 1].map((i) => spreadScheduleTime(WEEK, i, 2, MON_MORNING))).toEqual([
      "2026-07-20T16:00:00.000Z", // Mon
      "2026-07-23T16:00:00.000Z", // Thu
    ]);
  });

  it("keeps every cadence 1-7 inside its own week, one slot per day at most", () => {
    for (let n = 1; n <= 7; n++) {
      const offsets = Array.from({ length: n }, (_, i) =>
        Number(spreadScheduleTime(WEEK, i, n, MON_MORNING).slice(8, 10)) - 20,
      );
      expect(new Set(offsets).size).toBe(n); // distinct days
      expect(Math.max(...offsets)).toBeLessThanOrEqual(6); // never past Sunday
      expect(Math.min(...offsets)).toBe(0); // always starts Monday
    }
  });

  it("posts at 16:00 UTC — 9am PT, inside the workday on both coasts", () => {
    const d = new Date(spreadScheduleTime(WEEK, 0, 3, MON_MORNING));
    expect(d.getUTCHours()).toBe(16);
    expect(d.getUTCMinutes()).toBe(0);
  });

  it("rolls posts past the cadence into the following week rather than piling up", () => {
    expect(spreadScheduleTime(WEEK, 3, 3, MON_MORNING)).toBe("2026-07-27T16:00:00.000Z");
    expect(spreadScheduleTime(WEEK, 4, 3, MON_MORNING)).toBe("2026-07-29T16:00:00.000Z");
  });

  it("falls back to the default cadence on a nonsense value", () => {
    expect(spreadScheduleTime(WEEK, 1, 0, MON_MORNING)).toBe("2026-07-22T16:00:00.000Z");
    expect(spreadScheduleTime(WEEK, 1, 99, MON_MORNING)).toBe("2026-07-21T16:00:00.000Z"); // clamped to 7
  });

  it("collapses past slots to now, so a mid-week generate drops nothing", () => {
    // Generated Thursday: Mon + Wed are already gone.
    const thursday = new Date("2026-07-23T18:30:00Z");
    expect(spreadScheduleTime(WEEK, 0, 3, thursday)).toBe(thursday.toISOString());
    expect(spreadScheduleTime(WEEK, 1, 3, thursday)).toBe(thursday.toISOString());
    // Friday is still ahead, so it keeps its real slot.
    expect(spreadScheduleTime(WEEK, 2, 3, thursday)).toBe("2026-07-24T16:00:00.000Z");
  });

  it("never returns a time in the past", () => {
    const now = new Date("2026-07-24T20:00:00Z");
    for (const i of [0, 1, 2, 3]) {
      expect(
        new Date(spreadScheduleTime(WEEK, i, 7, now)).getTime(),
      ).toBeGreaterThanOrEqual(now.getTime());
    }
  });
});
