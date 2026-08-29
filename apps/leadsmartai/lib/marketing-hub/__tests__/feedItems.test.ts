import { describe, expect, it } from "vitest";

import {
  MIN_ITEMS_TO_INDEX,
  POSTED_STATUS,
  buildFeed,
  isIndexable,
  postedAgo,
} from "@/lib/marketing-hub/feedItems";

const T = (iso: string) => Date.parse(iso);

describe("buildFeed", () => {
  it("keeps only what was actually posted", () => {
    const feed = buildFeed({
      posts: [
        { id: "1", status: "posted", published_at: "2026-08-20T00:00:00Z" },
        { id: "2", status: "failed", published_at: "2026-08-21T00:00:00Z" },
        { id: "3", status: "posting", created_at: "2026-08-22T00:00:00Z" },
        { id: "4", status: "cancelled", created_at: "2026-08-23T00:00:00Z" },
      ],
    });
    expect(feed.map((f) => f.id)).toEqual(["post:1"]);
  });

  it('uses "posted", not "published" — the trap that empties the feed', () => {
    // Every one of these tables says `posted`. Reading `published` returns
    // nothing, on a page that otherwise looks completely correct.
    expect(POSTED_STATUS).toBe("posted");
    expect(
      buildFeed({ posts: [{ id: "1", status: "published", created_at: "2026-08-20T00:00:00Z" }] }),
    ).toHaveLength(0);
  });

  it("orders by when it went public, not when it was drafted", () => {
    // A post drafted in June and published in August belongs in August.
    const feed = buildFeed({
      posts: [
        { id: "june-draft", status: "posted", created_at: "2026-06-01T00:00:00Z", published_at: "2026-08-25T00:00:00Z" },
        { id: "august", status: "posted", created_at: "2026-08-10T00:00:00Z", published_at: "2026-08-10T00:00:00Z" },
      ],
    });
    expect(feed.map((f) => f.id)).toEqual(["post:june-draft", "post:august"]);
  });

  it("falls back to created_at where a table has no published_at", () => {
    const feed = buildFeed({
      carousels: [{ id: "c1", status: "posted", created_at: "2026-08-11T00:00:00Z" }],
    });
    expect(feed[0].postedAt).toBe("2026-08-11T00:00:00Z");
  });

  it("merges all three sources into one chronological feed", () => {
    const feed = buildFeed({
      posts: [{ id: "p", status: "posted", published_at: "2026-08-20T00:00:00Z" }],
      carousels: [{ id: "c", status: "posted", created_at: "2026-08-25T00:00:00Z" }],
      reels: [{ id: "r", status: "posted", created_at: "2026-08-22T00:00:00Z" }],
    });
    expect(feed.map((f) => f.id)).toEqual(["carousel:c", "reel:r", "post:p"]);
    expect(feed.map((f) => f.kind)).toEqual(["carousel", "reel", "post"]);
  });

  it("namespaces ids by kind, so two tables sharing an id do not collide", () => {
    const feed = buildFeed({
      posts: [{ id: "7", status: "posted", created_at: "2026-08-20T00:00:00Z" }],
      reels: [{ id: "7", status: "posted", created_at: "2026-08-21T00:00:00Z" }],
    });
    expect(new Set(feed.map((f) => f.id)).size).toBe(2);
  });

  it("is stable when two items share a timestamp", () => {
    const rows = {
      posts: [
        { id: "b", status: "posted", published_at: "2026-08-20T00:00:00Z" },
        { id: "a", status: "posted", published_at: "2026-08-20T00:00:00Z" },
      ],
    };
    expect(buildFeed(rows)).toEqual(buildFeed(rows));
  });

  it("applies the limit AFTER sorting, so the newest survive", () => {
    const feed = buildFeed(
      {
        posts: [{ id: "old", status: "posted", published_at: "2020-01-01T00:00:00Z" }],
        reels: [{ id: "new", status: "posted", created_at: "2026-08-25T00:00:00Z" }],
      },
      1,
    );
    expect(feed.map((f) => f.id)).toEqual(["reel:new"]);
  });

  it("survives missing, null and malformed rows without taking the page down", () => {
    expect(buildFeed({})).toEqual([]);
    expect(buildFeed({ posts: null, carousels: null, reels: null })).toEqual([]);
    expect(
      buildFeed({ posts: [{ status: "posted" }, { id: "x", status: "posted" }] }),
    ).toEqual([]); // no timestamp on either
  });

  it("keeps a text-only post rather than dropping it for having no image", () => {
    const feed = buildFeed({
      posts: [{ id: "1", status: "posted", caption: "Market update", created_at: "2026-08-20T00:00:00Z" }],
    });
    expect(feed[0].imageUrl).toBeNull();
    expect(feed[0].caption).toBe("Market update");
  });
});

describe("postedAgo", () => {
  const now = T("2026-08-29T12:00:00Z");
  it("reads as a human would say it", () => {
    expect(postedAgo("2026-08-29T09:00:00Z", now)).toBe("today");
    expect(postedAgo("2026-08-28T09:00:00Z", now)).toBe("yesterday");
    expect(postedAgo("2026-08-26T09:00:00Z", now)).toBe("3 days ago");
    expect(postedAgo("2026-08-20T09:00:00Z", now)).toBe("last week");
    expect(postedAgo("2026-07-20T09:00:00Z", now)).toBe("last month");
  });

  it("does not emit a negative age for a clock-skewed future date", () => {
    expect(postedAgo("2026-09-30T00:00:00Z", now)).toBe("just now");
  });

  it("returns empty rather than NaN for an unparseable date", () => {
    expect(postedAgo("not a date", now)).toBe("");
  });
});

describe("isIndexable", () => {
  const bio = "Twenty years helping families buy and sell across the San Gabriel Valley.";

  it("requires publication, a real bio, and actual content", () => {
    expect(isIndexable({ published: true, bio, feedCount: MIN_ITEMS_TO_INDEX })).toBe(true);
  });

  it("never indexes an unpublished hub", () => {
    expect(isIndexable({ published: false, bio, feedCount: 50 })).toBe(false);
  });

  it("holds back a thin hub — a hundred of them would penalise the domain", () => {
    // The ~3,100 city pages already ranking share this domain's reputation.
    expect(isIndexable({ published: true, bio, feedCount: MIN_ITEMS_TO_INDEX - 1 })).toBe(false);
    expect(isIndexable({ published: true, bio: "Realtor.", feedCount: 50 })).toBe(false);
    expect(isIndexable({ published: true, bio: null, feedCount: 50 })).toBe(false);
  });
});
