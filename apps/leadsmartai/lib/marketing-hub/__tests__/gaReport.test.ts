import { describe, expect, it } from "vitest";
import { buildGaReport, cachedGaReport, gaPropertyId, matchGaProperty, parseRunReport } from "../gaReport";

const channels = {
  dimensionHeaders: [{ name: "sessionDefaultChannelGroup" }],
  metricHeaders: [{ name: "sessions" }, { name: "totalUsers" }, { name: "screenPageViews" }, { name: "keyEvents" }],
  rows: [
    { dimensionValues: [{ value: "Direct" }], metricValues: [{ value: "12" }, { value: "10" }, { value: "30" }, { value: "1" }] },
    { dimensionValues: [{ value: "Organic Search" }], metricValues: [{ value: "40" }, { value: "35" }, { value: "90" }, { value: "3" }] },
    { dimensionValues: [{ value: "Unassigned" }], metricValues: [{ value: "0" }, { value: "0" }, { value: "0" }, { value: "0" }] },
  ],
  totals: [{ metricValues: [{ value: "52" }, { value: "45" }, { value: "120" }, { value: "4" }] }],
};

describe("parseRunReport", () => {
  it("names metrics by header and keeps blanks null", () => {
    const p = parseRunReport({ metricHeaders: [{ name: "sessions" }, { name: "keyEvents" }], rows: [{ metricValues: [{ value: "5" }, { value: "" }] }] });
    expect(p.rows[0]!.metrics).toEqual({ sessions: 5, keyEvents: null });
    expect(p.totals).toBeNull();
  });
});

describe("buildGaReport", () => {
  it("orders channels busiest first, drops empty ones, and takes totals from the aggregation row", () => {
    const r = buildGaReport({
      channels,
      hub: { metricHeaders: [{ name: "sessions" }, { name: "totalUsers" }, { name: "screenPageViews" }, { name: "keyEvents" }], rows: [{ metricValues: [{ value: "20" }, { value: "18" }, { value: "44" }, { value: "2" }] }] },
      events: {
        dimensionHeaders: [{ name: "eventName" }],
        metricHeaders: [{ name: "eventCount" }],
        rows: [
          { dimensionValues: [{ value: "ai_open" }], metricValues: [{ value: "7" }] },
          { dimensionValues: [{ value: "home_value_completed" }], metricValues: [{ value: "9" }] },
          { dimensionValues: [{ value: "tool_opened" }], metricValues: [{ value: "0" }] },
        ],
      },
    });
    expect(r.all).toEqual({ sessions: 52, users: 45, pageViews: 120, keyEvents: 4 });
    expect(r.channels.map((c) => c.channel)).toEqual(["Organic Search", "Direct"]);
    expect(r.hub).toEqual({ sessions: 20, users: 18, pageViews: 44, keyEvents: 2 });
    expect(r.events).toEqual([
      { name: "home_value_completed", count: 9 },
      { name: "ai_open", count: 7 },
    ]);
  });

  it("is empty, not zero, when Google returns no rows", () => {
    const r = buildGaReport({ channels: { metricHeaders: [] }, hub: {}, events: null });
    expect(r.all).toEqual({ sessions: null, users: null, pageViews: null, keyEvents: null });
    expect(r.hub).toBeNull();
    expect(r.channels).toEqual([]);
    expect(r.events).toEqual([]);
  });

  it("sums channels when no aggregation row came back", () => {
    const r = buildGaReport({ channels: { ...channels, totals: undefined }, hub: null, events: null });
    expect(r.all.sessions).toBe(52);
    expect(r.all.users).toBe(45);
    expect(r.all.pageViews).toBeNull();
  });
});

describe("matchGaProperty", () => {
  const props = [
    { id: "1", name: "Brokerage site", measurementIds: ["G-AAA111"] },
    { id: "2", name: "My hub", measurementIds: ["G-BBB222"] },
  ];
  it("matches on the measurement id the agent typed, case-insensitively", () => {
    expect(matchGaProperty(props, " g-bbb222 ")?.id).toBe("2");
  });
  it("takes the only property when there is one, and asks otherwise", () => {
    expect(matchGaProperty(props, "G-NOPE")).toBeNull();
    expect(matchGaProperty(props, null)).toBeNull();
    expect(matchGaProperty([props[0]!], null)?.id).toBe("1");
    expect(matchGaProperty([], "G-AAA111")).toBeNull();
  });
});

describe("gaPropertyId", () => {
  it("accepts the numeric id with or without the resource prefix", () => {
    expect(gaPropertyId("properties/123456")).toBe("123456");
    expect(gaPropertyId(" 987 ")).toBe("987");
    expect(gaPropertyId("G-ABC")).toBeNull();
    expect(gaPropertyId("")).toBeNull();
  });
});

describe("cachedGaReport", () => {
  const report = { all: { sessions: 1, users: 1, pageViews: 1, keyEvents: 0 }, hub: null, channels: [], events: [] };
  it("reads one window and says whether it is still fresh", () => {
    const now = Date.parse("2026-09-06T12:00:00Z");
    const cache = { "30": { report, refreshedAt: "2026-09-06T11:30:00Z" }, "7": { report, refreshedAt: "2026-09-05T11:30:00Z" } };
    expect(cachedGaReport(cache, 30, now, 3_600_000)?.fresh).toBe(true);
    expect(cachedGaReport(cache, 7, now, 3_600_000)?.fresh).toBe(false);
    expect(cachedGaReport(cache, 90, now, 3_600_000)).toBeNull();
    expect(cachedGaReport(null, 30, now, 3_600_000)).toBeNull();
    expect(cachedGaReport({ "30": { report, refreshedAt: "never" } }, 30, now, 1)).toBeNull();
  });
});
