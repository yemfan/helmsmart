import { describe, expect, it } from "vitest";
import { BODY_MAX, composerHref, mediaShape, parseLibraryInput } from "../library";

describe("parseLibraryInput", () => {
  it("accepts a caption with wording and trims it", () => {
    const r = parseLibraryInput({ kind: "caption", title: "  Open house  ", body: " Join us Sunday 1-4. ", mediaUrl: "" });
    expect(r).toEqual({ ok: true, item: { kind: "caption", title: "Open house", body: "Join us Sunday 1-4.", mediaUrl: null } });
  });

  it("requires wording for a caption and a URL for media and links", () => {
    expect(parseLibraryInput({ kind: "caption", title: "x", body: "" })).toEqual({ ok: false, field: "body", reason: "required" });
    expect(parseLibraryInput({ kind: "media", title: "Logo", body: "" })).toEqual({ ok: false, field: "mediaUrl", reason: "required" });
    expect(parseLibraryInput({ kind: "link", title: "Site", mediaUrl: "ftp://x" })).toEqual({ ok: false, field: "mediaUrl", reason: "bad_url" });
    expect(parseLibraryInput({ kind: "link", title: "Site", mediaUrl: "https://maxyinvestment.com" }).ok).toBe(true);
  });

  it("rejects an unknown kind, a missing title, and wording past the longest network's limit", () => {
    expect(parseLibraryInput({ kind: "video", title: "x" })).toEqual({ ok: false, field: "kind", reason: "required" });
    expect(parseLibraryInput({ kind: "caption", title: " ", body: "x" })).toEqual({ ok: false, field: "title", reason: "required" });
    expect(parseLibraryInput({ kind: "caption", title: "x", body: "a".repeat(BODY_MAX + 1) })).toEqual({ ok: false, field: "body", reason: "too_long" });
  });
});

describe("composerHref", () => {
  it("opens the composer with the caption as the brief, url-encoded", () => {
    const href = composerHref({ id: "1", kind: "caption", title: "T", body: "Sunday 1-4 & more", mediaUrl: null, createdBy: "a", createdAt: "" });
    expect(href).toBe("/dashboard/leads/generate/post/new?brief=Sunday%201-4%20%26%20more");
  });
});

describe("mediaShape", () => {
  it("tells images from videos from everything else by extension", () => {
    expect(mediaShape("https://x/logo.PNG?v=2")).toBe("image");
    expect(mediaShape("https://x/brand.mp4")).toBe("video");
    expect(mediaShape("https://x/report")).toBe("other");
    expect(mediaShape(null)).toBe("other");
  });
});
