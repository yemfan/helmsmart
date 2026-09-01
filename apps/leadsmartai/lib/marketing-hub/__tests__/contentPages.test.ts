import { describe, expect, it } from "vitest";

import { buildFeed, type FeedItem } from "@/lib/marketing-hub/feedItems";
import {
  contentBody,
  deriveTitle,
  findBySlug,
  isContentIndexable,
  relatedItems,
  shortDate,
  slugFor,
  titleOf,
} from "@/lib/marketing-hub/contentPages";

/**
 * The shapes here are the ones production actually holds. Agent 26's 49 posted
 * rows are 31 distinct pieces of writing: the fan-out publishes one caption to
 * several networks and the scheduler reposts it later. Both matter here because
 * every publication of one piece must resolve to ONE page.
 */

const CROSS_POST = "Social consistency is the listing presentation that never ends.\n\nPost weekly.";

const sameDayFanOut = [
  {
    id: "a",
    status: "posted",
    platform: "facebook",
    caption: CROSS_POST,
    hashtags: ["#RealEstate", "#ListingTips"],
    published_at: "2026-08-14T10:00:00Z",
    external_post_url: "https://facebook.com/p/a",
  },
  {
    id: "b",
    status: "posted",
    platform: "threads",
    caption: CROSS_POST,
    hashtags: ["#realestate", "#Marketing"],
    published_at: "2026-08-14T10:05:00Z",
    external_post_url: "https://threads.net/p/b",
  },
];

const feedOf = (posts: Record<string, unknown>[]) => buildFeed({ posts });

const stub = (over: Partial<FeedItem>): FeedItem => ({
  id: "post:x",
  kind: "post",
  caption: "",
  imageUrl: null,
  postedAt: "2026-08-01T00:00:00Z",
  links: [],
  topics: [],
  ...over,
});

describe("deriveTitle", () => {
  it("takes the first line — captions are written hook-first", () => {
    expect(deriveTitle(CROSS_POST)).toBe(
      "Social consistency is the listing presentation that never ends.",
    );
  });

  it("cuts a long first line at a word boundary, never mid-word", () => {
    const title = deriveTitle(`${"word ".repeat(40)}end`);
    expect(title.length).toBeLessThanOrEqual(121);
    expect(title.endsWith("…")).toBe(true);
    expect(title).not.toMatch(/wor…$/);
  });

  it("prefers a sentence break when one falls late enough to be useful", () => {
    expect(deriveTitle(`${"a".repeat(70)}. ${"b".repeat(120)}`)).toBe(`${"a".repeat(70)}.`);
  });

  it("handles a caption with no line break at all", () => {
    expect(deriveTitle("Just one line")).toBe("Just one line");
  });

  it("is empty for an image-only post rather than throwing", () => {
    expect(deriveTitle("")).toBe("");
  });
});

describe("titleOf", () => {
  it("still names an image-only post, which has no words to title", () => {
    expect(titleOf(stub({ caption: "" }))).toBe("Post");
    expect(titleOf(stub({ caption: "", kind: "reel" }))).toBe("Video");
  });
});

describe("slugFor / findBySlug", () => {
  it("gives every publication of one piece of writing the SAME url", () => {
    // This is the point of grouping the slug on the caption: four rows for one
    // cross-post must not become four near-identical indexed pages.
    const [item] = feedOf(sameDayFanOut);
    expect(feedOf([sameDayFanOut[0]])[0] && slugFor(feedOf([sameDayFanOut[0]])[0])).toBe(
      slugFor(item),
    );
  });

  it("is readable and round-trips", () => {
    const [item] = feedOf(sameDayFanOut);
    const slug = slugFor(item);
    expect(slug).toMatch(/^social-consistency/);
    expect(findBySlug([item], slug)?.id).toBe(item.id);
  });

  it("separates two posts that merely open the same way", () => {
    const items = feedOf([
      { id: "1", status: "posted", caption: "Same opener\n\nBody one.", published_at: "2026-08-01T00:00:00Z" },
      { id: "2", status: "posted", caption: "Same opener\n\nBody two.", published_at: "2026-08-02T00:00:00Z" },
    ]);
    expect(slugFor(items[0])).not.toBe(slugFor(items[1]));
  });

  it("still produces a usable slug for a non-Latin title", () => {
    // A Chinese-language post must not slug down to nothing but its hash.
    const [item] = feedOf([
      { id: "z", status: "posted", caption: "房价走势分析\n\n正文。", published_at: "2026-08-01T00:00:00Z" },
    ]);
    expect(slugFor(item)).toMatch(/^房价走势分析-/);
    expect(findBySlug([item], slugFor(item))?.id).toBe(item.id);
  });

  it("returns null for a slug that names nothing", () => {
    const items = feedOf(sameDayFanOut);
    expect(findBySlug(items, "made-up-aaaaaaa")).toBeNull();
    expect(findBySlug(items, "")).toBeNull();
  });
});

