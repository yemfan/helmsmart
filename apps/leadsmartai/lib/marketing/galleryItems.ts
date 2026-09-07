import { postMediaKind } from "@/lib/marketing-hub/mediaKind";

/**
 * The agent's gallery: every picture and video the platform holds for them,
 * from seven places that each kept their own — the pure half.
 *
 *   upload         media_library (the Generate Leads library)
 *   listing        listings.photo_urls, ad clips, the rendered listing reel
 *   reel           social_reels (rendered MP4s)
 *   carousel       social_carousels (slide images)
 *   post           scheduled_posts.image_url + lead_posts.media_url_used
 *   avatar         avatar_render_jobs + the digital-twin intro video
 *   video_message  video_messages
 *   profile        the agent's photo
 *
 * The same file often appears in more than one place (a reel becomes a post;
 * a listing photo is uploaded to the library), so items are deduplicated by
 * URL and the first source wins in the order above. Rows in, items out; the
 * reading lives in gallery.ts.
 */

export type GalleryKind = "image" | "video";
export type GallerySource = "upload" | "listing" | "reel" | "carousel" | "post" | "avatar" | "video_message" | "profile";

export type GalleryItem = {
  id: string;
  url: string;
  kind: GalleryKind;
  /** Still frame for a video, when one exists. */
  poster: string | null;
  source: GallerySource;
  /** A caption, address, label or file name — whatever the source knew. */
  title: string | null;
  createdAt: string | null;
  /** Set for library uploads, which the agent can delete from the gallery. */
  mediaLibraryId: string | null;
  /** Where the item came from in the dashboard, when there is such a page. */
  href: string | null;
};

export type GallerySummary = {
  total: number;
  images: number;
  videos: number;
  bySource: { source: GallerySource; count: number }[];
};

export type GalleryInput = {
  media: { id: string; url: string | null; contentType: string | null; label: string | null; fileName: string | null; createdAt: string | null }[];
  listings: { id: string; address: string | null; photoUrls: unknown; adClipUrls: unknown; reelUrl: string | null; voicedReelUrl: string | null; createdAt: string | null }[];
  reels: { id: string; url: string | null; caption: string | null; createdAt: string | null }[];
  carousels: { id: string; title: string | null; slideUrls: unknown; createdAt: string | null }[];
  scheduledPosts: { id: string; url: string | null; caption: string | null; subjectKind: string | null; createdAt: string | null }[];
  publishedPosts: { id: string; url: string | null; caption: string | null; platform: string | null; externalUrl: string | null; createdAt: string | null }[];
  avatarJobs: { id: string; url: string | null; script: string | null; createdAt: string | null }[];
  videoMessages: { id: string; url: string | null; poster: string | null; title: string | null; createdAt: string | null }[];
  agent: { photoUrl: string | null; twinVideoUrl: string | null } | null;
};

function urls(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
}

function kindOf(url: string, contentType?: string | null, subjectKind?: string | null): GalleryKind {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.startsWith("video/")) return "video";
  if (ct.startsWith("image/")) return "image";
  return postMediaKind({ url, subjectKind }) === "video" ? "video" : "image";
}

