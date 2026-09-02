import { describe, expect, it } from "vitest";

import { mediaKind } from "../mediaKind";

/**
 * The hub's public post media. Getting this wrong is visible to every visitor
 * of an agent's marketing page — the failure it fixes was a broken-image icon
 * sitting where a published video ad should have been.
 */
describe("mediaKind", () => {
  it("recognises the rendered video that broke the live hub", () => {
    // Verbatim from scheduled_posts.image_url on the published post.
    expect(
      mediaKind("https://s3.us-east-2.amazonaws.com/remotionlambda-useast2-15t4ts6xtf/renders/yq8bgykhpa/out.mp4"),
    ).toBe("video");
  });

  it("recognises the common video containers", () => {
    for (const ext of ["mp4", "mov", "m4v", "webm", "ogv", "avi"]) {
      expect(mediaKind(`https://x.test/a.${ext}`)).toBe("video");
    }
  });

  it("recognises images", () => {
    for (const ext of ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"]) {
      expect(mediaKind(`https://x.test/a.${ext}`)).toBe("image");
    }
  });

  it("sees through a query string or fragment", () => {
    // Signed and CDN URLs carry both, and neither changes what the file is.
    expect(mediaKind("https://x.test/out.mp4?token=abc&expires=1")).toBe("video");
    expect(mediaKind("https://x.test/a.png#top")).toBe("image");
  });

  it("is case-insensitive", () => {
    expect(mediaKind("https://x.test/OUT.MP4")).toBe("video");
    expect(mediaKind("https://x.test/A.JPG")).toBe("image");
  });

  it("treats our extensionless ad endpoints as images", () => {
    // These serve generated PNGs; guessing image is also the safe direction,
    // since a wrong <img> degrades to one broken frame while a wrong <video>
    // renders a black box with playback controls on it.
    expect(mediaKind("https://www.closebossai.com/api/social/ad/2140a757-f9cf-48c1-8138-53be016c83fe")).toBe("image");
    expect(mediaKind("https://www.closebossai.com/api/social/card/abc")).toBe("image");
  });

  it("reports nothing for an absent or blank url", () => {
    expect(mediaKind(null)).toBe("none");
    expect(mediaKind(undefined)).toBe("none");
    expect(mediaKind("")).toBe("none");
    expect(mediaKind("   ")).toBe("none");
  });

  it("does not match an extension that merely appears mid-path", () => {
    // A directory called "mp4" is not a video file.
    expect(mediaKind("https://x.test/mp4/cover.png")).toBe("image");
  });
});
