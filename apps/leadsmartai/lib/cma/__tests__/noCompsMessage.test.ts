import { describe, expect, it } from "vitest";

import { noCompsMessage } from "@repo/valuation/noCompsMessage";

/**
 * The "no comps" message told every agent to "include city, state, and ZIP",
 * including the ones who had typed all three. A QA pass filed it as the CMA
 * asking for data it had already been given.
 *
 * These cases pin the distinction the message now makes: advice only when it
 * is actionable, and the honest "nothing came back" when it is not.
 */
describe("noCompsMessage", () => {
  it("does not ask for city, state or ZIP when the address already has all three", () => {
    const msg = noCompsMessage("3400 N Lake Shore Dr, Chicago, IL 60657");
    expect(msg).not.toMatch(/city/i);
    expect(msg).not.toMatch(/ZIP/i);
    expect(msg).toMatch(/couldn't find recent comparable sales/i);
  });

  it("accepts a fully-qualified address without a comma before the state", () => {
    expect(noCompsMessage("742 Evergreen Terrace, Springfield IL 62704")).not.toMatch(
      /missing/i,
    );
  });

  it("does not mistake a street-name word for the state", () => {
    // "St" here is part of the street, not Utah — the address has no state.
    expect(noCompsMessage("123 Main St, Chicago 60601")).toMatch(/missing the state/i);
  });

  it("names only what is actually absent", () => {
    expect(noCompsMessage("123 Main St, Chicago, IL")).toMatch(/missing the ZIP\b/);
    expect(noCompsMessage("123 Main St")).toMatch(/missing the city, state and ZIP/);
  });

  it("treats an empty address as missing everything rather than throwing", () => {
    expect(() => noCompsMessage("")).not.toThrow();
    expect(noCompsMessage("")).toMatch(/missing/i);
  });
});
