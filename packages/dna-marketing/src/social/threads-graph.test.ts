import { describe, expect, it } from "vitest";

import {
  buildThreadsAuthorizeUrl,
  buildThreadsContainerRequest,
  capThreadsText,
  THREADS_TEXT_MAX,
  buildThreadsContainerStatusUrl,
  buildThreadsLongLivedTokenUrl,
  buildThreadsPermalinkUrl,
  buildThreadsPublishRequest,
  buildThreadsTokenExchangeRequest,
  parseThreadsContainerResponse,
  parseThreadsContainerStatusResponse,
  parseThreadsLongLivedTokenResponse,
  parseThreadsPublishResponse,
  parseThreadsTokenExchangeResponse,
  threadsGraphBase,
} from "./threads-graph";

const TOKEN = "threads-token";

describe("threads authorize url", () => {
  it("targets the threads.net dialog with the default scopes", () => {
    const url = buildThreadsAuthorizeUrl({
      clientId: "cid",
      redirectUri: "https://app.test/cb",
      state: "st",
    });
    expect(url).toContain("https://threads.net/oauth/authorize");
    expect(url).toContain("client_id=cid");
    expect(url).toContain("response_type=code");
    expect(url).toContain("state=st");
    // Threads joins scopes with a comma (Facebook uses a space); URLSearchParams
    // percent-encodes it, so decode before asserting.
    expect(decodeURIComponent(url)).toContain("scope=threads_basic,threads_content_publish");
  });
});

describe("threads token exchange", () => {
  it("posts to graph.threads.net/oauth/access_token with the code", () => {
    const req = buildThreadsTokenExchangeRequest({
      clientId: "cid",
      clientSecret: "secret",
      redirectUri: "https://app.test/cb",
      code: "abc",
    });
    expect(req.url).toBe("https://graph.threads.net/oauth/access_token");
    expect(req.body.get("grant_type")).toBe("authorization_code");
    expect(req.body.get("code")).toBe("abc");
  });

  it("parses the user_id alongside the token (Threads returns both)", () => {
    const r = parseThreadsTokenExchangeResponse(200, {
      access_token: "t",
      user_id: 123456,
    });
    expect(r).toEqual({ ok: true, accessToken: "t", userId: "123456" });
  });

  it("surfaces Threads' error_message shape on failure", () => {
    const r = parseThreadsTokenExchangeResponse(400, {
      error_message: "bad code",
    });
    expect(r).toEqual({ ok: false, error: "bad code" });
  });
});

describe("threads long-lived token", () => {
  it("builds the th_exchange_token GET url", () => {
    const url = buildThreadsLongLivedTokenUrl({
      clientSecret: "secret",
      shortLivedToken: "short",
    });
    expect(url).toContain("https://graph.threads.net/access_token");
    expect(url).toContain("grant_type=th_exchange_token");
    expect(url).toContain("access_token=short");
  });

  it("defaults expiry to ~60 days when Meta omits expires_in", () => {
    const r = parseThreadsLongLivedTokenResponse(200, { access_token: "long" });
    expect(r).toEqual({ ok: true, accessToken: "long", expiresIn: 60 * 24 * 60 * 60 });
  });
});

