import { describe, expect, it } from "vitest";

import {
  buildThreadsAuthorizeUrl,
  buildThreadsContainerRequest,
  buildThreadsLongLivedTokenUrl,
  buildThreadsPermalinkUrl,
  buildThreadsPublishRequest,
  buildThreadsTokenExchangeRequest,
  parseThreadsContainerResponse,
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

describe("threads permalink url", () => {
  it("asks for the permalink field on the media id", () => {
    const url = buildThreadsPermalinkUrl({ mediaId: "media-42", accessToken: TOKEN });
    expect(url).toContain("/media-42?fields=permalink");
    expect(url).toContain("access_token=threads-token");
  });
});
