/**
 * The storage contract for calendar events.
 *
 * `events.start_at` / `end_at` are INSTANTS. The wall clock an owner types is
 * read in `organizations.timezone` and converted here, once, on the way in —
 * `lib/actions/events.ts`. What went wrong before: the calendar sent
 * "2026-09-12T09:00:00" (no offset) to a `timestamptz` column, Postgres read
 * it as UTC, and a 9 AM meeting was stored as 09:00Z — 2 AM in Los Angeles.
 * Meanwhile the booking flow stored true instants, so one column held two
 * different meanings.
 *
 * These tests pin both directions: the wall clock → instant conversion the
 * write path uses, and the instant → day/time reading every screen does.
 */
import { describe, it, expect } from "vitest";
import { zonedToUtc } from "@repo/voice/datetime";

import { calendarDate } from "./org-date";

const LA = "America/Los_Angeles";
const NY = "America/New_York";

/** How a screen renders an event's time: the org's clock, never the server's. */
const timeIn = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });

describe("a typed wall clock becomes an instant", () => {
  it("9 AM in Los Angeles is 16:00Z, not 09:00Z", () => {
    const start = zonedToUtc("2026-09-12", "09:00", LA);
    expect(start.toISOString()).toBe("2026-09-12T16:00:00.000Z");
    // The old behaviour, kept here as the thing that must not come back.
    expect(start.toISOString()).not.toBe("2026-09-12T09:00:00.000Z");
  });

  it("the same wall clock is a different instant in another zone", () => {
    expect(zonedToUtc("2026-09-12", "09:00", NY).toISOString()).toBe("2026-09-12T13:00:00.000Z");
  });

  it("follows the zone across the end of daylight saving", () => {
    // US DST ends 2026-11-01: 9 AM is UTC-7 before it, UTC-8 after.
    expect(zonedToUtc("2026-10-31", "09:00", LA).toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(zonedToUtc("2026-11-02", "09:00", LA).toISOString()).toBe("2026-11-02T17:00:00.000Z");
  });

  it("an all-day event starts at local midnight, so it reads back on its own day", () => {
    const start = zonedToUtc("2026-09-12", "00:00", LA);
    expect(start.toISOString()).toBe("2026-09-12T07:00:00.000Z");
    expect(calendarDate(LA, start)).toBe("2026-09-12");
  });

  it("an end time is the start plus the duration", () => {
    const start = zonedToUtc("2026-09-12", "09:00", LA);
    const end = new Date(start.getTime() + 90 * 60_000);
    expect(timeIn(end.toISOString(), LA)).toBe("10:30 AM");
  });
});

describe("an instant reads back as the day and time that were typed", () => {
  it("round-trips a morning appointment", () => {
    const start = zonedToUtc("2026-09-12", "09:00", LA).toISOString();
    expect(calendarDate(LA, new Date(start))).toBe("2026-09-12");
    expect(timeIn(start, LA)).toBe("9:00 AM");
  });

  it("keeps an evening event on its own day, where the UTC date is tomorrow", () => {
    const start = zonedToUtc("2026-09-12", "19:00", LA).toISOString();
    expect(start).toBe("2026-09-13T02:00:00.000Z");
    expect(new Date(start).toISOString().slice(0, 10)).toBe("2026-09-13"); // the old grouping
    expect(calendarDate(LA, new Date(start))).toBe("2026-09-12"); // the day it belongs to
    expect(timeIn(start, LA)).toBe("7:00 PM");
  });

  it("shows a booked slot at the time the caller was told", () => {
    // What the booking flow already writes: a real instant.
    const start = "2026-09-07T16:00:00.000Z";
    expect(timeIn(start, LA)).toBe("9:00 AM");
    expect(calendarDate(LA, new Date(start))).toBe("2026-09-07");
  });
});
