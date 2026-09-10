/**
 * Two things these actions must never do: publish a Supabase sentence to the
 * user, and let the forgot-password screen say whether an account exists.
 *
 * They were the same line of code. `authErrorMessage` ended in `return message`,
 * so an unrecognised failure arrived on screen in English — and on the reset
 * path that English was the difference between "this account is real" and "it is
 * not", which `resetPasswordForEmail` deliberately hides (supabase/auth#2702).
 *
 * `getServerT` is backed by the REAL bundles here via `translatorFor`, so these
 * assert the Chinese a user would actually read, not a mock's echo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { translatorFor } from "@/lib/i18n/translator";

/** Flipped per test; `getServerT` resolves against it. */
let locale: "en" | "zh-Hans" = "zh-Hans";

vi.mock("@/lib/i18n/server", () => ({
  getServerT: async (ns = "common") => translatorFor(locale, ns),
  getServerLocale: async () => locale,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, delete: () => {} }),
  headers: async () => new Map([["host", "www.helmsmart.ai"]]),
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

/** What Supabase hands back next. Reassigned per test. */
let resetError: { message: string } | null = null;
let signInError: { message: string } | null = null;
const resetCalls: string[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      resetPasswordForEmail: async (email: string) => {
        resetCalls.push(email);
        return { data: {}, error: resetError };
      },
      signInWithPassword: async () => ({ data: {}, error: signInError }),
    },
  }),
}));

const { requestPasswordReset, signIn } = await import("./auth");

const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
};

/** Verbatim from the live failure that started this: a real, well-formed
 *  address on a domain Supabase refuses, which it only refuses once the user
 *  exists — so showing it announced the account. */
const EMAIL_INVALID = { message: 'Email address "michael.yes@mail.com" is invalid' };

beforeEach(() => {
  vi.restoreAllMocks();
  locale = "zh-Hans";
  resetError = null;
  signInError = null;
  resetCalls.length = 0;
});

describe("requestPasswordReset — non-disclosure", () => {
  it("answers a refused address exactly as it answers a sent one", async () => {
    const onSuccess = await requestPasswordReset(null, form({ email: "a@example.com" }));

    resetError = EMAIL_INVALID;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onRefusal = await requestPasswordReset(null, form({ email: "a@example.com" }));

    // Byte-for-byte identical: nothing on this screen distinguishes the two.
    expect(onRefusal).toEqual(onSuccess);
    expect(onRefusal?.sent).toBe(true);
  });

  it("never puts the Supabase sentence — or the address — on screen", async () => {
    resetError = EMAIL_INVALID;
    vi.spyOn(console, "error").mockImplementation(() => {});

    const state = await requestPasswordReset(null, form({ email: "michael.yes@mail.com" }));

    expect(state?.error).not.toContain("is invalid");
    expect(state?.error).not.toContain("michael.yes@mail.com");
    expect(state?.error).toBe(translatorFor("zh-Hans", "auth")("errors.checkEmailReset"));
  });

  it("keeps the real reason in the server log, where it is still useful", async () => {
    resetError = EMAIL_INVALID;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await requestPasswordReset(null, form({ email: "michael.yes@mail.com" }));

    expect(spy).toHaveBeenCalledWith(
      "[auth] password reset refused:",
      EMAIL_INVALID.message,
    );
  });

  it("still reports rate limiting, which is about the caller, not the address", async () => {
    resetError = { message: "For security purposes, you can only request this once every 60 seconds" };

    const state = await requestPasswordReset(null, form({ email: "a@example.com" }));

    expect(state?.error).toBe(translatorFor("zh-Hans", "auth")("errors.rateLimited"));
    expect(state?.sent).toBeFalsy();
  });

  it("still asks for an email before calling Supabase at all", async () => {
    const state = await requestPasswordReset(null, form({ email: "" }));
    expect(state?.error).toBe(translatorFor("zh-Hans", "auth")("errors.emailRequired"));
    expect(resetCalls).toEqual([]);
  });
});

describe("authErrorMessage — no English on a Chinese page", () => {
  it("translates an unmapped Supabase error instead of forwarding it", async () => {
    signInError = { message: "Database error querying schema" };
    vi.spyOn(console, "error").mockImplementation(() => {});

    const state = await signIn(null, form({ email: "a@b.com", password: "x" }));

    expect(state?.error).toBe(translatorFor("zh-Hans", "auth")("errors.unexpected"));
    expect(state?.error).not.toContain("Database");
    // The zh string is real Chinese, not an English fallback wearing a key name.
    expect(state?.error).toMatch(/[一-鿿]/);
  });

  it("keeps translating the errors it already recognised", async () => {
    signInError = { message: "Invalid login credentials" };
    const state = await signIn(null, form({ email: "a@b.com", password: "x" }));
    expect(state?.error).toBe(translatorFor("zh-Hans", "auth")("errors.invalidCredentials"));
  });

  it("says the same thing in English for an English reader", async () => {
    locale = "en";
    signInError = { message: "Database error querying schema" };
    vi.spyOn(console, "error").mockImplementation(() => {});

    const state = await signIn(null, form({ email: "a@b.com", password: "x" }));

    expect(state?.error).toBe(translatorFor("en", "auth")("errors.unexpected"));
    expect(state?.error).not.toContain("Database");
  });

  it("logs the message it declined to show", async () => {
    signInError = { message: "Database error querying schema" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await signIn(null, form({ email: "a@b.com", password: "x" }));

    expect(spy).toHaveBeenCalledWith(
      "[auth] unmapped Supabase error:",
      "Database error querying schema",
    );
  });
});
