import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { publishPost } from "@/lib/leads-gen/publish";
import { BRAND_POSTS } from "./posts";

/**
 * RealtyBoss brand auto-poster. Publishes the next unposted brand post
 * (posts.ts) to the connected brand account, on a schedule (the crons).
 *
 * Reuses the existing publish pipeline: the owner connects the account in the
 * app (a `social_accounts` row) and we post via `publishPost`. Which account to
 * post from is set per platform by env (BRAND_LINKEDIN_AGENT_ID /
 * BRAND_FACEBOOK_AGENT_ID — the owner's agent id). Fully gated — no env / no
 * connection / all-posted => a clean no-op.
 *
 * Each platform walks the BRAND_POSTS list independently (progress is tracked
 * per-platform in `brand_social_log`), so the same content lands on each feed.
 */

export type BrandPlatform = "linkedin" | "facebook";

export type BrandPostResult =
  | { status: "posted"; key: string; url: string | null }
  | { status: "skipped"; reason: string };

const PLATFORM_CONFIG: Record<
  BrandPlatform,
  { envKey: string; connectionPlatform: string; label: string }
> = {
  linkedin: {
    envKey: "BRAND_LINKEDIN_AGENT_ID",
    connectionPlatform: "linkedin",
    label: "LinkedIn",
  },
  facebook: {
    envKey: "BRAND_FACEBOOK_AGENT_ID",
    // Facebook/Instagram connections are stored as platform "meta" (one Meta
    // grant covers both) — see lib/leads-gen/publish.ts.
    connectionPlatform: "meta",
    label: "Facebook",
  },
};

async function postedKeys(platform: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from("brand_social_log")
    .select("post_key")
    .eq("platform", platform);
  return new Set(((data ?? []) as Array<{ post_key: string }>).map((r) => r.post_key));
}

/** Post the next unposted brand post to the given platform. */
async function postNextBrand(platform: BrandPlatform): Promise<BrandPostResult> {
  const cfg = PLATFORM_CONFIG[platform];
  const agentId = process.env[cfg.envKey]?.trim();
  if (!agentId) return { status: "skipped", reason: `${cfg.envKey} not set` };

  // The owner's connected account for this platform (most recent).
  const { data: conn } = await supabaseAdmin
    .from("social_accounts")
    .select("id, status")
    .eq("agent_id", agentId)
    .eq("platform", cfg.connectionPlatform)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const connectionId = (conn as { id?: string } | null)?.id;
  if (!connectionId) return { status: "skipped", reason: `No ${cfg.label} account connected` };

  const done = await postedKeys(platform);
  const next = BRAND_POSTS.find((p) => !done.has(p.key));
  if (!next) return { status: "skipped", reason: "All brand posts already published" };

  const res = await publishPost({
    agentId,
    platform,
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
    platform,
    external_post_id: res.externalPostId,
    external_url: res.externalPostUrl,
  });

  return { status: "posted", key: next.key, url: res.externalPostUrl };
}

/** Post the next unposted brand post to LinkedIn. */
export function postNextBrandLinkedIn(): Promise<BrandPostResult> {
  return postNextBrand("linkedin");
}

/** Post the next unposted brand post to the brand's Facebook Page. */
export function postNextBrandFacebook(): Promise<BrandPostResult> {
  return postNextBrand("facebook");
}
