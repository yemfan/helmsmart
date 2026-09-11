import { describe, expect, it } from "vitest";
import { KEEP_PREFERENCE_MAX_AGE, KEEP_SIGNED_IN_COOKIE, keepSignedInCookie, keepSignedInFrom, readCookieValue, withSessionLifetime } from "../keepSignedIn";

describe("keepSignedInFrom", () => {
  it("keeps people signed in unless they explicitly said no", () => {
    expect(keepSignedInFrom(undefined)).toBe(true);
    expect(keepSignedInFrom(null)).toBe(true);
    expect(keepSignedInFrom("1")).toBe(true);
    expect(keepSignedInFrom("garbage")).toBe(true);
    expect(keepSignedInFrom("0")).toBe(false);
  });
});

describe("withSessionLifetime", () => {
  const written = { path: "/", sameSite: "lax" as const, domain: ".closebossai.com", maxAge: 400 * 24 * 60 * 60 };

  it("changes nothing when the person chose to stay signed in", () => {
    expect(withSessionLifetime(written, true)).toBe(written);
  });

  it("drops the lifetime so the cookie ends with the browser, keeping everything else", () => {
    expect(withSessionLifetime(written, false)).toEqual({ path: "/", sameSite: "lax", domain: ".closebossai.com" });
    const withExpiry = { path: "/", expires: new Date(Date.now() + 86_400_000) };
    expect(withSessionLifetime(withExpiry, false)).toEqual({ path: "/" });
  });

  it("leaves a sign-out alone, so the session really goes", () => {
    const removal = { path: "/", maxAge: 0 };
    expect(withSessionLifetime(removal, false)).toBe(removal);
    const past = { path: "/", expires: new Date(0) };
    expect(withSessionLifetime(past, false)).toBe(past);
  });

  it("passes missing options through", () => {
    expect(withSessionLifetime(undefined, false)).toBeUndefined();
  });
});

describe("readCookieValue", () => {
  it("finds the preference among other cookies and decodes it", () => {
    const header = `sb-x-auth-token-leadsmart=base64-abc; ${KEEP_SIGNED_IN_COOKIE}=0; theme=dark`;
    expect(readCookieValue(header, KEEP_SIGNED_IN_COOKIE)).toBe("0");
    expect(readCookieValue("a=hello%20there", "a")).toBe("hello there");
  });

  it("does not match a cookie that only starts with the same name, and answers null when absent", () => {
    expect(readCookieValue(`${KEEP_SIGNED_IN_COOKIE}_old=0`, KEEP_SIGNED_IN_COOKIE)).toBeNull();
    expect(readCookieValue("", KEEP_SIGNED_IN_COOKIE)).toBeNull();
    expect(readCookieValue(undefined, KEEP_SIGNED_IN_COOKIE)).toBeNull();
  });
});

describe("keepSignedInCookie", () => {
  it("remembers a yes for 400 days and makes a no end with the browser", () => {
    expect(keepSignedInCookie(true)).toBe(`${KEEP_SIGNED_IN_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=${KEEP_PREFERENCE_MAX_AGE}`);
    expect(keepSignedInCookie(false)).toBe(`${KEEP_SIGNED_IN_COOKIE}=0; Path=/; SameSite=Lax`);
  });

  it("carries the shared auth domain and Secure when given", () => {
    expect(keepSignedInCookie(false, { domain: ".closebossai.com", secure: true })).toBe(`${KEEP_SIGNED_IN_COOKIE}=0; Path=/; SameSite=Lax; Domain=.closebossai.com; Secure`);
  });
});
