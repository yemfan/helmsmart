import { describe, expect, it } from "vitest";
import { describeApiError, serializeError } from "./describeApiError";

/**
 * Regression cover for a real incident: a PostgREST 503 during a connection
 * spike surfaced to the user as a bare "Server error" next to a URL field,
 * implying their input was rejected. It wasn't — the write never ran.
 */
describe("describeApiError", () => {
  it("keeps the message of a thrown Error", () => {
    expect(describeApiError(new Error("Boom")).message).toBe("Boom");
  });

  it("reads a PostgrestError, which is NOT an Error instance", () => {
    // This is the case the old `e instanceof Error` check silently dropped.
    const pgErr = { message: "duplicate key value violates unique constraint", code: "23505" };
    expect(pgErr).not.toBeInstanceOf(Error);
    expect(describeApiError(pgErr).message).toContain("duplicate key");
    expect(describeApiError(pgErr).status).toBe(500);
  });

  it("treats overload/transport failures as transient and says so", () => {
    for (const raw of [
      { message: "Service Unavailable", code: "503" },
      new Error("fetch failed"),
      new Error("remaining connection slots are reserved"),
      new Error("sorry, too many clients already"),
      new Error("statement timeout"),
      new Error("read ECONNRESET"),
    ]) {
      const out = describeApiError(raw);
      expect(out.status, `${JSON.stringify(raw)} should be 503`).toBe(503);
      expect(out.message).toMatch(/try again in a moment/i);
      // The user must be told their data did not land — silence here is what
      // makes people re-enter a form they already successfully filled in.
      expect(out.message).toMatch(/weren't saved/i);
    }
  });

  it("never returns a bare 'Server error'", () => {
    for (const e of [undefined, null, {}, 0, ""]) {
      expect(describeApiError(e).message).not.toBe("Server error");
      expect(describeApiError(e).message.length).toBeGreaterThan(10);
    }
  });

  it("uses the caller's fallback when nothing readable was thrown", () => {
    expect(describeApiError({}, "Could not save your branding settings.").message).toBe(
      "Could not save your branding settings.",
    );
  });

  it("caps runaway messages so a stack dump can't reach the UI", () => {
    expect(describeApiError(new Error("x".repeat(5000))).message.length).toBeLessThanOrEqual(300);
  });
});

describe("serializeError", () => {
  it("keeps full detail for the server log, including non-Error objects", () => {
    expect(serializeError(new Error("Boom"))).toContain("Boom");
    expect(serializeError({ message: "pg down", code: "503" })).toContain("503");
  });

  it("does not throw on values JSON cannot handle", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => serializeError(circular)).not.toThrow();
    expect(() => serializeError(BigInt(1))).not.toThrow();
  });
});
