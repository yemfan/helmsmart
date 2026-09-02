import { describe, it, expect } from "vitest";
import { formatPhoneForSpeech, phoneLast10, normalizePhoneE164 } from "../phone";

describe("formatPhoneForSpeech", () => {
  it("spells a US E.164 number digit by digit, grouped", () => {
    expect(formatPhoneForSpeech("+16267557917")).toBe("6 2 6, 7 5 5, 7 9 1 7");
  });

  it("never emits the written form TTS reads as an amount of money", () => {
    // "(626) 755-7917" is spoken as "six hundred twenty-six, seven hundred
    // fifty-five..." — the whole reason this helper exists.
    const out = formatPhoneForSpeech("+16267557917");
    expect(out).not.toContain("(");
    expect(out).not.toContain("-");
  });

  it("accepts loose input formats and normalizes to the same spoken form", () => {
    const expected = "6 2 6, 7 5 5, 7 9 1 7";
    expect(formatPhoneForSpeech("(626) 755-7917")).toBe(expected);
    expect(formatPhoneForSpeech("626-755-7917")).toBe(expected);
    expect(formatPhoneForSpeech("1 626 755 7917")).toBe(expected);
  });

  it("returns a non-US number untouched rather than reading back a wrong one", () => {
    // Regression: slice(-10) turned +44 20 7183 8750 into "2071838750", so a UK
    // caller heard a number that wasn't theirs confirmed back as theirs.
    expect(formatPhoneForSpeech("+442071838750")).toBe("+442071838750");
    expect(formatPhoneForSpeech("+8613912345678")).toBe("+8613912345678");
  });

  it("returns anything too short untouched", () => {
    expect(formatPhoneForSpeech("12345")).toBe("12345");
    expect(formatPhoneForSpeech("")).toBe("");
  });
});

describe("phoneLast10", () => {
  it("gives the same match key for every stored shape of one number", () => {
    const key = "6267557917";
    expect(phoneLast10("+16267557917")).toBe(key);
    expect(phoneLast10("(626) 755-7917")).toBe(key);
    expect(phoneLast10("626-755-7917")).toBe(key);
    expect(phoneLast10("1 626 755 7917")).toBe(key);
  });

  it("truncates a long international number — fine for a match key, both sides", () => {
    // Deliberately unlike formatPhoneForSpeech: truncation is stable on both
    // sides of a comparison, so it matches; it is only wrong when read aloud.
    expect(phoneLast10("+442071838750")).toBe("2071838750");
  });

  it("returns empty for anything with fewer than ten digits, so it never matches", () => {
    expect(phoneLast10("12345")).toBe("");
    expect(phoneLast10("")).toBe("");
    expect(phoneLast10(null)).toBe("");
    expect(phoneLast10(undefined)).toBe("");
  });
});

describe("normalizePhoneE164", () => {
  it("normalizes US input with and without the country code", () => {
    expect(normalizePhoneE164("(626) 755-7917")).toEqual({ ok: true, value: "+16267557917" });
    expect(normalizePhoneE164("+1 626 755 7917")).toEqual({ ok: true, value: "+16267557917" });
  });

  it("rejects a dropped digit rather than storing an unroutable number", () => {
    expect(normalizePhoneE164("626-755-791").ok).toBe(false);
  });
});
