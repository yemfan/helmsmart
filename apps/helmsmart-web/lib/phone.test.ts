import { describe, it, expect } from "vitest";
import { formatPhoneForSpeech } from "./phone";

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

  it("falls back to the raw input rather than mangling a non-US number", () => {
    expect(formatPhoneForSpeech("+442071838750")).toBe("+442071838750");
    expect(formatPhoneForSpeech("12345")).toBe("12345");
  });

  it("returns an empty string for missing input", () => {
    expect(formatPhoneForSpeech("")).toBe("");
  });
});
