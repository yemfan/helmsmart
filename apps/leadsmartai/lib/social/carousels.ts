import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

import type { CarouselDraft, CarouselSlide } from "@/lib/social/generateCarousel";

/**
 * Persistence for social carousels (reach Phase 3a, PR 2). Service-role only —
 * `social_carousels` has RLS on with no policies, same posture as
 * social_post_recommendations. Rendering reads a row back by id.
 */

export type CarouselRow = {
  id: string;
  agent_id: number | null;
  voice: "founder" | "brand";
  title: string;
  caption: string;
  slides: CarouselSlide[];
  hashtags: string[];
  status: string;
};

/**
 * Insert generated carousel drafts. Returns the new row ids in input order
 * (best-effort: a failed insert is skipped, not thrown, mirroring the
 * generate→persist contract elsewhere in this module).
 */
export async function persistCarouselDrafts(
  agentId: number | null,
  drafts: CarouselDraft[],
): Promise<string[]> {
  if (drafts.length === 0) return [];
  const rows = drafts.map((d) => ({
    agent_id: agentId,
    voice: d.voice,
    title: d.title,
    caption: d.caption,
    slides: d.slides,
    hashtags: d.hashtags,
    status: "draft",
  }));
  const { data, error } = await supabaseAdmin
    .from("social_carousels")
    .insert(rows as never)
    .select("id");
  if (error) {
    console.warn("[social] persistCarouselDrafts failed:", error.message);
    return [];
  }
  return ((data as { id: string }[] | null) ?? []).map((r) => r.id);
}

/**
 * Read the slides + title of a carousel for rendering. Returns null when the id
 * doesn't resolve (so the render route can 404). Public-scope read (the route
 * has no auth, same as /api/social/card/[id]) — service-role reads its row by id.
 */
export async function getCarouselForRender(
  id: string,
): Promise<{ title: string; slides: CarouselSlide[] } | null> {
  const { data, error } = await supabaseAdmin
    .from("social_carousels")
    .select("title, slides")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { title?: string; slides?: unknown };
  const slides = Array.isArray(row.slides) ? (row.slides as CarouselSlide[]) : [];
  if (slides.length === 0) return null;
  return { title: row.title ?? "", slides };
}
