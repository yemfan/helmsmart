import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { publishPost } from "@/lib/leads-gen/publish";
import { BRAND_POSTS } from "./posts";

/**
 * RealtyBoss brand auto-poster. Publishes the next unposted brand post
 * (posts.ts) to the connected LinkedIn account, on a schedule (the cron).
 *
 * Reuses the existing LinkedIn pipeline: the owner connects their LinkedIn in
 * the app (Leads → connect LinkedIn → a `social_accounts` row), and we post via
 * `publishPost`. Which account to post from is set by env
 * `BRAND_LINKEDIN_AGENT_ID` (the owner's agent id). Fully gated — no env / no
 * connection / all-posted => a clean no-op.
 */

export type BrandPostResult =
  | { status: "posted"; key: string; url: string | null }
  | { status: "skipped"; reason: string };

async function postedKeys(platform: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from("brand_social_log")
    .select("post_key")
    .eq("platform", platform);
  return new Set(((data ?? []) as Array<{ post_key: string }>).map((r) => r.post_key));
}

/** Post the next unposted brand post to LinkedIn. */
export async function postNextBrandLinkedIn(): Promise<BrandPostResult> {
  const agentId = process.env.BRAND_LINKEDIN_AGENT_ID?.trim();
  if (!agentId) return { status: "skipped", reason: "BRAND_LINKEDIN_AGENT_ID not set" };

  // The owner's connected LinkedIn account (most recent).
  const { data: conn } = await supabaseAdmin
    .from("social_accounts")
    .select("id, status")
    .eq("agent_id", agentId)
    .eq("platform", "linkedin")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const connectionId = (conn as { id?: string } | null)?.id;
  if (!connectionId) return { status: "skipped", reason: "No LinkedIn account connected" };

  const done = await postedKeys("linkedin");
  const next = BRAND_POSTS.find((p) => !done.has(p.key));
  if (!next) return { status: "skipped", reason: "All brand posts already published" };

  const res = await publishPost({
    agentId,
    platform: "linkedin",
    connectionId,
    caption: next.caption,
    hashtags: next.hashtags,
    trigger: "brand_marketing",
  });

  if (!res.ok) {
    // Don't log on failure — it'll be retried next run. Transient errors clear
    // themselves; a permanent one (revoked token) surfaces in the cron logs.
    return { status: "skipped", reason: `publish failed: ${res.error}` };
  }

  await supabaseAdmin.from("brand_social_log").insert({
    post_key: next.key,
    platform: "linkedin",
    external_post_id: res.externalPostId,
    external_url: res.externalPostUrl,
  });

  return { status: "posted", key: next.key, url: res.externalPostUrl };
}
