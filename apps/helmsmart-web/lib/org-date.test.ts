import { describe, it, expect } from "vitest";
import {
  DEFAULT_ORG_TIMEZONE,
  addDays,
  calendarDate,
  daysBetween,
  firstOfMonth,
  lastOfMonth,
  mondayOf,
} from "./org-date";

// The reported moment: 2026-09-10 17:17 PDT = 20:17 EDT = 2026-09-11 00:17 UTC.
const REPORTED = new Date("2026-09-11T00:17:00.000Z");

describe("calendarDate — around the UTC day boundary", () => {
  it("is still the 10th in New York and Los Angeles after UTC has rolled over", () => {
    expect(REPORTED.toISOString().slice(0, 10)).toBe("2026-09-11"); // the old answer
    expect(calendarDate("America/New_York", REPORTED)).toBe("2026-09-10");
    expect(calendarDate("America/Los_Angeles", REPORTED)).toBe("2026-09-10");
    expect(calendarDate("UTC", REPORTED)).toBe("2026-09-11");
  });

  it("gives the reported invoice the dates it should have had", () => {
    const issue = calendarDate("America/New_York", REPORTED);
    expect(issue).toBe("2026-09-10");
    expect(addDays(issue, 30)).toBe("2026-10-10"); // was 2026-10-11
  });

  it("rolls over exactly at local midnight, not UTC midnight (EDT = UTC-4)", () => {
    expect(calendarDate("America/New_York", new Date("2026-09-11T03:59:59.999Z"))).toBe("2026-09-10");
    expect(calendarDate("America/New_York", new Date("2026-09-11T04:00:00.000Z"))).toBe("2026-09-11");
  });

  it("is already tomorrow in zones ahead of UTC", () => {
    const evening = new Date("2026-09-10T20:00:00.000Z");
    expect(calendarDate("UTC", evening)).toBe("2026-09-10");
    expect(calendarDate("Asia/Tokyo", evening)).toBe("2026-09-11");
    expect(calendarDate("Asia/Shanghai", evening)).toBe("2026-09-11");
  });

  it("follows the zone's offset across the end of daylight saving (EST = UTC-5)", () => {
    // US DST ends 2026-11-01. 04:30Z on the 2nd is 23:30 EST on the 1st.
    expect(calendarDate("America/New_York", new Date("2026-11-02T04:30:00.000Z"))).toBe("2026-11-01");
    expect(calendarDate("America/New_York", new Date("2026-11-02T05:00:00.000Z"))).toBe("2026-11-02");
  });

  it("keeps New Year's Eve on the old year until local midnight", () => {
    const nyeUtc = new Date("2027-01-01T03:00:00.000Z");
    expect(calendarDate("America/New_York", nyeUtc)).toBe("2026-12-31");
    expect(calendarDate("America/Los_Angeles", nyeUtc)).toBe("2026-12-31");
  });

  it("falls back to the schema default for a missing or invalid zone instead of throwing", () => {
    const expected = calendarDate(DEFAULT_ORG_TIMEZONE, REPORTED);
    expect(calendarDate("America/Los_Angles", REPORTED)).toBe(expected);
    expect(calendarDate("", REPORTED)).toBe(expected);
    expect(calendarDate(null, REPORTED)).toBe(expected);
    expect(calendarDate(undefined, REPORTED)).toBe(expected);
  });

  it("defaults `at` to now", () => {
    expect(calendarDate("UTC")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("calendar math on YYYY-MM-DD", () => {
  it("addDays crosses month, year and leap-day boundaries in both directions", () => {
    expect(addDays("2026-09-10", 30)).toBe("2026-10-10");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-09-10", -29)).toBe("2026-08-12");
  });

  it("firstOfMonth shifts by whole months, across years", () => {
    expect(firstOfMonth("2026-09-10")).toBe("2026-09-01");
    expect(firstOfMonth("2026-09-30", 1)).toBe("2026-10-01");
    expect(firstOfMonth("2026-12-15", 1)).toBe("2027-01-01");
    expect(firstOfMonth("2026-03-31", -5)).toBe("2025-10-01");
  });

  it("lastOfMonth knows month lengths and leap years", () => {
    expect(lastOfMonth("2026-09-10")).toBe("2026-09-30");
    expect(lastOfMonth("2026-02-01")).toBe("2026-02-28");
    expect(lastOfMonth("2028-02-10")).toBe("2028-02-29");
    expect(lastOfMonth("2026-12-01")).toBe("2026-12-31");
  });

  it("mondayOf finds the start of a Monday–Sunday week", () => {
    expect(mondayOf("2026-09-10")).toBe("2026-09-07"); // Thursday
    expect(mondayOf("2026-09-07")).toBe("2026-09-07"); // Monday itself
    expect(mondayOf("2026-09-13")).toBe("2026-09-07"); // Sunday belongs to the week before
    expect(mondayOf("2027-01-02")).toBe("2026-12-28"); // across a year
  });

  it("daysBetween counts calendar days, signed", () => {
    expect(daysBetween("2026-09-10", "2026-09-10")).toBe(0);
    expect(daysBetween("2026-09-10", "2026-09-17")).toBe(7);
    expect(daysBetween("2026-09-10", "2026-09-08")).toBe(-2);
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2); // across DST end
  });
});
