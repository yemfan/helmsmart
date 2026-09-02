import { describe, expect, it } from "vitest";

import { MIN_SECRET_LEN, isWeakSecret, secretMatches } from "@/lib/inbound/secret";

/**
 * This guards the ONLY authentication on `/api/inbound/sendgrid`. SendGrid
 * Inbound Parse does not sign its requests, so a secret in the URL is all we
 * get, and the endpoint is public — anyone can POST at it as often as they
 * like. That is exactly the setting where a leaky comparison matters.
 */

const SECRET = "s3cret-value-long-enough-here";

describe("secretMatches", () => {
  it("accepts the right secret", () => {
    expect(secretMatches(SECRET, SECRET)).toBe(true);
  });

  it("rejects a wrong one", () => {
    expect(secretMatches("nope", SECRET)).toBe(false);
  });

  it("rejects a near-miss, including one differing only in the last byte", () => {
    expect(secretMatches(`${SECRET}x`, SECRET)).toBe(false);
    expect(secretMatches(SECRET.slice(0, -1) + "X", SECRET)).toBe(false);
  });

  it("does not throw on a length mismatch", () => {
    // `timingSafeEqual` throws when buffers differ in length. Hashing both
    // sides first is what prevents that — and branching on length instead
    // would have leaked how long the secret is.
    expect(() => secretMatches("a", SECRET)).not.toThrow();
    expect(secretMatches("a", SECRET)).toBe(false);
    expect(secretMatches("a".repeat(5000), SECRET)).toBe(false);
  });

  it("treats a missing token as a failed match, never as a pass", () => {
    // The route passes `searchParams.get("k") ?? ""`. If absent compared equal
    // to an unset secret, an unauthenticated POST would sail through.
    expect(secretMatches(null, SECRET)).toBe(false);
    expect(secretMatches(undefined, SECRET)).toBe(false);
    expect(secretMatches("", SECRET)).toBe(false);
  });

  it("is exact — no trimming, no case folding", () => {
    expect(secretMatches(` ${SECRET}`, SECRET)).toBe(false);
    expect(secretMatches(SECRET.toUpperCase(), SECRET)).toBe(false);
  });

  it("handles non-ASCII without throwing", () => {
    expect(secretMatches("密码-value", "密码-value")).toBe(true);
    expect(secretMatches("密码-value", "different")).toBe(false);
  });
});

describe("isWeakSecret", () => {
  it("flags a secret too short for something that rides in a URL", () => {
    expect(isWeakSecret("short")).toBe(true);
    expect(isWeakSecret("")).toBe(true);
  });

  it("passes one of adequate length", () => {
    expect(isWeakSecret("x".repeat(MIN_SECRET_LEN))).toBe(false);
    expect(isWeakSecret(SECRET)).toBe(false);
  });

  it("is a warning signal, not a gate — callers must still compare", () => {
    // Weakness never grants access; only secretMatches decides.
    expect(secretMatches("short", "short")).toBe(true);
    expect(isWeakSecret("short")).toBe(true);
  });
});
