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
  it("spreads a week's posts across Mon / Wed / Fri instead of firing at once", () => {
    const days = [0, 1, 2].map((i) => spreadScheduleTime(WEEK, i, MON_MORNING));
    expect(days).toEqual([
      "2026-07-20T16:00:00.000Z", // Mon
      "2026-07-22T16:00:00.000Z", // Wed
      "2026-07-24T16:00:00.000Z", // Fri
    ]);
    // The regression that motivated this: three identical timestamps meant the
    // publish-scheduled cron drained the whole week on one tick.
    expect(new Set(days).size).toBe(3);
  });

  it("posts at 16:00 UTC — 9am PT, inside the workday on both coasts", () => {
    const d = new Date(spreadScheduleTime(WEEK, 0, MON_MORNING));
    expect(d.getUTCHours()).toBe(16);
    expect(d.getUTCMinutes()).toBe(0);
  });

  it("rolls a 4th+ post into the following week rather than piling up", () => {
    expect(spreadScheduleTime(WEEK, 3, MON_MORNING)).toBe("2026-07-27T16:00:00.000Z");
    expect(spreadScheduleTime(WEEK, 4, MON_MORNING)).toBe("2026-07-29T16:00:00.000Z");
  });

  it("collapses past slots to now, so a mid-week generate drops nothing", () => {
    // Generated Thursday: Mon + Wed are already gone.
    const thursday = new Date("2026-07-23T18:30:00Z");
    expect(spreadScheduleTime(WEEK, 0, thursday)).toBe(thursday.toISOString());
    expect(spreadScheduleTime(WEEK, 1, thursday)).toBe(thursday.toISOString());
    // Friday is still ahead, so it keeps its real slot.
    expect(spreadScheduleTime(WEEK, 2, thursday)).toBe("2026-07-24T16:00:00.000Z");
  });

  it("never returns a time in the past", () => {
    const now = new Date("2026-07-24T20:00:00Z");
    for (const i of [0, 1, 2, 3]) {
      expect(
        new Date(spreadScheduleTime(WEEK, i, now)).getTime(),
      ).toBeGreaterThanOrEqual(now.getTime());
    }
  });
});
