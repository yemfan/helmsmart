import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ReelSlide } from "@/lib/social/renderReel";

/**
 * Persistence for video reels (social_reels). Service-role only — RLS on, no
 * policies, same posture as social_carousels. A reel goes:
 *   draft → rendering (render_id/bucket set) → rendered (mp4_url set) →
 *   scheduled → posted.
 */

export type ReelDraft = { slides: ReelSlide[]; caption: string; hashtags: string[] };

export type ReelRow = {
  id: string;
  slides: ReelSlide[];
  caption: string | null;
  hashtags: string[];
  render_id: string | null;
  render_bucket: string | null;
  mp4_url: string | null;
  status: string;
};

export async function persistReelDrafts(
  agentId: number | null,
  drafts: ReelDraft[],
): Promise<string[]> {
  if (drafts.length === 0) return [];
  const rows = drafts.map((d) => ({
    agent_id: agentId,
    slides: d.slides,
    caption: d.caption,
    hashtags: d.hashtags,
    status: "draft",
  }));
  const { data, error } = await supabaseAdmin.from("social_reels").insert(rows as never).select("id");
  if (error) {
    console.warn("[social] persistReelDrafts failed:", error.message);
    return [];
  }
  return ((data as { id: string }[] | null) ?? []).map((r) => r.id);
}

export async function getReel(id: string): Promise<ReelRow | null> {
  const { data } = await supabaseAdmin
    .from("social_reels")
    .select("id, slides, caption, hashtags, render_id, render_bucket, mp4_url, status")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const r = data as ReelRow;
  return { ...r, slides: Array.isArray(r.slides) ? r.slides : [], hashtags: Array.isArray(r.hashtags) ? r.hashtags : [] };
}

/** Oldest-first draft reels for an agent (not yet rendering). */
export async function loadDraftReels(agentStr: string): Promise<{ id: string; slides: ReelSlide[] }[]> {
  const { data } = await supabaseAdmin
    .from("social_reels")
    .select("id, slides")
    .eq("agent_id", agentStr)
    .eq("status", "draft")
    .order("created_at", { ascending: true });
  return ((data as { id: string; slides: ReelSlide[] }[] | null) ?? []).map((r) => ({
    id: r.id,
    slides: Array.isArray(r.slides) ? r.slides : [],
  }));
}

/**
 * Single oldest draft reel across all agents — the render tick triggers ONE at
 * a time (global serialization for the low AWS Lambda concurrency quota).
 */
export async function loadNextDraftReel(): Promise<
  { id: string; agent_id: number | null; slides: ReelSlide[] } | null
> {
  const { data } = await supabaseAdmin
    .from("social_reels")
    .select("id, agent_id, slides")
    .eq("status", "draft")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const r = data as { id: string; agent_id: number | null; slides: ReelSlide[] };
  return { id: r.id, agent_id: r.agent_id, slides: Array.isArray(r.slides) ? r.slides : [] };
}

/** All reels currently rendering (across agents) — for the poll step. */
export async function listRenderingReels(): Promise<
  { id: string; agent_id: number | null; render_id: string; render_bucket: string }[]
> {
  const { data } = await supabaseAdmin
    .from("social_reels")
    .select("id, agent_id, render_id, render_bucket")
    .eq("status", "rendering")
    .not("render_id", "is", null)
    .not("render_bucket", "is", null);
  return (data as { id: string; agent_id: number | null; render_id: string; render_bucket: string }[] | null) ?? [];
}

/** Count reels an agent has that are still rendering (to serialize renders). */
export async function countRenderingReels(agentStr: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("social_reels")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentStr)
    .eq("status", "rendering");
  return count ?? 0;
}

export async function markReelRendering(
  id: string,
  renderId: string,
  bucket: string,
): Promise<void> {
  await supabaseAdmin
    .from("social_reels")
    .update({ status: "rendering", render_id: renderId, render_bucket: bucket, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
}

export async function markReelRendered(id: string, mp4Url: string): Promise<void> {
  await supabaseAdmin
    .from("social_reels")
    .update({ status: "rendered", mp4_url: mp4Url, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
}

export async function markReelStatus(id: string, status: string, error?: string): Promise<void> {
  await supabaseAdmin
    .from("social_reels")
    .update({ status, render_error: error ?? null, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
}
