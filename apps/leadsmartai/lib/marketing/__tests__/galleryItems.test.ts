import { describe, expect, it } from "vitest";
import { buildGalleryItems, type GalleryInput } from "../galleryItems";

const empty: GalleryInput = { media: [], listings: [], reels: [], carousels: [], scheduledPosts: [], publishedPosts: [], avatarJobs: [], videoMessages: [], agent: null };

describe("buildGalleryItems", () => {
  it("gathers every source, tells stills from videos, and dedupes by URL with the first source winning", () => {
    const { items, summary } = buildGalleryItems({
      ...empty,
      media: [{ id: "m1", url: "https://x/a.png", contentType: "image/png", label: "Headshot", fileName: "a.png", createdAt: "2026-09-01T00:00:00Z" }],
      listings: [{ id: "l1", address: "512 N Orange Grove Blvd", photoUrls: ["https://x/p1.jpg", "https://x/a.png"], adClipUrls: ["https://x/clip.mp4"], reelUrl: "https://x/reel.mp4", voicedReelUrl: null, createdAt: "2026-08-20T00:00:00Z" }],
      reels: [{ id: "r1", url: "https://x/reel.mp4", caption: "Nearly 8,000 sq ft\nsecond line", createdAt: "2026-09-05T00:00:00Z" }],
      carousels: [{ id: "c1", title: "Buyer tips", slideUrls: ["https://x/s1.png", 7, ""], createdAt: "2026-09-02T00:00:00Z" }],
      scheduledPosts: [{ id: "s1", url: "https://x/renders/out", caption: "A reel post", subjectKind: "social_reel", createdAt: "2026-09-03T00:00:00Z" }],
      publishedPosts: [{ id: "p1", url: "https://x/post.png", caption: "Just listed", platform: "facebook", externalUrl: "https://facebook.com/1", createdAt: "2026-09-04T00:00:00Z" }],
      avatarJobs: [{ id: "a1", url: "https://x/avatar.mp4", script: "Hi, I am Michael", createdAt: "2026-08-01T00:00:00Z" }],
      videoMessages: [{ id: "v1", url: "https://x/vm.mp4", poster: "https://x/vm.jpg", title: "For Grace", createdAt: "2026-09-06T00:00:00Z" }],
      agent: { photoUrl: "https://x/me.jpg", twinVideoUrl: "https://x/twin.mp4" },
    });

    // a.png appears in the library and on the listing: once, as an upload.
    expect(items.filter((i) => i.url === "https://x/a.png")).toHaveLength(1);
    expect(items.find((i) => i.url === "https://x/a.png")?.source).toBe("upload");
    // reel.mp4 is on the listing and in social_reels: once, as the listing's.
    expect(items.filter((i) => i.url === "https://x/reel.mp4").map((i) => i.source)).toEqual(["listing"]);
    // The listing clip borrows the matching photo as its poster.
    expect(items.find((i) => i.id === "listing:l1:clip:0")).toMatchObject({ kind: "video", poster: "https://x/p1.jpg" });
    // subject_kind says a reel even though the URL has no extension.
    expect(items.find((i) => i.id === "scheduled:s1")?.kind).toBe("video");
    // Captions are trimmed to their first line.
    expect(items.find((i) => i.id === "reel:r1")).toBeUndefined();
    expect(items.find((i) => i.id === "post:p1")).toMatchObject({ title: "Just listed", href: "https://facebook.com/1", kind: "image" });
    // Non-string slide entries are ignored.
    expect(items.filter((i) => i.source === "carousel")).toHaveLength(1);

    expect(summary.total).toBe(items.length);
    expect(summary.images + summary.videos).toBe(summary.total);
    expect(summary.bySource.map((s) => s.source)).toEqual(["upload", "listing", "carousel", "post", "avatar", "video_message", "profile"]);

    // Newest first; undated items (profile photo, twin video) last.
    expect(items[0]!.id).toBe("vm:v1");
    expect(items.slice(-2).map((i) => i.id).sort()).toEqual(["avatar:twin", "profile:photo"]);
  });

  it("drops blank and non-http urls and is empty for a new agent", () => {
    const r = buildGalleryItems({ ...empty, media: [{ id: "m", url: " ", contentType: null, label: null, fileName: null, createdAt: null }], reels: [{ id: "r", url: "data:video/mp4;base64,AAAA", caption: null, createdAt: null }] });
    expect(r.items).toEqual([]);
    expect(r.summary).toEqual({ total: 0, images: 0, videos: 0, bySource: [] });
  });
});
