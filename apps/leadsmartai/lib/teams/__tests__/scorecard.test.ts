import { describe, expect, it } from "vitest";
import { buildScorecard, healthOf, median, monthKeys, phaseOf, type ListingRow, type TxRow } from "../scorecard";

const NOW = new Date("2026-09-10T12:00:00Z");

const tx = (over: Partial<TxRow>): TxRow => ({ id: "t", agentId: "a", status: "closed", type: "listing_rep", price: 1_000_000, gci: 25_000, acceptedOn: null, closedOn: "2026-08-15", expectedCloseOn: null, listedOn: null, listPrice: null, terminatedReason: null, address: null, inspectionDue: null, inspectionDone: null, appraisalDue: null, appraisalDone: null, loanDue: null, loanDone: null, ...over });

describe("monthKeys and phaseOf", () => {
  it("lists the twelve months ending now, oldest first", () => {
    const k = monthKeys(NOW);
    expect(k[0]).toBe("2025-10");
    expect(k[11]).toBe("2026-09");
    expect(k).toHaveLength(12);
  });

  it("maps statuses to phases and needs a date to call something closed", () => {
    expect(phaseOf({ status: "closed", closedOn: "2026-08-01", terminatedReason: null })).toBe("closed");
    expect(phaseOf({ status: "closed", closedOn: null, terminatedReason: null })).toBe("other");
    expect(phaseOf({ status: "pending", closedOn: null, terminatedReason: null })).toBe("open");
    expect(phaseOf({ status: "active", closedOn: null, terminatedReason: null })).toBe("open");
    expect(phaseOf({ status: "terminated", closedOn: null, terminatedReason: null })).toBe("terminated");
    expect(phaseOf({ status: "active", closedOn: null, terminatedReason: "buyer walked" })).toBe("terminated");
  });

  it("takes the median of an even and an odd list", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("buildScorecard", () => {
  const transactions: TxRow[] = [
    tx({ id: "1", agentId: "a", closedOn: "2026-08-15", acceptedOn: "2026-07-01", listedOn: "2026-06-01", listPrice: 980_000, price: 1_000_000, gci: 25_000 }),
    tx({ id: "2", agentId: "b", type: "buyer_rep", closedOn: "2026-08-28", acceptedOn: "2026-08-01", price: 600_000, gci: 15_000 }),
    tx({ id: "3", agentId: "a", closedOn: "2026-03-10", acceptedOn: "2026-02-01", listedOn: "2026-01-02", listPrice: 800_000, price: 760_000, gci: 19_000 }),
    // Last year: only the prior period sees it.
    tx({ id: "4", agentId: "c", closedOn: "2025-08-20", price: 2_000_000, gci: 50_000 }),
    // Fell through this year.
    tx({ id: "5", agentId: "b", status: "terminated", closedOn: null, acceptedOn: "2026-05-05", price: 900_000 }),
    // Open, closing within 30 days.
    tx({ id: "6", agentId: "c", status: "pending", closedOn: null, acceptedOn: "2026-09-01", expectedCloseOn: "2026-09-30", price: 985_000 }),
    // Open, closing later, but the inspection deadline passed uncleared.
    tx({ id: "7", agentId: "a", status: "active", closedOn: null, acceptedOn: "2026-09-05", expectedCloseOn: "2026-11-15", price: 1_500_000, address: "12 Main St", inspectionDue: "2026-09-04", inspectionDone: null }),
  ];
  const listings: ListingRow[] = [
    { id: "l1", agentId: "a", status: "active", listPrice: 1_200_000, startedOn: "2026-09-02" },
    { id: "l2", agentId: "b", status: "sold", listPrice: 700_000, startedOn: "2026-06-15" },
    { id: "l3", agentId: "c", status: "contracted", listPrice: 950_000, startedOn: "2026-08-20" },
  ];
  const s = buildScorecard({ now: NOW, members: ["a", "b", "c", "d"], transactions, listings });

  it("puts each closing, contract and listing in its month", () => {
    const aug = s.months.find((m) => m.month === "2026-08")!;
    expect(aug).toEqual({ month: "2026-08", closed: 2, volume: 1_600_000, gci: 40_000, contracts: 1, listingsTaken: 1 });
    expect(s.months.find((m) => m.month === "2026-09")!.contracts).toBe(2);
    expect(s.months.find((m) => m.month === "2026-03")!.closed).toBe(1);
    expect(s.months.find((m) => m.month === "2026-07")!.contracts).toBe(1);
  });

  it("totals the trailing year against the one before", () => {
    expect(s.trailing.closed).toBe(3);
    expect(s.trailing.volume).toBe(2_360_000);
    expect(s.trailing.gci).toBe(59_000);
    expect(s.trailing.avgPrice).toBe(786_667);
    expect(s.trailing.medianPrice).toBe(760_000);
    expect(s.trailing.listingSide).toBe(2);
    expect(s.trailing.buyerSide).toBe(1);
    expect(s.trailing.terminated).toBe(1);
    expect(s.trailing.fallThroughRate).toBeCloseTo(0.25);
    expect(s.trailing.producingAgents).toBe(2);
    expect(s.trailing.closingsPerProducer).toBe(1.5);
    expect(s.prior.closed).toBe(1);
    expect(s.prior.volume).toBe(2_000_000);
    expect(s.members).toBe(4);
  });

  it("measures the market from the office's own closed listings, and the pipeline from what is open", () => {
    expect(s.market.domSample).toBe(2);
    expect(s.market.avgDom).toBe(30);
    expect(s.market.medianDom).toBe(30);
    expect(s.market.saleToListSample).toBe(2);
    expect(s.market.saleToList).toBeCloseTo((1_000_000 / 980_000 + 760_000 / 800_000) / 2, 4);
    expect(s.market.activeListings).toBe(2);
    expect(s.market.activeListVolume).toBe(2_150_000);
    expect(s.market.pending).toEqual({ count: 2, volume: 2_485_000 });
    expect(s.market.closingNext30).toEqual({ count: 1, volume: 985_000 });
  });

  it("grades the pipeline and lists the deals that need a hand, worst first", () => {
    const h = s.market.health;
    expect({ onTrack: h.onTrack, dueSoon: h.dueSoon, atRisk: h.atRisk, atRiskVolume: h.atRiskVolume }).toEqual({ onTrack: 1, dueSoon: 0, atRisk: 1, atRiskVolume: 1_500_000 });
    expect(h.items.map((i) => [i.id, i.issue, i.daysLate])).toEqual([["7", "inspection", 6]]);
  });

  it("is all zeros and nulls for an empty office", () => {
    const e = buildScorecard({ now: NOW, members: [], transactions: [], listings: [] });
    expect(e.months).toHaveLength(12);
    expect(e.trailing.closed).toBe(0);
    expect(e.trailing.avgPrice).toBeNull();
    expect(e.market.avgDom).toBeNull();
    expect(e.market.saleToList).toBeNull();
  });
});

describe("healthOf", () => {
  const base = tx({ id: "h", status: "pending", closedOn: null, expectedCloseOn: "2026-10-20" });
  it("is on track with nothing due inside a week", () => {
    expect(healthOf(base, NOW).health).toBe("on_track");
  });
  it("is due soon inside the week and at risk once a step is late, worst step first", () => {
    expect(healthOf({ ...base, loanDue: "2026-09-15" }, NOW)).toMatchObject({ health: "due_soon", issue: "loan", daysLate: -5 });
    expect(healthOf({ ...base, loanDue: "2026-09-15", appraisalDue: "2026-09-01" }, NOW)).toMatchObject({ health: "at_risk", issue: "appraisal", daysLate: 9 });
    expect(healthOf({ ...base, appraisalDue: "2026-09-01", appraisalDone: "2026-08-30" }, NOW).health).toBe("on_track");
    expect(healthOf({ ...base, expectedCloseOn: "2026-09-01" }, NOW)).toMatchObject({ health: "at_risk", issue: "closing", daysLate: 9 });
  });
});
