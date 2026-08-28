import { describe, it, expect } from "vitest";

/**
 * The two string helpers behind the fallback reply. Re-implemented here rather
 * than imported because service.ts pulls in the OpenAI client at module load.
 *
 * They exist because a real customer received:
 *   "Hi Angel Zhao — thanks for texting about 1613 S Atlantic Blvd apt b,
 *    Alhambra, CA 91803, USA."
 * Full legal name, full postal address including the country, recited back to
 * someone about their own home.
 */
const firstName = (full: string | null | undefined): string => {
  const n = (full ?? "").trim().split(/\s+/)[0] ?? "";
  return n || "there";
};

const shortAddress = (addr: string | null | undefined): string => {
  const parts = (addr ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts[0]}, ${parts[1]}`;
};

describe("fallback reply wording", () => {
  it("greets by first name, not by database record", () => {
    expect(firstName("Angel Zhao")).toBe("Angel");
    expect(firstName("  Michael Ye  ")).toBe("Michael");
  });

  it("falls back to 'there' rather than an empty greeting", () => {
    expect(firstName(null)).toBe("there");
    expect(firstName("")).toBe("there");
    expect(firstName("   ")).toBe("there");
  });

  it("drops the ZIP and the country from a postal address", () => {
    expect(shortAddress("1613 S Atlantic Blvd apt b, Alhambra, CA 91803, USA")).toBe(
      "1613 S Atlantic Blvd apt b, Alhambra",
    );
  });

  it("handles an address with no commas", () => {
    expect(shortAddress("Alhambra")).toBe("Alhambra");
    expect(shortAddress(null)).toBe("");
  });

  it("never leaves a trailing comma", () => {
    for (const a of ["A, B, C", "A,", "A", "", null]) {
      expect(shortAddress(a).endsWith(","), String(a)).toBe(false);
    }
  });
});
