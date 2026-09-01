import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { extractSummaryMetrics, mapPinterestMetrics } = await import("../pinterest-insights");

describe("extractSummaryMetrics", () => {
  it("finds the numbers under the documented 'all' envelope", () => {
    const body = {
      all: {
        summary_metrics: { IMPRESSION: 420, SAVE: 12, PIN_CLICK: 7 },
        daily_metrics: [{ date: "2026-09-01", data_status: "READY" }],
      },
    };
    expect(extractSummaryMetrics(body)).toEqual({ IMPRESSION: 420, SAVE: 12, PIN_CLICK: 7 });
  });

  it("finds them under an ad-account key too", () => {
    // The bucket key varies with how the Pin is owned. Hard-coding "all" and
    // guessing wrong would render as a Pin with no engagement — silence that
    // looks like data.
    const body = { "549756251234": { summary_metrics: { IMPRESSION: 9 } } };
    expect(extractSummaryMetrics(body)).toEqual({ IMPRESSION: 9 });
  });

  it("falls back to lifetime_metrics", () => {
    expect(extractSummaryMetrics({ all: { lifetime_metrics: { SAVE: 3 } } })).toEqual({ SAVE: 3 });
  });

  it("returns null rather than inventing a shape", () => {
    expect(extractSummaryMetrics(null)).toBeNull();
    expect(extractSummaryMetrics({})).toBeNull();
    expect(extractSummaryMetrics({ all: { daily_metrics: [] } })).toBeNull();
    expect(extractSummaryMetrics("nope")).toBeNull();
  });

  it("survives a self-referencing object without hanging", () => {
    const body: Record<string, unknown> = { all: {} };
    (body.all as Record<string, unknown>).self = body;
    expect(extractSummaryMetrics(body)).toBeNull();
  });
});

describe("mapPinterestMetrics", () => {
  it("maps Pinterest's vocabulary onto the shared shape", () => {
    expect(mapPinterestMetrics({ IMPRESSION: 420, SAVE: 12, PIN_CLICK: 7 })).toEqual({
      likes: null,
      comments: null,
      shares: null,
      saves: 12,
      impressions: 420,
      reach: null,
      clicks: 7,
      reactionsTotal: null,
    });
  });

  it("leaves unreported metrics null rather than writing a fake zero", () => {
    // Pinterest has no likes/comments/shares/reach at Pin level. "0 likes" and
    // "this platform doesn't report likes" are different facts, and only one
    // of them is true.
    const m = mapPinterestMetrics({ IMPRESSION: 5 })!;
    expect(m.likes).toBeNull();
    expect(m.comments).toBeNull();
    expect(m.shares).toBeNull();
    expect(m.reach).toBeNull();
  });

  it("keeps a genuine zero", () => {
    // A Pin that truly got no saves reports 0, and that is worth storing.
    expect(mapPinterestMetrics({ IMPRESSION: 100, SAVE: 0 })?.saves).toBe(0);
  });

  it("accepts numeric strings", () => {
    expect(mapPinterestMetrics({ IMPRESSION: "31" })?.impressions).toBe(31);
  });

  it("returns null when nothing usable came back", () => {
    expect(mapPinterestMetrics(null)).toBeNull();
    expect(mapPinterestMetrics({})).toBeNull();
    expect(mapPinterestMetrics({ SOMETHING_ELSE: 4 })).toBeNull();
  });
});
