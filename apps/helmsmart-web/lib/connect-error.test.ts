import { describe, it, expect } from "vitest";
import { connectErrorMessage } from "./connect-error";
import { translatorFor } from "./i18n/translator";

/**
 * The assertions below are unchanged from when this module held its own
 * English. They run against the REAL `en` bundle now, through the same
 * translator the page uses, so they prove two things at once: the code → key
 * mapping is right, and those keys actually exist and read the way the
 * product promised.
 */
const en = translatorFor("en", "marketing");

describe("connectErrorMessage — friendly, accurate social connect errors", () => {
  it("never dumps a raw provider blob and always names the provider", () => {
    for (const code of ["not_configured", "bad_state", "token_exchange_failed", "access_denied", "weird_unknown_1349245"]) {
      const msg = connectErrorMessage("Threads", code, en);
      expect(msg).toContain("Threads");
      expect(msg).not.toMatch(/\{|\}|error_code|error_message/); // no raw JSON leakage
      expect(msg.length).toBeGreaterThan(20);
    }
  });

  it("does NOT tell the user to retry when a retry can't help (config error)", () => {
    const msg = connectErrorMessage("YouTube", "not_configured", en).toLowerCase();
    expect(msg).toContain("isn't set up");
    expect(msg).toContain("retrying won't help");
    expect(msg).not.toContain("try again");
  });

  it("guides the user to reconnect for transient/expired states", () => {
    expect(connectErrorMessage("LinkedIn", "bad_state", en)).toMatch(/start Connect LinkedIn again/i);
    expect(connectErrorMessage("Facebook", "token_exchange_failed", en)).toMatch(/try connecting again/i);
  });

  it("explains cancellation / missing permissions on access_denied", () => {
    const msg = connectErrorMessage("TikTok", "access_denied", en);
    expect(msg).toMatch(/cancelled|permission/i);
  });

  it("unknown codes get a helpful generic message (approval / tester hint), still friendly", () => {
    const msg = connectErrorMessage("Threads", "1349245", en);
    expect(msg).toMatch(/approval|tester/i);
    expect(msg).toContain("Threads");
  });

  /**
   * The reason this file changed at all. A reader in Chinese used to get these
   * five sentences in English on an otherwise fully translated page, and no
   * guard could see it — they skip files that call no translator, and this one
   * called none.
   */
  it("answers in the reader's language, not in English", () => {
    for (const [locale, mustNotMatch] of [
      ["zh-Hans", /[A-Za-z]{4,}/],
      ["es", /connection attempt|sign-in didn't|isn't set up/],
    ] as const) {
      const t = translatorFor(locale, "marketing");
      // Strip the provider name: it is a proper noun and stays Latin in every
      // language, so it would defeat a "no English" check on its own.
      const msg = connectErrorMessage("Threads", "bad_state", t).replaceAll("Threads", "");
      expect(msg, `${locale} still reads as English`).not.toMatch(mustNotMatch);
    }
  });

  it("keeps the raw code visible on an unknown failure, since support needs it", () => {
    expect(connectErrorMessage("Threads", "1349245", en)).toContain("1349245");
    // Underscores are spaced out so a code reads as words rather than a token.
    expect(connectErrorMessage("Threads", "weird_unknown", en)).toContain("weird unknown");
  });
});