describe("topics", () => {
  it("unions hashtags across networks, case-folded so one tag is one topic", () => {
    // #RealEstate on Facebook and #realestate on Threads are the same topic;
    // counting them twice would split "related" across a spelling difference.
    const [item] = feedOf(sameDayFanOut);
    expect([...item.topics].sort()).toEqual(["listingtips", "marketing", "realestate"]);
  });

  it("survives a row with no hashtags column", () => {
    const [item] = feedOf([
      { id: "n", status: "posted", caption: "Hello", published_at: "2026-08-01T00:00:00Z" },
    ]);
    expect(item.topics).toEqual([]);
  });
});

describe("relatedItems", () => {
  const target = stub({ id: "target", topics: ["buying", "financing"], postedAt: "2026-08-20T00:00:00Z" });

  it("ranks by how many topics are shared, before recency", () => {
    const newerButWeaker = stub({ id: "weak", topics: ["buying"], postedAt: "2026-08-25T00:00:00Z" });
    const olderButStronger = stub({
      id: "strong",
      topics: ["buying", "financing"],
      postedAt: "2026-01-01T00:00:00Z",
    });
    expect(relatedItems(target, [target, newerButWeaker, olderButStronger]).map((i) => i.id)).toEqual(
      ["strong", "weak"],
    );
  });

  it("never returns the page you are already on", () => {
    expect(relatedItems(target, [target])).toEqual([]);
  });

  it("returns nothing rather than filler when no topic is shared", () => {
    expect(relatedItems(target, [target, stub({ id: "o", topics: ["staging"] })])).toEqual([]);
  });

  it("returns nothing when the post itself is untagged", () => {
    const untagged = stub({ id: "u", topics: [] });
    expect(relatedItems(untagged, [untagged, stub({ id: "o", topics: ["buying"] })])).toEqual([]);
  });

  it("honours the limit", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      stub({ id: `g${i}`, topics: ["buying"], postedAt: `2026-08-0${i + 1}T00:00:00Z` }),
    );
    expect(relatedItems(target, [target, ...many])).toHaveLength(4);
  });
});

describe("contentBody", () => {
  it("drops the first line, which the h1 already shows", () => {
    expect(contentBody(stub({ caption: "Hook line\n\nThe body." }))).toBe("The body.");
  });

  it("drops a trailing hashtag block, which the chips already show", () => {
    expect(
      contentBody(
        stub({
          caption: "Hook\n\nThe body.\n\n#RealtorMarketing #AgentLife",
          topics: ["realtormarketing", "agentlife"],
        }),
      ),
    ).toBe("The body.");
  });

  it("keeps hashtags when there are no chips to relocate them into", () => {
    expect(contentBody(stub({ caption: "Hook\n\nBody.\n\n#tag" }))).toBe("Body.\n\n#tag");
  });

  it("keeps a hashtag that is part of a sentence, not a trailing block", () => {
    expect(
      contentBody(stub({ caption: "Hook\n\nAsk me about #escrow today.", topics: ["escrow"] })),
    ).toBe("Ask me about #escrow today.");
  });

  it("keeps the first line when the title was truncated — those words are NOT shown", () => {
    const caption = `${"word ".repeat(40)}end\n\nBody.`;
    const item = stub({ caption });
    expect(titleOf(item).endsWith("…")).toBe(true);
    expect(contentBody(item)).toContain("word word");
  });

  it("is empty for a caption that is nothing but its title", () => {
    expect(contentBody(stub({ caption: "Just the hook" }))).toBe("");
  });
});

describe("isContentIndexable", () => {
  it("lets a substantial post have its own indexed URL", () => {
    expect(isContentIndexable(stub({ caption: "x".repeat(400) }))).toBe(true);
  });

  it("holds back a one-liner — it would compete with the hub for the same words", () => {
    expect(isContentIndexable(stub({ caption: "New listing! Call me." }))).toBe(false);
  });
});

describe("shortDate", () => {
  it("distinguishes two publications a relative dateline could not", () => {
    // "2 weeks ago · 2 weeks ago" cannot tell two publications apart, which is
    // the entire reason they are listed separately.
    expect(shortDate("2026-08-14T10:00:00Z")).toBe("Aug 14");
    expect(shortDate("2026-08-21T10:00:00Z")).toBe("Aug 21");
  });

  it("returns empty rather than 'Invalid Date' for an unparseable value", () => {
    expect(shortDate("not-a-date")).toBe("");
  });
});