function firstLine(s: string | null | undefined, max = 90): string | null {
  const line = (s ?? "").split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  if (!line) return null;
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Finite so two undated items compare as equal instead of NaN. */
const UNDATED = -8.64e15;

const SOURCE_ORDER: GallerySource[] = ["upload", "listing", "reel", "carousel", "post", "avatar", "video_message", "profile"];

export function buildGalleryItems(input: GalleryInput): { items: GalleryItem[]; summary: GallerySummary } {
  const seen = new Set<string>();
  const items: GalleryItem[] = [];
  const push = (item: Omit<GalleryItem, "kind"> & { kind?: GalleryKind; contentType?: string | null; subjectKind?: string | null }) => {
    const url = item.url.trim();
    if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) return;
    seen.add(url);
    const { contentType, subjectKind, ...rest } = item;
    items.push({ ...rest, url, kind: item.kind ?? kindOf(url, contentType, subjectKind) });
  };

  for (const m of input.media) {
    if (m.url) push({ id: `upload:${m.id}`, url: m.url, poster: null, source: "upload", title: m.label || m.fileName, createdAt: m.createdAt, mediaLibraryId: m.id, href: "/dashboard/leads/generate", contentType: m.contentType });
  }
  for (const l of input.listings) {
    const href = `/dashboard/listings/${l.id}`;
    urls(l.photoUrls).forEach((u, i) => push({ id: `listing:${l.id}:photo:${i}`, url: u, kind: "image", poster: null, source: "listing", title: l.address, createdAt: l.createdAt, mediaLibraryId: null, href }));
    urls(l.adClipUrls).forEach((u, i) => push({ id: `listing:${l.id}:clip:${i}`, url: u, kind: "video", poster: urls(l.photoUrls)[i] ?? null, source: "listing", title: l.address, createdAt: l.createdAt, mediaLibraryId: null, href }));
    for (const [key, u] of [["reel", l.reelUrl], ["voiced", l.voicedReelUrl]] as const) {
      if (u) push({ id: `listing:${l.id}:${key}`, url: u, kind: "video", poster: urls(l.photoUrls)[0] ?? null, source: "listing", title: l.address, createdAt: l.createdAt, mediaLibraryId: null, href });
    }
  }
  for (const r of input.reels) {
    if (r.url) push({ id: `reel:${r.id}`, url: r.url, kind: "video", poster: null, source: "reel", title: firstLine(r.caption), createdAt: r.createdAt, mediaLibraryId: null, href: "/dashboard/leads/generate/posts" });
  }
  for (const c of input.carousels) {
    urls(c.slideUrls).forEach((u, i) => push({ id: `carousel:${c.id}:${i}`, url: u, kind: "image", poster: null, source: "carousel", title: c.title, createdAt: c.createdAt, mediaLibraryId: null, href: "/dashboard/leads/generate/posts" }));
  }
  for (const p of input.scheduledPosts) {
    if (p.url) push({ id: `scheduled:${p.id}`, url: p.url, poster: null, source: "post", title: firstLine(p.caption), createdAt: p.createdAt, mediaLibraryId: null, href: "/dashboard/leads/generate/posts", subjectKind: p.subjectKind });
  }
  for (const p of input.publishedPosts) {
    if (p.url) push({ id: `post:${p.id}`, url: p.url, poster: null, source: "post", title: firstLine(p.caption), createdAt: p.createdAt, mediaLibraryId: null, href: p.externalUrl || "/dashboard/leads/generate/posts" });
  }
  for (const a of input.avatarJobs) {
    if (a.url) push({ id: `avatar:${a.id}`, url: a.url, kind: "video", poster: input.agent?.photoUrl ?? null, source: "avatar", title: firstLine(a.script), createdAt: a.createdAt, mediaLibraryId: null, href: "/dashboard/settings/account" });
  }
  if (input.agent?.twinVideoUrl) {
    push({ id: "avatar:twin", url: input.agent.twinVideoUrl, kind: "video", poster: input.agent.photoUrl ?? null, source: "avatar", title: null, createdAt: null, mediaLibraryId: null, href: "/dashboard/settings/account" });
  }
  for (const v of input.videoMessages) {
    if (v.url) push({ id: `vm:${v.id}`, url: v.url, kind: "video", poster: v.poster, source: "video_message", title: v.title, createdAt: v.createdAt, mediaLibraryId: null, href: null });
  }
  if (input.agent?.photoUrl) {
    push({ id: "profile:photo", url: input.agent.photoUrl, kind: "image", poster: null, source: "profile", title: null, createdAt: null, mediaLibraryId: null, href: "/dashboard/settings/account" });
  }

  // Newest first; items without a date (the profile photo, the twin) go last.
  items.sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : UNDATED;
    const tb = b.createdAt ? Date.parse(b.createdAt) : UNDATED;
    return tb - ta;
  });

  const bySource = SOURCE_ORDER.map((source) => ({ source, count: items.filter((i) => i.source === source).length })).filter((s) => s.count > 0);
  return {
    items,
    summary: {
      total: items.length,
      images: items.filter((i) => i.kind === "image").length,
      videos: items.filter((i) => i.kind === "video").length,
      bySource,
    },
  };
}
