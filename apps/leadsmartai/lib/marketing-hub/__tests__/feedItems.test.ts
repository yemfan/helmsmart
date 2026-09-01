import { describe, expect, it } from "vitest";

import {
  MIN_ITEMS_TO_INDEX,
  POSTED_STATUS,
  applyFeedView,
  buildFeed,
  isIndexable,
  platformsIn,
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

/**
 * Cross-posting and the reader's controls.
 *
 * The defect these pin was visible on a real hub: 49 posted rows rendering as
 * 49 cards for 31 actual pieces of content, so the same paragraph appeared
 * three times down the page.
 */
describe("cross-posts become one card", () => {
  const sameCaptionEverywhere = {
    posts: [
      { id: "1", status: "posted", platform: "threads", caption: "Market update for Alhambra", external_post_url: "https://threads.net/p/1", published_at: "2026-08-20T10:00:00Z" },
      { id: "2", status: "posted", platform: "facebook", caption: "Market update for Alhambra", external_post_url: "https://facebook.com/p/2", published_at: "2026-08-20T10:05:00Z" },
      { id: "3", status: "posted", platform: "instagram", caption: "Market update for Alhambra", external_post_url: null, published_at: "2026-08-20T10:09:00Z" },
    ],
  };

  it("collapses the same words on three networks into one entry", () => {
    const feed = buildFeed(sameCaptionEverywhere);
    expect(feed).toHaveLength(1);
    expect(feed[0].links.map((l) => l.platform)).toEqual(["facebook", "instagram", "threads"]);
  });

  it("keeps every permalink, and tolerates a network that returned none", () => {
    const [item] = buildFeed(sameCaptionEverywhere);
    expect(item.links.find((l) => l.platform === "facebook")?.url).toBe("https://facebook.com/p/2");
    expect(item.links.find((l) => l.platform === "instagram")?.url).toBeNull();
  });

  it("dates the group from the EARLIEST publication", () => {
    // When it was published, not when the last cross-post finished — a slow
    // network should not make old work look new.
    expect(buildFeed(sameCaptionEverywhere)[0].postedAt).toBe("2026-08-20T10:00:00Z");
  });

  it("groups despite whitespace and casing differences between networks", () => {
    const feed = buildFeed({
      posts: [
        { id: "1", status: "posted", platform: "threads", caption: "Open house  Saturday", created_at: "2026-08-20T10:00:00Z" },
        { id: "2", status: "posted", platform: "facebook", caption: "open house Saturday", created_at: "2026-08-20T10:01:00Z" },
      ],
    });
    expect(feed).toHaveLength(1);
  });

  it("NEVER groups image-only posts, which all share an empty caption", () => {
    // The one case where grouping would destroy content rather than tidy it.
    const feed = buildFeed({
      posts: [
        { id: "1", status: "posted", platform: "instagram", caption: "", image_url: "a.jpg", created_at: "2026-08-20T10:00:00Z" },
        { id: "2", status: "posted", platform: "instagram", caption: "", image_url: "b.jpg", created_at: "2026-08-21T10:00:00Z" },
      ],
    });
    expect(feed).toHaveLength(2);
  });

  it("does not merge a post with a reel that happens to share words", () => {
    // Different kinds render differently; identical copy does not make them
    // the same artefact.
    const feed = buildFeed({
      posts: [{ id: "1", status: "posted", platform: "facebook", caption: "Same words", created_at: "2026-08-20T10:00:00Z" }],
      reels: [{ id: "1", status: "posted", platform: "facebook", caption: "Same words", created_at: "2026-08-20T10:00:00Z" }],
    });
    expect(feed).toHaveLength(2);
  });

  it("takes a cover image from whichever network returned one", () => {
    const feed = buildFeed({
      posts: [
        { id: "1", status: "posted", platform: "threads", caption: "Same", created_at: "2026-08-20T10:00:00Z" },
        { id: "2", status: "posted", platform: "facebook", caption: "Same", image_url: "cover.jpg", created_at: "2026-08-20T10:01:00Z" },
      ],
    });
    expect(feed[0].imageUrl).toBe("cover.jpg");
  });
});

describe("the reader's controls", () => {
  const feed = buildFeed({
    posts: [
      { id: "1", status: "posted", platform: "threads", caption: "One", external_post_url: "u1", published_at: "2026-08-10T00:00:00Z" },
      { id: "2", status: "posted", platform: "facebook", caption: "One", external_post_url: "u2", published_at: "2026-08-10T00:01:00Z" },
      { id: "3", status: "posted", platform: "facebook", caption: "Two", external_post_url: "u3", published_at: "2026-08-20T00:00:00Z" },
      { id: "4", status: "posted", platform: "pinterest", caption: "Three", external_post_url: "u4", published_at: "2026-08-15T00:00:00Z" },
    ],
  });

  it("offers every network present, once, sorted", () => {
    expect(platformsIn(feed)).toEqual(["facebook", "pinterest", "threads"]);
  });

  it("keeps a cross-post when EITHER of its networks is selected", () => {
    // The content is what the reader is browsing. Hiding a cross-post because
    // they picked one of the two networks it reached would be pedantry.
    expect(applyFeedView(feed, { platform: "threads" }).map((i) => i.caption)).toEqual(["One"]);
    expect(applyFeedView(feed, { platform: "facebook" }).map((i) => i.caption)).toEqual(["Two", "One"]);
  });

  it("shows everything when no network is selected", () => {
    expect(applyFeedView(feed, {})).toHaveLength(3);
    expect(applyFeedView(feed, { platform: null })).toHaveLength(3);
    expect(applyFeedView(feed, { platform: "  " })).toHaveLength(3);
  });

  it("orders newest first by default and oldest first on request", () => {
    expect(applyFeedView(feed, { order: "newest" }).map((i) => i.caption)).toEqual(["Two", "Three", "One"]);
    expect(applyFeedView(feed, { order: "oldest" }).map((i) => i.caption)).toEqual(["One", "Three", "Two"]);
  });

  it("returns an empty list rather than everything for an unknown network", () => {
    expect(applyFeedView(feed, { platform: "myspace" })).toEqual([]);
  });

  it("does not mutate the feed it was given", () => {
    const before = feed.map((i) => i.id);
    applyFeedView(feed, { order: "oldest", platform: "facebook" });
    expect(feed.map((i) => i.id)).toEqual(before);
  });
});

describe("a network appears once per card", () => {
  // Real data: the same content went to facebook twice five seconds apart and
  // to threads twice weeks apart, so the card read
  // "Read it on facebook · Also on facebook, threads, threads".
  const doublePosted = {
    posts: [
      { id: "a", status: "posted", platform: "threads", caption: "Same words", external_post_url: "t1", published_at: "2026-08-04T16:01:36Z" },
      { id: "b", status: "posted", platform: "facebook", caption: "Same words", external_post_url: "f1", published_at: "2026-08-29T17:01:29Z" },
      { id: "c", status: "posted", platform: "facebook", caption: "Same words", external_post_url: "f2", published_at: "2026-08-29T17:01:34Z" },
      { id: "d", status: "posted", platform: "threads", caption: "Same words", external_post_url: "t2", published_at: "2026-08-29T17:01:50Z" },
    ],
  };

  it("lists each network once, however many times it was posted there", () => {
    const [item] = buildFeed(doublePosted);
    expect(item.links.map((l) => l.platform)).toEqual(["facebook", "threads"]);
  });

  it("keeps the FIRST publication's link — the one the audience saw", () => {
    const [item] = buildFeed(doublePosted);
    expect(item.links.find((l) => l.platform === "facebook")?.url).toBe("f1");
    expect(item.links.find((l) => l.platform === "threads")?.url).toBe("t1");
  });

  it("borrows a URL from the duplicate when the first publication had none", () => {
    const [item] = buildFeed({
      posts: [
        { id: "a", status: "posted", platform: "facebook", caption: "Same", external_post_url: null, published_at: "2026-08-01T00:00:00Z" },
        { id: "b", status: "posted", platform: "facebook", caption: "Same", external_post_url: "f2", published_at: "2026-08-02T00:00:00Z" },
      ],
    });
    expect(item.links).toHaveLength(1);
    expect(item.links[0].url).toBe("f2");
  });
});
