import { describe, expect, it } from "vitest";

const {
  COMMON_TIMEZONES,
  COMMON_TIMEZONE_VALUES,
  DEFAULT_ACCOUNT_TIMEZONE,
  OTHER_TIMEZONE,
  isValidTimezone,
  safeAccountTimezone,
} = await import("../timezone");

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

describe("the picker list", () => {
  /*
   * The list and the validator have to agree.
   *
   * The panel offers these as one-click choices and the API validates whatever
   * comes back. If a listed zone failed isValidTimezone, choosing it from the
   * dropdown would be rejected by the server — an option that cannot be
   * chosen. Cheap to assert, and it is the same class of disagreement that put
   * three different timezones in this codebase to begin with.
   */
  it("only offers zones the API will accept", () => {
    for (const tz of COMMON_TIMEZONES) {
      expect(isValidTimezone(tz.value), tz.value).toBe(true);
    }
  });

  it("includes the default, so an untouched account shows a real selection", () => {
    // Otherwise the select falls back to its first <option> and silently
    // misreports which zone the account is actually on.
    expect(COMMON_TIMEZONE_VALUES.has(DEFAULT_ACCOUNT_TIMEZONE)).toBe(true);
  });

  it("keeps the Other sentinel out of the list and out of the database", () => {
    expect(COMMON_TIMEZONE_VALUES.has(OTHER_TIMEZONE)).toBe(false);
    // It is a UI mode, not a zone. Saving it would be a valid-looking write of
    // a value nothing can format a date in.
    expect(isValidTimezone(OTHER_TIMEZONE)).toBe(false);
  });

  it("has no duplicate values", () => {
    expect(COMMON_TIMEZONE_VALUES.size).toBe(COMMON_TIMEZONES.length);
  });
});
