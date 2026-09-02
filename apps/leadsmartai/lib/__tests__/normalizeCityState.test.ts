import { describe, expect, it } from "vitest";

import { normalizeCityState } from "../cityDataEngine";

/**
 * How a city reaches a lookup.
 *
 * Both callers are places where the input is not under our control: an AI tool
 * whose schema describes the city as "City name, optionally 'City, ST'" beside
 * a separate optional state, and a public API route taking query params. So
 * every reasonable spelling has to land on the same row.
 *
 * The case that broke: Max passed `city: "Walnut, Ca"` AND `state: "CA"`,
 * exactly as the schema allows. The comma-split was gated on there being no
 * state, so it did not run, and the query looked for a city literally named
 * "Walnut, Ca". Nothing matches that, and the agent was told there was no
 * cached data for a market whose row was sitting right there — which sends
 * them off to redo work that was already done.
 */
describe("normalizeCityState", () => {
  it("splits an inline state", () => {
    expect(normalizeCityState("Walnut, CA")).toEqual({ city: "Walnut", state: "CA" });
  });

  it("splits an inline state even when a state is ALSO passed", () => {
    // The regression. Both forms supplied at once is legal per the tool schema.
    expect(normalizeCityState("Walnut, Ca", "CA")).toEqual({ city: "Walnut", state: "CA" });
  });

  it("lets the explicit state win over a conflicting suffix", () => {
    // The argument was chosen deliberately; the suffix is often just how
    // someone happened to type it.
    expect(normalizeCityState("Walnut, TX", "CA")).toEqual({ city: "Walnut", state: "CA" });
  });

  it("upper-cases the state from either source", () => {
    expect(normalizeCityState("Walnut, ca").state).toBe("CA");
    expect(normalizeCityState("Walnut", "ca").state).toBe("CA");
  });

  it("title-cases the city", () => {
    expect(normalizeCityState("walnut, ca").city).toBe("Walnut");
    expect(normalizeCityState("WALNUT", "CA").city).toBe("Walnut");
  });

  it("tolerates a trailing comma with no state", () => {
    expect(normalizeCityState("Walnut,")).toEqual({ city: "Walnut", state: "" });
  });

  it("returns empty for an empty city", () => {
    expect(normalizeCityState("")).toEqual({ city: "", state: "" });
    expect(normalizeCityState("   ", "CA")).toEqual({ city: "", state: "" });
  });
});
