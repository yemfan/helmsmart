import { describe, expect, it } from "vitest";
import { cmaBasis, confidenceBand } from "../confidence";
import type { CmaCompRow } from "@/lib/cma/types";

const comp = (over: Partial<CmaCompRow>): CmaCompRow => ({
  address: "1 Main St",
  price: 1_000_000,
  sqft: 1500,
  beds: 3,
  baths: 2,
  distanceMiles: 0.5,
  soldDate: "2026-07-01",
  propertyType: null,
  pricePerSqft: 666,
  ...over,
});

describe("CMA confidence", () => {
  it("bands the engine's 1–95 score", () => {
    expect(confidenceBand(90)).toBe("high");
    expect(confidenceBand(75)).toBe("high");
    expect(confidenceBand(74)).toBe("medium");
    expect(confidenceBand(50)).toBe("medium");
    expect(confidenceBand(49)).toBe("low");
    expect(confidenceBand(null)).toBeNull();
    expect(confidenceBand(Number.NaN)).toBeNull();
  });

  it("derives the basis from the comps and the range", () => {
    const now = new Date("2026-09-06T00:00:00Z");
    const b = cmaBasis(
      { estimatedValue: 1_000_000, low: 920_000, high: 1_080_000 },
      [comp({ distanceMiles: 0.4, soldDate: "2026-08-20" }), comp({ distanceMiles: 2.26, soldDate: "2026-03-01" })],
      now,
    );
    expect(b.compCount).toBe(2);
    expect(b.maxDistanceMiles).toBe(2.3);
    expect(b.newestSoldMonthsAgo).toBe(0);
    expect(b.spreadPct).toBe(8);
  });

  it("survives a failed $0 valuation and undated comps", () => {
    const b = cmaBasis({ estimatedValue: 0, low: 0, high: 0 }, [comp({ soldDate: "", distanceMiles: Number.NaN })]);
    expect(b.spreadPct).toBeNull();
    expect(b.newestSoldMonthsAgo).toBeNull();
    expect(b.maxDistanceMiles).toBeNull();
    expect(b.compCount).toBe(1);
    expect(cmaBasis(null, null)).toEqual({ compCount: 0, maxDistanceMiles: null, newestSoldMonthsAgo: null, spreadPct: null });
  });
});
