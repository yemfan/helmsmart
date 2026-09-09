import { describe, expect, it } from "vitest";
import { buildTeamPerformance, emptyMetrics } from "../performance";
import { activityOf, buildRetentionSignals, riseReasons, riskReasons } from "../retention";

const m = (over: Partial<ReturnType<typeof emptyMetrics>>) => ({ ...emptyMetrics(), ...over });

describe("riskReasons", () => {
  it("says gone quiet when a real quarter is followed by nothing", () => {
    expect(riskReasons(m({}), m({ newLeads: 6, conversations: 8 }))).toEqual(["gone_quiet"]);
  });

  it("says slipping at half or less, and nothing for a small previous quarter", () => {
    expect(riskReasons(m({ newLeads: 5 }), m({ newLeads: 12 }))).toEqual(["slipping"]);
    expect(riskReasons(m({ newLeads: 7 }), m({ newLeads: 12 }))).toEqual([]);
    expect(riskReasons(m({}), m({ newLeads: 4 }))).toEqual([]);
  });

  it("flags closings that stopped, on top of activity", () => {
    expect(riskReasons(m({ newLeads: 20 }), m({ newLeads: 20, dealsClosed: 2 }))).toEqual(["closings_down"]);
    expect(riskReasons(m({}), m({ newLeads: 20, dealsClosed: 3 }))).toEqual(["gone_quiet", "closings_down"]);
    // One closing last quarter and none now is normal variance, not a signal.
    expect(riskReasons(m({ newLeads: 20 }), m({ newLeads: 20, dealsClosed: 1 }))).toEqual([]);
  });
});

describe("riseReasons", () => {
  it("needs a real level, then half again or a start from nothing", () => {
    expect(riseReasons(m({ newLeads: 12 }), m({}))).toEqual(["rising"]);
    expect(riseReasons(m({ newLeads: 15 }), m({ newLeads: 10 }))).toEqual(["rising"]);
    expect(riseReasons(m({ newLeads: 14 }), m({ newLeads: 10 }))).toEqual([]);
    expect(riseReasons(m({ newLeads: 6 }), m({}))).toEqual([]);
  });

  it("names a first closing", () => {
    expect(riseReasons(m({ dealsClosed: 1 }), m({}))).toEqual(["new_closer"]);
    expect(riseReasons(m({ dealsClosed: 2 }), m({ dealsClosed: 1 }))).toEqual([]);
  });
});

describe("buildRetentionSignals", () => {
  it("splits the team, never lists an agent on both sides, and puts the biggest producer at risk first", () => {
    const perf = buildTeamPerformance(90, [
      { agentId: "a", role: "member", name: "Ann", email: null, current: m({}), previous: m({ newLeads: 30, dealsClosed: 3, closedVolume: 2_000_000 }) },
      { agentId: "b", role: "member", name: "Bob", email: null, current: m({ newLeads: 5 }), previous: m({ newLeads: 12, closedVolume: 500_000 }) },
      { agentId: "c", role: "member", name: "Cy", email: null, current: m({ newLeads: 20, dealsClosed: 1 }), previous: m({ newLeads: 2 }) },
      { agentId: "d", role: "member", name: "Dee", email: null, current: m({ newLeads: 3 }), previous: m({ newLeads: 2 }) },
      // Closed once, then activity vanished: at risk, not "new closer".
      { agentId: "e", role: "member", name: "Eve", email: null, current: m({ dealsClosed: 1 }), previous: m({ newLeads: 40 }) },
    ]);
    const s = buildRetentionSignals(90, perf.rows);
    expect(s.atRisk.map((r) => [r.agentId, r.reasons])).toEqual([
      ["a", ["gone_quiet", "closings_down"]],
      ["b", ["slipping"]],
      ["e", ["gone_quiet"]],
    ]);
    expect(s.rising.map((r) => [r.agentId, r.reasons])).toEqual([["c", ["rising", "new_closer"]]]);
    expect(s.considered).toBe(4);
  });

  it("is empty for an empty team", () => {
    expect(buildRetentionSignals(90, [])).toEqual({ days: 90, atRisk: [], rising: [], considered: 0 });
  });
});

describe("activityOf", () => {
  it("counts the daily work, not the money", () => {
    expect(activityOf(m({ newLeads: 1, conversations: 2, callsAnswered: 3, appointments: 4, closedVolume: 9_999_999, dealsClosed: 5 }))).toBe(10);
  });
});
