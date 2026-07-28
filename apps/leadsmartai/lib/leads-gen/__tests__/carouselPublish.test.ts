import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fbSpy = vi.fn(async (..._a: unknown[]) => ({ externalPostId: "fb_1", externalPostUrl: "u" }));
const igSpy = vi.fn(async (..._a: unknown[]) => ({ externalPostId: "ig_1", externalPostUrl: "u" }));
const liSpy = vi.fn(async (..._a: unknown[]) => ({ externalPostId: "urn:li:share:1", externalPostUrl: "u" }));

vi.mock("../meta-post", () => ({
  publishFacebookCarousel: (...a: unknown[]) => fbSpy(...a),
  publishInstagramCarousel: (...a: unknown[]) => igSpy(...a),
}));
vi.mock("../linkedin-post", () => ({
  publishLinkedInCarousel: (...a: unknown[]) => liSpy(...a),
}));

const { publishCarousel } = await import("../carousel-publish");

const base = {
  caption: "hi",
  imageUrls: ["https://x/0", "https://x/1", "https://x/2"],
  accessToken: "tok",
};

describe("publishCarousel", () => {
  it("rejects a deck with fewer than 2 slides", async () => {
    await expect(
      publishCarousel({ ...base, platform: "facebook", imageUrls: ["https://x/0"], fbPageId: "p" }),
    ).rejects.toThrow(/at least 2/i);
  });

  it("routes facebook to the FB carousel publisher with the page id", async () => {
    await publishCarousel({ ...base, platform: "facebook", fbPageId: "page-9" });
    expect(fbSpy).toHaveBeenCalledTimes(1);
    expect(fbSpy.mock.calls[0][0]).toMatchObject({ pageId: "page-9", imageUrls: base.imageUrls });
  });

  it("routes instagram to the IG carousel publisher with the ig user id", async () => {
    await publishCarousel({ ...base, platform: "instagram", igUserId: "ig-7" });
    expect(igSpy).toHaveBeenCalledTimes(1);
    expect(igSpy.mock.calls[0][0]).toMatchObject({ igUserId: "ig-7" });
  });

  it("throws when the platform's required id is missing", async () => {
    await expect(publishCarousel({ ...base, platform: "facebook" })).rejects.toThrow(/facebook page id/i);
    await expect(publishCarousel({ ...base, platform: "instagram" })).rejects.toThrow(/instagram/i);
    await expect(publishCarousel({ ...base, platform: "linkedin" })).rejects.toThrow(/member urn/i);
  });
});
