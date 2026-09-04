import { describe, expect, it } from "vitest";

import { stateCode } from "../stateCode";

/**
 * Every spelling that reached production and split a market in two. The pairs
 * below are the real ones from `city_market_data`, not invented examples.
 */
describe("stateCode", () => {
  it("maps the full names that actually duplicated a market", () => {
    for (const [name, code] of [
      ["California", "CA"],
      ["TEXAS", "TX"],
      ["Ohio", "OH"],
      ["michigan", "MI"],
      ["Arizona", "AZ"],
      ["Tennessee", "TN"],
      ["Virginia", "VA"],
      ["Florida", "FL"],
      ["Oregon", "OR"],
      ["Washington", "WA"],
    ] as const) {
      expect(stateCode(name), name).toBe(code);
    }
  });

  it("passes a code through, uppercased", () => {
    expect(stateCode("CA")).toBe("CA");
    expect(stateCode("ca")).toBe("CA");
    expect(stateCode(" Tx ")).toBe("TX");
  });

  it("handles the two-word states, including inner whitespace", () => {
    expect(stateCode("New York")).toBe("NY");
    expect(stateCode("new  hampshire")).toBe("NH");
    expect(stateCode("District of Columbia")).toBe("DC");
    expect(stateCode("west virginia")).toBe("WV");
  });

  it("does not confuse Virginia with West Virginia", () => {
    // Or Dakota with Dakota. A wrong code is a lookup against the wrong
    // market, which is worse than not resolving at all.
    expect(stateCode("Virginia")).toBe("VA");
    expect(stateCode("West Virginia")).toBe("WV");
    expect(stateCode("North Dakota")).toBe("ND");
    expect(stateCode("South Dakota")).toBe("SD");
    expect(stateCode("North Carolina")).toBe("NC");
    expect(stateCode("South Carolina")).toBe("SC");
  });

  it("leaves an unrecognised string alone rather than guessing", () => {
    // A miss is recoverable; a confidently wrong state is not.
    expect(stateCode("Ontario")).toBe("ONTARIO");
    expect(stateCode("ZZ")).toBe("ZZ");
  });

  it("returns empty for nothing", () => {
    expect(stateCode("")).toBe("");
    expect(stateCode("   ")).toBe("");
    expect(stateCode(null)).toBe("");
    expect(stateCode(undefined)).toBe("");
  });

  it("is idempotent, so a normalised row normalises to itself", () => {
    // The migration renames survivors to the code; a later refresh must land
    // on the same key rather than creating the duplicate again.
    for (const s of ["California", "CA", "new york", "NY"]) {
      expect(stateCode(stateCode(s))).toBe(stateCode(s));
    }
  });
});
