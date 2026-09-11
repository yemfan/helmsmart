import { describe, expect, it } from "vitest";
import { phoneLast10, phoneMatchVariants } from "./phone";

/** How one US number turns up in a tenant's data: caller ID, imports, and typed by hand. */
const STORED_SHAPES = [
  "+14155550143",
  "4155550143",
  "14155550143",
  "+1 4155550143",
  "(415) 555-0143",
  "(415)555-0143",
  "415-555-0143",
  "415.555.0143",
  "415 555 0143",
  "1-415-555-0143",
  "+1 (415) 555-0143",
  "+1 415-555-0143",
  "+1 415 555 0143",
  "+1-415-555-0143",
];

describe("phoneMatchVariants", () => {
  it.each(STORED_SHAPES)("finds a client stored as %s for caller ID +14155550143", (stored) => {
    expect(phoneMatchVariants("+14155550143")).toContain(stored);
  });

  it.each(STORED_SHAPES)("finds a client stored as caller ID when the lookup starts from %s", (typed) => {
    // Consent looks up from whatever shape the send path holds, not always E.164.
    expect(phoneMatchVariants(typed)).toContain("+14155550143");
    expect(phoneMatchVariants(typed)).toContain("(415) 555-0143");
  });

  it("names only the one number, once each", () => {
    const v = phoneMatchVariants("(415) 555-0143");
    expect(new Set(v).size).toBe(v.length);
    for (const shape of v) expect(phoneLast10(shape)).toBe("4155550143");
  });

  it("does not match a different number that shares the last four digits", () => {
    expect(phoneMatchVariants("+14155550143")).not.toContain("(415) 777-0143");
  });

  it("adds the E.164 form of an international number", () => {
    expect(phoneMatchVariants("+44 20 7183 8750")).toContain("+442071838750");
  });

  it("passes through a number it can't read and drops an empty one", () => {
    expect(phoneMatchVariants("12345")).toEqual(["12345"]);
    expect(phoneMatchVariants("")).toEqual([]);
    expect(phoneMatchVariants("  ")).toEqual([]);
    expect(phoneMatchVariants(null)).toEqual([]);
  });
});
