import { describe, expect, it } from "vitest";

import {
  buildFacebookPostRequest,
  buildInstagramContainerRequest,
  buildInstagramContainerStatusUrl,
  buildInstagramPublishRequest,
  facebookPostUrl,
  graphErrorMessage,
  instagramNeedsImage,
  isRetryableGraphError,
  metaGraphBase,
  metaOAuthDialog,
  parseFacebookPostResponse,
  parseInstagramContainerResponse,
  parseInstagramContainerStatusResponse,
  parseInstagramPublishResponse,
} from "./meta-graph";

const TOKEN = "page-token";

describe("instagram container status", () => {
  it("asks for status_code on the container (IG's field, not `status`)", () => {
    const url = buildInstagramContainerStatusUrl({
      containerId: "cont-1",
      accessToken: TOKEN,
    });
    expect(url).toContain("/cont-1?fields=status_code");
    expect(url).toContain("access_token=page-token");
  });

  it("treats FINISHED/PUBLISHED as ready", () => {
    expect(parseInstagramContainerStatusResponse(200, { status_code: "FINISHED" })).toEqual({
      state: "ready",
    });
    expect(parseInstagramContainerStatusResponse(200, { status_code: "PUBLISHED" })).toEqual({
      state: "ready",
    });
  });

  it("keeps polling while IN_PROGRESS", () => {
    expect(parseInstagramContainerStatusResponse(200, { status_code: "IN_PROGRESS" })).toEqual({
      state: "processing",
    });
  });

  it("keeps polling on a transient read failure instead of discarding the post", () => {
    expect(parseInstagramContainerStatusResponse(500, {})).toEqual({ state: "processing" });
  });

  it("fails terminally on ERROR/EXPIRED", () => {
    const r = parseInstagramContainerStatusResponse(200, { status_code: "ERROR" });
    expect(r.state).toBe("failed");
    if (r.state === "failed") expect(r.error).toContain("error");
  });
});

describe("facebook request", () => {
  it("uses /feed for text and puts the copy in `message`", () => {
    const req = buildFacebookPostRequest({
      pageId: "123",
      pageAccessToken: TOKEN,
      caption: "hello",
    });
    expect(req.url).toContain("/123/feed");
    expect(req.body.get("message")).toBe("hello");
    expect(req.body.get("access_token")).toBe(TOKEN);
  });

  it("switches to /photos when there's an image, with the copy as `caption`", () => {
    // The endpoint changes AND the field name changes — getting one right and
    // the other wrong silently posts an empty photo.
    const req = buildFacebookPostRequest({
      pageId: "123",
      pageAccessToken: TOKEN,
      caption: "hello",
      imageUrl: "https://img.test/a.png",
    });
    expect(req.url).toContain("/123/photos");
    expect(req.body.get("url")).toBe("https://img.test/a.png");
    expect(req.body.get("caption")).toBe("hello");
    expect(req.body.get("message")).toBeNull();
    expect(req.body.get("published")).toBe("true");
  });

  it("attaches a link only on /feed — Graph ignores it on /photos", () => {
    const feed = buildFacebookPostRequest({
      pageId: "1",
      pageAccessToken: TOKEN,
      caption: "c",
      link: "https://x.test",
    });
    expect(feed.body.get("link")).toBe("https://x.test");

    const photo = buildFacebookPostRequest({
      pageId: "1",
      pageAccessToken: TOKEN,
      caption: "c",
      imageUrl: "https://img.test/a.png",
      link: "https://x.test",
    });
    expect(photo.body.get("link")).toBeNull();
  });

  it("ignores a blank link rather than sending an empty param", () => {
    const req = buildFacebookPostRequest({
      pageId: "1",
      pageAccessToken: TOKEN,
      caption: "c",
      link: "   ",
    });
    expect(req.body.get("link")).toBeNull();
  });
});

