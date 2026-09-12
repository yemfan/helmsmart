/**
 * The copy an owner sees when their bank has stopped importing.
 *
 * Run against the REAL bundles, through the same translator the page uses, so
 * these prove two things at once: the Plaid code → key mapping is right, and
 * those keys exist and read the way the product promised. Same arrangement as
 * `lib/connect-error.test.ts`, for the same reason.
 */
import { describe, it, expect } from "vitest";
import { bankConnectionProblem } from "./bank-connection-error";
import { translatorFor } from "./i18n/translator";

const en = translatorFor("en", "settings");

const ALL_CODES = [
  "ITEM_LOGIN_REQUIRED",
  "USER_PERMISSION_REVOKED",
  "USER_ACCOUNT_REVOKED",
  "PENDING_EXPIRATION",
  "PENDING_DISCONNECT",
  "INVALID_CREDENTIALS",
  "INVALID_MFA",
  "INVALID_UPDATED_USERNAME",
  "INSUFFICIENT_CREDENTIALS",
  "ITEM_LOCKED",
  "INSTITUTION_DOWN",
  "INSTITUTION_NOT_RESPONDING",
  "INSTITUTION_NOT_AVAILABLE",
  "INSTITUTION_NO_LONGER_SUPPORTED",
  "ITEM_NOT_SUPPORTED",
  "PRODUCTS_NOT_SUPPORTED",
  "UNKNOWN",
  "SOMETHING_NEW_FROM_PLAID",
];

describe("bankConnectionProblem — friendly, accurate, actionable", () => {
  it("never leaks a raw key or JSON blob, and always names the bank", () => {
    for (const code of ALL_CODES) {
      const { message } = bankConnectionProblem(code, "First Platypus Bank", en);
      expect(message, code).toContain("First Platypus Bank");
      expect(message, code).not.toMatch(/\{|\}|error_code|connectionError/);
      expect(message.length, code).toBeGreaterThan(30);
    }
  });

  it("offers Reconnect exactly when signing in again is what fixes it", () => {
    const repairOf = (code: string) => bankConnectionProblem(code, "Bank", en).repair;

    for (const code of [
      "ITEM_LOGIN_REQUIRED",
      "USER_PERMISSION_REVOKED",
      "USER_ACCOUNT_REVOKED",
      "PENDING_EXPIRATION",
      "PENDING_DISCONNECT",
      "INVALID_CREDENTIALS",
      "INVALID_MFA",
      "INVALID_UPDATED_USERNAME",
      "INSUFFICIENT_CREDENTIALS",
      "ITEM_LOCKED",
    ]) {
      expect(repairOf(code), code).toBe("reconnect");
    }
  });

  /**
   * The half that makes this a function rather than a message lookup. A bank
   * that is down recovers on its own and a bank Plaid dropped never comes
   * back — putting a Reconnect button on either sends the owner into a modal
   * that cannot help, which is the "don't tell them to retry when a retry
   * can't help" rule `lib/connect-error.ts` already keeps for social connects.
   */
  it("does NOT offer Reconnect when reconnecting cannot help", () => {
    for (const code of ["INSTITUTION_DOWN", "INSTITUTION_NOT_RESPONDING", "INSTITUTION_NOT_AVAILABLE"]) {
      const { message, repair } = bankConnectionProblem(code, "Bank", en);
      expect(repair, code).toBe("wait");
      expect(message.toLowerCase(), code).toContain("clears on its own");
    }

    for (const code of ["INSTITUTION_NO_LONGER_SUPPORTED", "ITEM_NOT_SUPPORTED", "PRODUCTS_NOT_SUPPORTED"]) {
      const { message, repair } = bankConnectionProblem(code, "Bank", en);
      expect(repair, code).toBe("none");
      expect(message.toLowerCase(), code).toContain("won't help");
    }
  });

  it("says what the owner is meant to do about the two most common codes", () => {
    expect(bankConnectionProblem("ITEM_LOGIN_REQUIRED", "Chase", en).message).toMatch(/sign in again/i);
    expect(bankConnectionProblem("USER_PERMISSION_REVOKED", "Chase", en).message).toMatch(/reconnect/i);
  });

  it("keeps an unrecognised code visible, spaced out, since support needs it", () => {
    const { message, repair } = bankConnectionProblem("SOME_NEW_PLAID_CODE", "Chase", en);
    expect(message).toContain("SOME NEW PLAID CODE");
    expect(repair).toBe("reconnect");
  });

  it("treats a missing error_code as unknown rather than throwing", () => {
    for (const code of [null, undefined]) {
      const { message, repair } = bankConnectionProblem(code, "Chase", en);
      expect(message).toContain("UNKNOWN");
      expect(repair).toBe("reconnect");
    }
  });

  /**
   * The failure `lib/connect-error.ts` was rewritten to fix: a module holding
   * its own English answers a fully translated page in English, and no i18n
   * guard can see it because the file calls no translator.
   */
  it("answers in the reader's language, not in English", () => {
    for (const [locale, mustNotMatch] of [
      ["zh-Hans", /[A-Za-z]{4,}/],
      ["es", /needs you to|stopped importing|isn't responding/],
    ] as const) {
      const t = translatorFor(locale, "settings");
      // The bank's name is a proper noun and stays Latin in every language, so
      // it would defeat a "no English" check on its own.
      const { message } = bankConnectionProblem("ITEM_LOGIN_REQUIRED", "Chase", t);
      expect(message.replaceAll("Chase", ""), `${locale} still reads as English`).not.toMatch(mustNotMatch);
    }
  });
});