describe("threads publish (two-step)", () => {
  it("creates a TEXT container when there's no image", () => {
    const req = buildThreadsContainerRequest({
      userId: "u1",
      accessToken: TOKEN,
      text: "hello threads",
    });
    expect(req.url).toBe(`${threadsGraphBase()}/u1/threads`);
    expect(req.body.get("media_type")).toBe("TEXT");
    expect(req.body.get("text")).toBe("hello threads");
    expect(req.body.get("image_url")).toBeNull();
  });

  it("creates an IMAGE container when an image is attached", () => {
    const req = buildThreadsContainerRequest({
      userId: "u1",
      accessToken: TOKEN,
      text: "look",
      imageUrl: "https://img.test/a.jpg",
    });
    expect(req.body.get("media_type")).toBe("IMAGE");
    expect(req.body.get("image_url")).toBe("https://img.test/a.jpg");
  });

  it("publishes the container by creation_id", () => {
    const req = buildThreadsPublishRequest({
      userId: "u1",
      accessToken: TOKEN,
      containerId: "cont-9",
    });
    expect(req.url).toBe(`${threadsGraphBase()}/u1/threads_publish`);
    expect(req.body.get("creation_id")).toBe("cont-9");
  });

  it("caps container text to Threads' 500-char limit", () => {
    const longText = "word ".repeat(200).trim(); // ~1000 chars
    const req = buildThreadsContainerRequest({
      userId: "u1",
      accessToken: TOKEN,
      text: longText,
    });
    const sent = req.body.get("text") ?? "";
    expect(Array.from(sent).length).toBeLessThanOrEqual(THREADS_TEXT_MAX);
    expect(sent.endsWith("…")).toBe(true);
  });

  it("parses the container id, then the published media id", () => {
    const c = parseThreadsContainerResponse(200, { id: "cont-9" });
    expect(c).toEqual({ ok: true, containerId: "cont-9" });

    const p = parseThreadsPublishResponse(200, { id: "media-42" });
    expect(p).toEqual({ ok: true, postId: "media-42", postUrl: null });
  });

  it("classifies a revoked token (code 190) as non-retryable", () => {
    const p = parseThreadsPublishResponse(400, {
      error: { code: 190, message: "token expired" },
    });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.retryable).toBe(false);
  });

  it("classifies a throttle (code 4) as retryable", () => {
    const c = parseThreadsContainerResponse(400, { error: { code: 4 } });
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.retryable).toBe(true);
  });
});

describe("capThreadsText", () => {
  it("leaves short text untouched", () => {
    expect(capThreadsText("hello")).toBe("hello");
  });

  it("truncates over-long text with an ellipsis, staying within the limit", () => {
    const out = capThreadsText("a".repeat(600));
    expect(Array.from(out).length).toBeLessThanOrEqual(THREADS_TEXT_MAX);
    expect(out.endsWith("…")).toBe(true);
  });

  it("counts emoji as single characters (code points)", () => {
    // 300 two-code-unit emoji = 300 code points, under the 500 limit → untouched.
    const emoji = "😀".repeat(300);
    expect(capThreadsText(emoji)).toBe(emoji);
  });
});

describe("threads container status", () => {
  it("asks for status + error_message on the container", () => {
    const url = buildThreadsContainerStatusUrl({
      containerId: "cont-9",
      accessToken: TOKEN,
    });
    expect(url).toContain("/cont-9?fields=status,error_message");
  });

  it("treats FINISHED (and PUBLISHED) as ready to publish", () => {
    expect(parseThreadsContainerStatusResponse(200, { status: "FINISHED" })).toEqual({
      state: "ready",
    });
    expect(parseThreadsContainerStatusResponse(200, { status: "PUBLISHED" })).toEqual({
      state: "ready",
    });
  });

  it("keeps polling while IN_PROGRESS", () => {
    expect(parseThreadsContainerStatusResponse(200, { status: "IN_PROGRESS" })).toEqual({
      state: "processing",
    });
  });

  it("keeps polling on a transient read failure rather than discarding the post", () => {
    // The container exists — a flaky status read must not fail the publish.
    expect(parseThreadsContainerStatusResponse(500, {})).toEqual({ state: "processing" });
  });

  it("fails terminally on ERROR/EXPIRED and surfaces the reason", () => {
    const r = parseThreadsContainerStatusResponse(200, {
      status: "ERROR",
      error_message: "image unreachable",
    });
    expect(r.state).toBe("failed");
    if (r.state === "failed") expect(r.error).toContain("image unreachable");
  });
});

describe("threads permalink url", () => {
  it("asks for the permalink field on the media id", () => {
    const url = buildThreadsPermalinkUrl({ mediaId: "media-42", accessToken: TOKEN });
    expect(url).toContain("/media-42?fields=permalink");
    expect(url).toContain("access_token=threads-token");
  });
});