describe("facebook response", () => {
  it("prefers post_id over id so the URL is the timeline post", () => {
    // /photos returns both; `id` is the standalone photo viewer.
    const out = parseFacebookPostResponse(200, { id: "photo9", post_id: "123_456" });
    expect(out.ok && out.postId).toBe("123_456");
    expect(out.ok && out.postUrl).toBe("https://www.facebook.com/123/posts/456");
  });

  it("handles /feed's single id", () => {
    const out = parseFacebookPostResponse(200, { id: "123_456" });
    expect(out.ok && out.postId).toBe("123_456");
  });

  it("fails when the body has no id even on a 200", () => {
    const out = parseFacebookPostResponse(200, {});
    expect(out.ok).toBe(false);
  });

  it("surfaces Meta's error text", () => {
    const out = parseFacebookPostResponse(400, {
      error: { message: "Invalid parameter", code: 100 },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toContain("Invalid parameter");
      expect(out.retryable).toBe(false);
    }
  });

  it("returns null for a post URL of an unexpected shape", () => {
    expect(facebookPostUrl("nounderscore")).toBeNull();
    expect(facebookPostUrl("_leading")).toBeNull();
  });
});

describe("instagram", () => {
  it("requires an image", () => {
    expect(instagramNeedsImage(null)).toBe(true);
    expect(instagramNeedsImage("   ")).toBe(true);
    expect(instagramNeedsImage("https://img.test/a.png")).toBe(false);
  });

  it("builds the two steps against the right endpoints", () => {
    const container = buildInstagramContainerRequest({
      igUserId: "ig1",
      pageAccessToken: TOKEN,
      caption: "hi",
      imageUrl: "https://img.test/a.png",
    });
    expect(container.url).toContain("/ig1/media");
    expect(container.body.get("image_url")).toBe("https://img.test/a.png");

    const publish = buildInstagramPublishRequest({
      igUserId: "ig1",
      pageAccessToken: TOKEN,
      containerId: "c9",
    });
    expect(publish.url).toContain("/ig1/media_publish");
    expect(publish.body.get("creation_id")).toBe("c9");
  });

  it("passes the container id from step 1 to step 2", () => {
    const parsed = parseInstagramContainerResponse(200, { id: "c9" });
    expect(parsed.ok && parsed.containerId).toBe("c9");
  });

  it("fails step 1 loudly rather than publishing an empty container", () => {
    const parsed = parseInstagramContainerResponse(400, {
      error: { message: "media download failed" },
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("media download failed");
  });

  it("returns no URL from publish — the permalink needs a second lookup", () => {
    const out = parseInstagramPublishResponse(200, { id: "m1" });
    expect(out.ok && out.postId).toBe("m1");
    expect(out.ok && out.postUrl).toBeNull();
  });
});

describe("error classification", () => {
  it("never retries an invalid token — it needs a human", () => {
    // Retrying code 190 forever is pure noise; the fix is reconnecting.
    expect(isRetryableGraphError({ code: 190 }, 400)).toBe(false);
  });

  it("retries throttling and transient Meta errors", () => {
    for (const code of [1, 2, 4, 17, 32, 613]) {
      expect(isRetryableGraphError({ code }, 400)).toBe(true);
    }
    expect(isRetryableGraphError(undefined, 429)).toBe(true);
    expect(isRetryableGraphError(undefined, 503)).toBe(true);
  });

  it("does not retry ordinary client errors", () => {
    expect(isRetryableGraphError({ code: 100 }, 400)).toBe(false);
    expect(isRetryableGraphError(undefined, 400)).toBe(false);
  });

  it("prefers the message written for humans", () => {
    // Meta puts the developer message in `message` and the user-facing one in
    // `error_user_msg`. This string reaches the person who wrote the post.
    expect(
      graphErrorMessage(
        { message: "(#200) Permissions error", error_user_msg: "You need admin access." },
        400,
      ),
    ).toBe("You need admin access.");
    expect(graphErrorMessage({ message: "dev only" }, 400)).toBe("dev only");
    expect(graphErrorMessage(undefined, 500)).toBe("HTTP 500");
  });
});

describe("graph version", () => {
  it("builds base + dialog from one version", () => {
    expect(metaGraphBase("v21.0")).toBe("https://graph.facebook.com/v21.0");
    expect(metaOAuthDialog("v21.0")).toBe("https://www.facebook.com/v21.0/dialog/oauth");
  });
});
