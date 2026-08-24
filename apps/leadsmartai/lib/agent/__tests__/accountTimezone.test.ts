import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));

const { DEFAULT_ACCOUNT_TIMEZONE, isValidTimezone, safeAccountTimezone } = await import(
  "../accountTimezone"
);

describe("the account default", () => {
  it("is the one briefings already used, not the receptionist's", () => {
    // The two defaults disagreed by three hours. Briefings, the overnight run
    // and the daily-briefing cron all used Los_Angeles; only the receptionist
    // said New_York. Adopting Los_Angeles changes nothing for the majority.
    expect(DEFAULT_ACCOUNT_TIMEZONE).toBe("America/Los_Angeles");
    expect(DEFAULT_ACCOUNT_TIMEZONE).not.toBe("America/New_York");
  });

  it("is itself a valid zone", () => {
    expect(isValidTimezone(DEFAULT_ACCOUNT_TIMEZONE)).toBe(true);
  });
});

describe("isValidTimezone", () => {
  it("accepts real IANA zones", () => {
    for (const tz of [
      "America/Los_Angeles",
      "America/New_York",
      "Europe/London",
      "Asia/Shanghai",
      "Australia/Sydney",
      "UTC",
    ]) {
      expect(isValidTimezone(tz)).toBe(true);
    }
  });

  it("rejects junk", () => {
    for (const tz of ["", "   ", "Mars/Olympus", "not a zone", null, undefined]) {
      expect(isValidTimezone(tz as string | null | undefined)).toBe(false);
    }
  });

  it("rejects abbreviations even though Node resolves them", () => {
    // Node accepts these and resolves them surprisingly: EST becomes
    // America/Panama, which does not observe daylight saving. An agent typing
    // the obvious three letters would book an hour out for half the year.
    for (const tz of ["PST", "EST", "GMT", "CST"]) {
      expect(isValidTimezone(tz)).toBe(false);
    }
  });

  it("still accepts UTC, which is unambiguous", () => {
    expect(isValidTimezone("UTC")).toBe(true);
  });
});

describe("safeAccountTimezone", () => {
  it("passes a valid zone through untouched", () => {
    expect(safeAccountTimezone("Asia/Shanghai")).toBe("Asia/Shanghai");
  });

  it("falls back rather than throwing, so a bad value never silences the AI", () => {
    // A receptionist that refuses to answer is worse than one answering on a
    // best-guess clock.
    for (const bad of [null, undefined, "", "Mars/Olympus"]) {
      expect(safeAccountTimezone(bad)).toBe(DEFAULT_ACCOUNT_TIMEZONE);
    }
  });

  it("never returns something Intl cannot use", () => {
    for (const v of ["Asia/Tokyo", "garbage", "", null]) {
      expect(() =>
        new Intl.DateTimeFormat("en-US", { timeZone: safeAccountTimezone(v) }),
      ).not.toThrow();
    }
  });
});
