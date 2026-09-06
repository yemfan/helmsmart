import { describe, expect, it } from "vitest";
import { sourceFunnel, summariseAds, summariseSocial } from "../marketingMetrics";

describe("summariseSocial", () => {
  it("sums known metrics per platform and keeps unknown ones null", () => {
    const s = summariseSocial([
      { platform: "instagram", status: "published", metrics: { likes: 3, comments: 1, impressions: null }, metrics_refreshed_at: "2026-09-06T10:00:00Z", caption: "A" },
      { platform: "instagram", status: "published", metrics: { likes: 2, comments: 0, impressions: 120 }, metrics_refreshed_at: "2026-09-06T11:00:00Z", caption: "B" },
      { platform: "facebook", status: "published", metrics: { likes: null, impressions: null } },
      { platform: "linkedin", status: "published", metrics: {} },
      { platform: "tiktok", status: "failed", metrics: {} },
    ]);
    const ig = s.platforms.find((p) => p.platform === "instagram")!;
    expect(ig.posts).toBe(2);
    expect(ig.measured).toBe(2);
    expect(ig.metrics).toMatchObject({ likes: 5, comments: 1, impressions: 120, reach: null, engagement: 6 });
    expect(ig.lastRefreshedAt).toBe("2026-09-06T11:00:00Z");

    // Facebook: supported but nothing came back → no_data, not zeros.
    const fb = s.platforms.find((p) => p.platform === "facebook")!;
    expect(fb.metrics).toBeNull();
    expect(fb.reason).toBe("no_data");

    // LinkedIn: personal-post analytics are not available to apps → unsupported.
    expect(s.platforms.find((p) => p.platform === "linkedin")!.reason).toBe("unsupported");
    // Failed posts are not posts.
    expect(s.platforms.find((p) => p.platform === "tiktok")).toBeUndefined();

    expect(s.totals).toEqual({ posts: 4, impressions: 120, reach: null, clicks: null, engagement: 6 });
    expect(s.topPosts.map((p) => p.caption)).toEqual(["A", "B"]);
  });
});

describe("summariseAds", () => {
  it("prefers received leads, derives CPL, and flags stale active campaigns", () => {
    const now = Date.parse("2026-09-06T12:00:00Z");
    const a = summariseAds(
      [
        { id: "1", name: "Sellers", status: "active", metrics: { impressions: 1000, clicks: 40, spendCents: 5000, leads: 1 }, leads_received_count: 4, metrics_refreshed_at: "2026-09-06T11:00:00Z" },
        { id: "2", name: "Buyers", status: "active", metrics: {}, leads_received_count: 0, metrics_refreshed_at: "2026-09-01T00:00:00Z" },
        { id: "3", name: "Paused", status: "paused", metrics: { spendCents: 100 }, leads_received_count: 0 },
      ],
      { now },
    );
    expect(a.campaigns[0]).toMatchObject({ leads: 4, cplCents: 1250, impressions: 1000 });
    expect(a.totals).toEqual({ spendCents: 5100, impressions: 1000, clicks: 40, leads: 4, cplCents: 1275 });
    expect(a.staleCount).toBe(1);
  });
});

describe("sourceFunnel", () => {
  it("credits views and leads to their source, direct when blank", () => {
    const rows = sourceFunnel([
      { event_type: "page_view", source: "facebook" },
      { event_type: "page_view", source: "facebook" },
      { event_type: "conversion", source: "facebook" },
      { event_type: "page_view", source: null },
      { event_type: "tool_opened", source: "facebook" },
    ]);
    expect(rows).toEqual([
      { source: "facebook", views: 2, leads: 1, rate: 0.5 },
      { source: "direct", views: 1, leads: 0, rate: 0 },
    ]);
  });
});
