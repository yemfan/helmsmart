import { describe, expect, it } from "vitest";

import { postMediaKind } from "../mediaKind";
import { buildFeed } from "../feedItems";

/**
 * Whether a post's media is a still or a video.
 *
 * Getting this wrong is visible to every visitor of an agent's public page —
 * the failure it fixes was a broken-image icon sitting where a published video
 * ad should have been.
 */
describe("postMediaKind", () => {
  describe("subject_kind, which the row already knows", () => {
    it("calls a social_reel a video", () => {
      // The pipeline that made the row said so. All 13 reel rows in production
      // carry a video URL, and no row of any other kind does.
      expect(postMediaKind({ url: "https://x.test/out.mp4", subjectKind: "social_reel" })).toBe("video");
    });

    it("believes subject_kind over a misleading extension", () => {
      // A reel whose URL is signed or extensionless is still a reel. This is
      // the whole reason subject_kind is consulted first.
      expect(postMediaKind({ url: "https://x.test/render?id=9", subjectKind: "social_reel" })).toBe("video");
      expect(postMediaKind({ url: "https://x.test/cover.png", subjectKind: "social_reel" })).toBe("video");
    });

    it("does not treat other subject kinds as video", () => {
      for (const k of ["social_recommendation", "social_ad", "social_carousel", "", null, undefined]) {
        expect(postMediaKind({ url: "https://x.test/a.png", subjectKind: k })).toBe("image");
      }
    });
  });

  describe("extension fallback, for rows with no subject_kind", () => {
    it("recognises the rendered video that broke the live hub", () => {
      // Verbatim from scheduled_posts.image_url on the published post.
      expect(
        postMediaKind({
          url: "https://s3.us-east-2.amazonaws.com/remotionlambda-useast2-15t4ts6xtf/renders/yq8bgykhpa/out.mp4",
        }),
      ).toBe("video");
    });

    it("recognises the common containers and image types", () => {
      for (const ext of ["mp4", "mov", "m4v", "webm", "ogv", "avi"]) {
        expect(postMediaKind({ url: `https://x.test/a.${ext}` })).toBe("video");
      }
      for (const ext of ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"]) {
        expect(postMediaKind({ url: `https://x.test/a.${ext}` })).toBe("image");
      }
    });

    it("sees through a query string or fragment", () => {
      // Signed and CDN URLs carry both; neither changes what the file is.
      expect(postMediaKind({ url: "https://x.test/out.mp4?token=abc&expires=1" })).toBe("video");
      expect(postMediaKind({ url: "https://x.test/a.png#top" })).toBe("image");
    });

    it("is case-insensitive", () => {
      expect(postMediaKind({ url: "https://x.test/OUT.MP4" })).toBe("video");
    });

    it("treats our extensionless ad endpoints as images", () => {
      // They serve generated PNGs, and image is the safe guess anyway: a wrong
      // <img> degrades to one broken frame, a wrong <video> renders a black
      // box with playback controls on it.
      expect(postMediaKind({ url: "https://www.closebossai.com/api/social/ad/2140a757" })).toBe("image");
    });

    it("does not match an extension that merely appears mid-path", () => {
      expect(postMediaKind({ url: "https://x.test/mp4/cover.png" })).toBe("image");
    });
  });

  it("reports nothing for an absent url, whatever the subject kind", () => {
    // A reel row with no media is still a text card, not an empty player.
    expect(postMediaKind({ url: null })).toBe("none");
    expect(postMediaKind({ url: "   ", subjectKind: "social_reel" })).toBe("none");
  });
});

describe("buildFeed carries the media kind", () => {
  const row = (over: Record<string, unknown>) => ({
    id: "p1",
    status: "posted",
    platform: "facebook",
    caption: "A missed call isn't a lost lead",
    published_at: "2026-09-01T15:11:57Z",
    ...over,
  });

  it("marks a published reel as video from its subject_kind", () => {
    // The end-to-end contract: the renderer asks the item, not the URL, so the
    // feed card and the post page can never disagree.
    const [item] = buildFeed({
      posts: [row({ image_url: "https://x.test/renders/out.mp4", subject_kind: "social_reel" })],
    });
    expect(item.mediaKind).toBe("video");
  });

  it("marks an ordinary photo post as image", () => {
    const [item] = buildFeed({
      posts: [row({ image_url: "https://x.test/a.png", subject_kind: "social_recommendation" })],
    });
    expect(item.mediaKind).toBe("image");
  });

  it("marks a text-only post as none", () => {
    const [item] = buildFeed({ posts: [row({ image_url: null })] });
    expect(item.mediaKind).toBe("none");
  });
});
