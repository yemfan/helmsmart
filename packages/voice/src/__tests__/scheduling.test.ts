import { describe, it, expect } from "vitest";
import { generateDaySlots } from "../scheduling";

/** 9am–5pm Los Angeles on a Friday, nothing booked, nothing in the past. */
function day(overrides: Partial<Parameters<typeof generateDaySlots>[0]> = {}) {
  return generateDaySlots({
    date: "2026-09-04",
    open: "09:00",
    close: "17:00",
    timezone: "America/Los_Angeles",
    busy: [],
    durationMin: 30,
    now: 0, // long before the day, so nothing is filtered as past
    ...overrides,
  });
}

/** Local hour in the business's timezone, for readable assertions. */
function hourOf(startISO: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      hour12: false,
    }).format(new Date(startISO)),
  );
}

describe("generateDaySlots", () => {
  it("spans the whole day rather than only the morning", () => {
    // The bug this replaces: walking forward from 09:00 and stopping at five
    // gave 9:00, 9:30, 10:00, 10:30, 11:00 — every option before lunch, every
    // day, on any 9-to-5 business. A caller who needed the afternoon was told
    // nothing was free.
    const hours = day().map((s) => hourOf(s.startISO));
    expect(hours.some((h) => h < 12)).toBe(true);
    expect(hours.some((h) => h >= 12)).toBe(true);
  });

  it("offers the earliest slot first, because soonest is what many callers want", () => {
    expect(hourOf(day()[0].startISO)).toBe(9);
  });

  it("reaches the last bookable slot of the day", () => {
    // 09:00–17:00 with a 30-minute appointment: the last one that fits starts
    // at 16:30.
    const slots = day();
    const last = slots[slots.length - 1];
    expect(hourOf(last.startISO)).toBe(16);
  });

  it("never returns more than max", () => {
    expect(day().length).toBeLessThanOrEqual(5);
    expect(day({ max: 3 }).length).toBeLessThanOrEqual(3);
  });

  it("returns no duplicate times", () => {
    for (const max of [2, 3, 4, 5, 6, 7]) {
      const iso = day({ max }).map((s) => s.startISO);
      expect(new Set(iso).size).toBe(iso.length);
    }
  });

  it("returns every slot when there are fewer free than max", () => {
    // A one-hour window fits exactly one 60-minute appointment.
    const slots = day({ open: "09:00", close: "10:00", durationMin: 60 });
    expect(slots).toHaveLength(1);
    expect(hourOf(slots[0].startISO)).toBe(9);
  });

  it("returns nothing when the window cannot fit the appointment", () => {
    expect(day({ open: "09:00", close: "09:20", durationMin: 30 })).toEqual([]);
  });

  it("skips times that are already busy", () => {
    // Block the whole morning; every offer must then be afternoon.
    const busy = [
      {
        start: new Date("2026-09-04T16:00:00Z").getTime(), // 9am LA
        end: new Date("2026-09-04T19:00:00Z").getTime(), // 12pm LA
      },
    ];
    const hours = day({ busy }).map((s) => hourOf(s.startISO));
    expect(hours.every((h) => h >= 12)).toBe(true);
    expect(hours.length).toBeGreaterThan(0);
  });

  it("skips times that have already passed", () => {
    // 2pm LA on the day itself: nothing earlier may be offered.
    const now = new Date("2026-09-04T21:00:00Z").getTime();
    const hours = day({ now }).map((s) => hourOf(s.startISO));
    expect(hours.every((h) => h >= 14)).toBe(true);
  });

  it("handles max of 1 without dividing by zero", () => {
    const slots = day({ max: 1 });
    expect(slots).toHaveLength(1);
    expect(hourOf(slots[0].startISO)).toBe(9);
  });
});
