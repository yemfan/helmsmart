import { describe, it, expect } from "vitest";
import { normalizeAddress } from "../normalizeAddress";

describe("normalizeAddress", () => {
  it("title-cases and uppercases directional + state", () => {
    expect(normalizeAddress("220 e hellman ave, monterey park, ca 91755")).toBe(
      "220 E Hellman Ave, Monterey Park, CA 91755",
    );
  });

  it("collapses whitespace and fixes comma spacing", () => {
    expect(normalizeAddress("  126   palatine dr ,alhambra , CA 91801 ")).toBe(
      "126 Palatine Dr, Alhambra, CA 91801",
    );
  });

  it("keeps ZIP+4 and ordinals intact", () => {
    expect(normalizeAddress("1 nw 22nd st, miami, fl 33127-1234")).toBe(
      "1 NW 22nd St, Miami, FL 33127-1234",
    );
  });

  it("only uppercases a state code in the trailing segment", () => {
    // "or" here is a street word, not Oregon — must stay title-cased.
    expect(normalizeAddress("100 or ange blossom way, austin, tx 78701")).toBe(
      "100 Or Ange Blossom Way, Austin, TX 78701",
    );
  });

  it("handles empty / whitespace input", () => {
    expect(normalizeAddress("")).toBe("");
    expect(normalizeAddress("   ")).toBe("");
  });
});
