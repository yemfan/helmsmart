import { describe, expect, it } from "vitest";
import { buildTeamPerformance, delta, emptyMetrics, sumMetrics, windowOf } from "../performance";

const m = (over: Partial<ReturnType<typeof emptyMetrics>>) => ({ ...emptyMetrics(), ...over });

describe("buildTeamPerformance", () => {
  it("orders by closed volume, then commission, then new leads, and ranks only closers", () => {
    const t = buildTeamPerformance(30, [
      { agentId: "a", role: "member", name: "Ann", email: null, current: m({ closedVolume: 900_000, commission: 22_500, newLeads: 4 }), previous: m({}) },
      { agentId: "b", role: "owner", name: "Bob", email: null, current: m({ closedVolume: 1_500_000, commission: 37_500, newLeads: 1 }), previous: m({ closedVolume: 1_000_000 }) },
      { agentId: "c", role: "member", name: "Cy", email: null, current: m({ newLeads: 12 }), previous: m({ newLeads: 6 }) },
      { agentId: "d", role: "member", name: "Dee", email: null, current: m({ closedVolume: 900_000, commission: 22_500, newLeads: 9 }), previous: m({}) },
    ]);
    expect(t.rows.map((r) => r.agentId)).toEqual(["b", "d", "a", "c"]);
    // Dee and Ann tie on volume and commission: same rank, Dee first on leads.
    expect(t.rows.map((r) => r.rank)).toEqual([1, 2, 2, 0]);
    expect(t.totals.closedVolume).toBe(3_300_000);
    expect(t.totals.newLeads).toBe(26);
    expect(t.previousTotals.closedVolume).toBe(1_000_000);
    expect(t.rows[0]!.previous.closedVolume).toBe(1_000_000);
  });

  it("is empty, with zero totals, for a team with no rows", () => {
    const t = buildTeamPerformance(7, []);
    expect(t.rows).toEqual([]);
    expect(t.totals).toEqual(emptyMetrics());
  });
});

describe("delta", () => {
  it("is a fraction of the previous window, and null when there was nothing before", () => {
    expect(delta(12, 8)).toBeCloseTo(0.5);
    expect(delta(4, 8)).toBeCloseTo(-0.5);
    expect(delta(5, 0)).toBeNull();
  });
});

describe("windowOf", () => {
  const now = Date.parse("2026-09-08T12:00:00Z");
  it("splits timestamps into the current window, the one before, or neither", () => {
    expect(windowOf("2026-09-07T00:00:00Z", now, 30)).toBe("current");
    expect(windowOf("2026-08-01T00:00:00Z", now, 30)).toBe("previous");
    expect(windowOf("2026-06-01T00:00:00Z", now, 30)).toBeNull();
    expect(windowOf("2026-09-09T00:00:00Z", now, 30)).toBeNull();
    expect(windowOf(null, now, 30)).toBeNull();
    expect(windowOf("nonsense", now, 30)).toBeNull();
  });
});

describe("sumMetrics", () => {
  it("adds every metric", () => {
    expect(sumMetrics([m({ hubViews: 2, commission: 1 }), m({ hubViews: 3 })])).toMatchObject({ hubViews: 5, commission: 1, newLeads: 0 });
  });
});
