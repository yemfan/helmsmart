import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/leads-gen/token-enc";
import { publishLinkedInPost } from "@/lib/leads-gen/linkedin-post";
import { BRAND_POSTS } from "./posts";

/**
 * PropertyTools AI brand auto-poster. Publishes the next unposted brand post
 * (posts.ts) to the connected LinkedIn account, on a schedule (the cron).
 *
 * Reuses the shared `social_accounts` LinkedIn pipeline: the owner connects a
 * LinkedIn account in-app (a `social_accounts` row), and env
 * `BRAND_LINKEDIN_AGENT_ID` names which agent to post from. Fully gated — no
 * env / no connection / all-posted => a clean no-op. Text posts only (no
 * `publish.ts` Meta/media machinery needed).
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

  const { data: conn } = await supabaseAdmin
    .from("social_accounts")
    .select("id, linkedin_member_urn, user_access_token_enc, status")
    .eq("agent_id", agentId)
    .eq("platform", "linkedin")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const account = conn as
    | { linkedin_member_urn?: string; user_access_token_enc?: string }
    | null;
  if (!account?.linkedin_member_urn || !account?.user_access_token_enc) {
    return { status: "skipped", reason: "No LinkedIn account connected" };
  }

  // Because brand_social_log is shared with RealtyBoss, `done` will include
  // RealtyBoss's keys too — harmless, since all keys here are `ptai-`-prefixed
  // and can't match, so BRAND_POSTS.find always resolves to our own next post.
  const done = await postedKeys("linkedin");
  const next = BRAND_POSTS.find((p) => !done.has(p.key));
  if (!next) return { status: "skipped", reason: "All brand posts already published" };

  let token: string;
  try {
    token = decryptToken(account.user_access_token_enc);
  } catch {
    return { status: "skipped", reason: "Stored token could not be decrypted (reconnect LinkedIn)" };
  }

  const caption = next.hashtags.length
    ? `${next.caption}\n\n${next.hashtags.map((h) => `#${h}`).join(" ")}`
    : next.caption;

  let res: { externalPostId: string; externalPostUrl: string | null };
  try {
    res = await publishLinkedInPost({
      memberUrn: account.linkedin_member_urn,
      accessToken: token,
      caption,
      imageBytes: null,
      imageContentType: null,
    });
  } catch (e) {
    // Don't log on failure — it'll be retried next run. Transient errors clear
    // themselves; a permanent one (revoked token) surfaces in the cron logs.
    const msg = e instanceof Error ? e.message : "unknown error";
    return { status: "skipped", reason: `publish failed: ${msg}` };
  }

  await supabaseAdmin.from("brand_social_log").insert({
    post_key: next.key,
    platform: "linkedin",
    external_post_id: res.externalPostId,
    external_url: res.externalPostUrl,
  });

  return { status: "posted", key: next.key, url: res.externalPostUrl };
}
