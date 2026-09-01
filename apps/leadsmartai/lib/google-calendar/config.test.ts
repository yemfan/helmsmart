import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getGoogleOAuthConfig, isGoogleCalendarConfigured, GOOGLE_CALENDAR_SCOPES } from "./config";

describe("isGoogleCalendarConfigured", () => {
  const origClientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const origSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;

  afterEach(() => {
    if (origClientId !== undefined) process.env.GOOGLE_CALENDAR_CLIENT_ID = origClientId;
    else delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    if (origSecret !== undefined) process.env.GOOGLE_CALENDAR_CLIENT_SECRET = origSecret;
    else delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  });

  it("returns false when no env vars set", () => {
    delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    expect(isGoogleCalendarConfigured()).toBe(false);
  });

  it("returns false when only client ID set", () => {
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "test-id";
    delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    expect(isGoogleCalendarConfigured()).toBe(false);
  });

  it("returns true when both set", () => {
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "test-id";
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "test-secret";
    expect(isGoogleCalendarConfigured()).toBe(true);
  });
});

describe("getGoogleOAuthConfig", () => {
  it("builds redirect URI from base URL", () => {
    const config = getGoogleOAuthConfig();
    expect(config.redirectUri).toContain("/api/auth/google-calendar/callback");
  });

  it("defaults baseUrl to closebossai.com", () => {
    const origApp = process.env.NEXT_PUBLIC_APP_URL;
    const origBase = process.env.APP_BASE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_BASE_URL;

    const config = getGoogleOAuthConfig();
    expect(config.baseUrl).toBe("https://www.closebossai.com");

    if (origApp !== undefined) process.env.NEXT_PUBLIC_APP_URL = origApp;
    if (origBase !== undefined) process.env.APP_BASE_URL = origBase;
  });
});

describe("GOOGLE_CALENDAR_SCOPES", () => {
  it("requests calendar.events — the write scope sync.ts actually uses", () => {
    expect(GOOGLE_CALENDAR_SCOPES).toContain("calendar.events");
  });

  it("requests nothing else", () => {
    // Guards the consent screen against creeping back open. Every scope here
    // has to be one the code demonstrably calls, or Google verification bounces
    // it and users are asked to grant access the app never uses.
    expect(GOOGLE_CALENDAR_SCOPES.split(" ")).toEqual([
      "https://www.googleapis.com/auth/calendar.events",
    ]);
  });

  it("does not request calendar.readonly — nothing reads or lists", () => {
    expect(GOOGLE_CALENDAR_SCOPES).not.toContain("calendar.readonly");
  });
});
