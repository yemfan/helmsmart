import { describe, expect, it } from "vitest";
import { areaPlaceName, areaSlug, findArea, postsForArea } from "../areas";
import type { FeedItem } from "../feedItems";

function item(caption: string, topics: string[] = []): FeedItem {
  return {
    id: caption,
    kind: "post",
    caption,
    imageUrl: null,
    mediaKind: "image",
    postedAt: "2026-09-01T00:00:00Z",
    links: [],
    topics,
  } as unknown as FeedItem;
}

describe("areaSlug", () => {
  it("makes a stable ascii slug", () => {
    expect(areaSlug("Monterey Park, CA")).toBe("monterey-park-ca");
    expect(areaSlug("  Alhambra ")).toBe("alhambra");
    expect(areaSlug("São Paulo")).toBe("sao-paulo");
  });
});

describe("findArea", () => {
  const areas = [
    { name: "Alhambra, CA", note: null },
    { name: "San Gabriel", note: "Great schools" },
  ];
  it("resolves a slug back to the area", () => {
    expect(findArea(areas, "san-gabriel")?.note).toBe("Great schools");
    expect(findArea(areas, "ALHAMBRA-CA")?.name).toBe("Alhambra, CA");
    expect(findArea(areas, "nowhere")).toBeNull();
  });
});

describe("postsForArea", () => {
  it("matches by caption or hashtag, case-blind, whole word for short names", () => {
    const feed = [
      item("New listing in Alhambra this week"),
      item("Berkeley market update"),
      item("Rates dipped", ["montereypark"]),
      item("Nothing here"),
    ];
    expect(postsForArea(feed, "Alhambra, CA").map((i) => i.id)).toEqual(["New listing in Alhambra this week"]);
    expect(postsForArea(feed, "Monterey Park").map((i) => i.id)).toEqual(["Rates dipped"]);
    expect(postsForArea(feed, "Ely")).toEqual([]);
  });
  it("strips the state from the place name", () => {
    expect(areaPlaceName("Arcadia, CA")).toBe("Arcadia");
  });
});
