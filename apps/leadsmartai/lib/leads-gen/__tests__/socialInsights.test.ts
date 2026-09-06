import { describe, expect, it } from "vitest";
import { mapThreadsInsights, mapTikTokVideo, mapYouTubeStatistics } from "../social-insights-map";

describe("mapYouTubeStatistics", () => {
  it("maps views to impressions and keeps unknowns null", () => {
    expect(mapYouTubeStatistics({ viewCount: "1204", likeCount: "31", commentCount: "4" })).toMatchObject({
      impressions: 1204,
      likes: 31,
      comments: 4,
      shares: null,
      reach: null,
      reactionsTotal: 31,
    });
    expect(mapYouTubeStatistics({})).toBeNull();
    expect(mapYouTubeStatistics(undefined)).toBeNull();
  });
});

describe("mapThreadsInsights", () => {
  it("reads the metric array and folds reposts + quotes into shares", () => {
    const m = mapThreadsInsights([
      { name: "views", values: [{ value: 800 }] },
      { name: "likes", values: [{ value: 12 }] },
      { name: "replies", values: [{ value: 3 }] },
      { name: "reposts", total_value: { value: 2 } },
      { name: "quotes", values: [{ value: 1 }] },
    ]);
    expect(m).toMatchObject({ impressions: 800, likes: 12, comments: 3, shares: 3, reactionsTotal: 12 });
  });
  it("is null for an empty answer", () => {
    expect(mapThreadsInsights([])).toBeNull();
    expect(mapThreadsInsights({ not: "an array" })).toBeNull();
  });
});

describe("mapTikTokVideo", () => {
  it("maps the video query fields", () => {
    expect(mapTikTokVideo({ id: "7", view_count: 5000, like_count: 120, comment_count: 8, share_count: 15 })).toMatchObject({
      impressions: 5000,
      likes: 120,
      comments: 8,
      shares: 15,
    });
    expect(mapTikTokVideo(null)).toBeNull();
  });
});
