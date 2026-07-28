import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AdInput } from "./renderAd";
import type { AdPreset } from "./adPresets";

/**
 * Persistence for single-image promo ads (social_ads). Service-role only —
 * the table is RLS-on with no policies, same posture as social_carousels.
 * Rendering reads a row back by id via /api/social/ad/[id].
 */

export type AdDraft = {
  input: AdInput;
  caption: string;
  hashtags: string[];
  preset?: AdPreset | null;
};

/** Insert generated ad drafts; returns new row ids (best-effort, mirrors carousels). */
export async function persistAdDrafts(
  agentId: number | null,
  drafts: AdDraft[],
): Promise<string[]> {
  if (drafts.length === 0) return [];
  const rows = drafts.map((d) => ({
    agent_id: agentId,
    template: d.input.template,
    preset: d.preset ?? null,
    format: d.input.format ?? "square",
    headline: d.input.headline ?? null,
    subhead: d.input.subhead ?? null,
    cta_text: d.input.ctaText ?? null,
    stat_value: d.input.statValue ?? null,
    stat_label: d.input.statLabel ?? null,
    stat_context: d.input.statContext ?? null,
    photo_url: d.input.photoUrl ?? null,
    caption: d.caption,
    hashtags: d.hashtags,
    status: "draft",
  }));
  const { data, error } = await supabaseAdmin.from("social_ads").insert(rows as never).select("id");
  if (error) {
    console.warn("[social] persistAdDrafts failed:", error.message);
    return [];
  }
  return ((data as { id: string }[] | null) ?? []).map((r) => r.id);
}

/**
 * Read a stored ad and reconstruct its AdInput for rendering. Returns null when
 * the id doesn't resolve (so the render route can 404). Service-role read by id.
 */
export async function getAdForRender(id: string): Promise<AdInput | null> {
  const { data, error } = await supabaseAdmin
    .from("social_ads")
    .select("template, format, headline, subhead, cta_text, stat_value, stat_label, stat_context, photo_url")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as {
    template?: string;
    format?: string;
    headline?: string | null;
    subhead?: string | null;
    cta_text?: string | null;
    stat_value?: string | null;
    stat_label?: string | null;
    stat_context?: string | null;
    photo_url?: string | null;
  };
  return {
    template: (r.template as AdInput["template"]) ?? "bold",
    format: (r.format as AdInput["format"]) ?? "square",
    headline: r.headline ?? "",
    subhead: r.subhead ?? undefined,
    ctaText: r.cta_text ?? undefined,
    statValue: r.stat_value ?? undefined,
    statLabel: r.stat_label ?? undefined,
    statContext: r.stat_context ?? undefined,
    photoUrl: r.photo_url ?? undefined,
  };
}

/** Read caption + hashtags for scheduling. */
export async function getAdForSchedule(
  id: string,
): Promise<{ caption: string; hashtags: string[] } | null> {
  const { data } = await supabaseAdmin
    .from("social_ads")
    .select("caption, hashtags")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const r = data as { caption?: string; hashtags?: string[] };
  return { caption: r.caption ?? "", hashtags: Array.isArray(r.hashtags) ? r.hashtags : [] };
}

/** Oldest-first draft ads for an agent. */
export async function loadDraftAds(agentStr: string): Promise<{ id: string }[]> {
  const { data } = await supabaseAdmin
    .from("social_ads")
    .select("id")
    .eq("agent_id", agentStr)
    .eq("status", "draft")
    .order("created_at", { ascending: true });
  return (data as { id: string }[] | null) ?? [];
}
