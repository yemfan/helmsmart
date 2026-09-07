import "server-only";

import { listMediaForAgent } from "@/lib/leads-gen/media";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildGalleryItems, type GalleryItem, type GallerySummary } from "./galleryItems";

/**
 * Every picture and video the platform holds for one agent, read from the
 * seven places that keep them and combined by galleryItems.ts. Each read is
 * bounded and filtered on the agent id; one source failing leaves the rest.
 */
export async function loadGallery(agentId: string): Promise<{ items: GalleryItem[]; summary: GallerySummary }> {
  const id = agentId as never;
  const safe = async <T,>(p: PromiseLike<{ data: T | null; error?: { message: string } | null }>, what: string): Promise<T | null> => {
    try {
      const r = await p;
      if (r.error) console.warn(`[gallery] ${what}:`, r.error.message);
      return r.data;
    } catch (e) {
      console.warn(`[gallery] ${what}:`, e instanceof Error ? e.message : e);
      return null;
    }
  };

  const [media, listings, reels, carousels, scheduled, published, avatars, videoMessages, agent] = await Promise.all([
    listMediaForAgent(agentId, { kind: null, limit: 200 }).catch((e) => {
      console.warn("[gallery] media library:", e instanceof Error ? e.message : e);
      return [];
    }),
    safe(supabaseAdmin.from("listings").select("id, property_address, city, photo_urls, ad_clip_urls, ad_reel_url, ad_reel_voiced_url, created_at").eq("agent_id", id).order("created_at", { ascending: false }).limit(100), "listings"),
    safe(supabaseAdmin.from("social_reels").select("id, mp4_url, caption, created_at").eq("agent_id", id).not("mp4_url", "is", null).order("created_at", { ascending: false }).limit(200), "reels"),
    safe(supabaseAdmin.from("social_carousels").select("id, title, slide_image_urls, created_at").eq("agent_id", id).not("slide_image_urls", "is", null).order("created_at", { ascending: false }).limit(100), "carousels"),
    safe(supabaseAdmin.from("scheduled_posts").select("id, image_url, caption, subject_kind, created_at").eq("agent_id", id).not("image_url", "is", null).order("created_at", { ascending: false }).limit(300), "scheduled posts"),
    safe(supabaseAdmin.from("lead_posts").select("id, media_url_used, caption, platform, external_post_url, published_at, created_at").eq("agent_id", id).not("media_url_used", "is", null).order("created_at", { ascending: false }).limit(300), "published posts"),
    safe(supabaseAdmin.from("avatar_render_jobs").select("id, video_url, script, created_at").eq("agent_id", id).not("video_url", "is", null).order("created_at", { ascending: false }).limit(50), "avatar videos"),
    safe(supabaseAdmin.from("video_messages").select("id, video_url, thumbnail_url, title, created_at").eq("agent_id", id).not("video_url", "is", null).order("created_at", { ascending: false }).limit(100), "video messages"),
    safe(supabaseAdmin.from("agents").select("agent_photo_url, dt_avatar_video_url").eq("id", id).maybeSingle(), "agent"),
  ]);

  type R = Record<string, unknown>;
  const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
  const rows = (v: unknown): R[] => (Array.isArray(v) ? (v as R[]) : []);
  const a = agent as R | null;

  return buildGalleryItems({
    media: media.map((m) => ({ id: m.id, url: m.signedUrl, contentType: m.contentType, label: m.label, fileName: m.fileName, createdAt: m.createdAt })),
    listings: rows(listings).map((r) => ({
      id: String(r.id),
      address: [s(r.property_address), s(r.city)].filter(Boolean).join(", ") || null,
      photoUrls: r.photo_urls,
      adClipUrls: r.ad_clip_urls,
      reelUrl: s(r.ad_reel_url),
      voicedReelUrl: s(r.ad_reel_voiced_url),
      createdAt: s(r.created_at),
    })),
    reels: rows(reels).map((r) => ({ id: String(r.id), url: s(r.mp4_url), caption: s(r.caption), createdAt: s(r.created_at) })),
    carousels: rows(carousels).map((r) => ({ id: String(r.id), title: s(r.title), slideUrls: r.slide_image_urls, createdAt: s(r.created_at) })),
    scheduledPosts: rows(scheduled).map((r) => ({ id: String(r.id), url: s(r.image_url), caption: s(r.caption), subjectKind: s(r.subject_kind), createdAt: s(r.created_at) })),
    publishedPosts: rows(published).map((r) => ({ id: String(r.id), url: s(r.media_url_used), caption: s(r.caption), platform: s(r.platform), externalUrl: s(r.external_post_url), createdAt: s(r.published_at) ?? s(r.created_at) })),
    avatarJobs: rows(avatars).map((r) => ({ id: String(r.id), url: s(r.video_url), script: s(r.script), createdAt: s(r.created_at) })),
    videoMessages: rows(videoMessages).map((r) => ({ id: String(r.id), url: s(r.video_url), poster: s(r.thumbnail_url), title: s(r.title), createdAt: s(r.created_at) })),
    agent: a ? { photoUrl: s(a.agent_photo_url), twinVideoUrl: s(a.dt_avatar_video_url) } : null,
  });
}
