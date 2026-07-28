import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/siteUrl";
import { getAdForSchedule } from "./ads";

/**
 * Enqueue a stored promo ad into scheduled_posts — one row per connected,
 * ad-capable account (a Meta connection yields Facebook and/or Instagram; a
 * LinkedIn connection yields LinkedIn). The publish-scheduled cron then
 * single-image-publishes each via publishPost, using the row's image_url.
 *
 * Mirrors scheduleCarousel, but single-image: image_url points at the public
 * render route (/api/social/ad/[id]) and carousel_id stays null.
 */

export type AdPlatform = "facebook" | "instagram" | "linkedin";

export async function scheduleAd(params: {
  agentId: string;
  adId: string;
  /** ISO time to publish; defaults to now (drains on the next cron tick). */
  scheduledFor?: string;
  /** Optional platform allow-list; default = every connected supported platform. */
  platforms?: AdPlatform[];
  /** 'scheduled' publishes on the next tick; 'awaiting_approval' holds for review. */
  queueStatus?: "scheduled" | "awaiting_approval";
}): Promise<{ scheduled: number; error?: string }> {
  const { agentId, adId } = params;

  const ad = await getAdForSchedule(adId);
  if (!ad) return { scheduled: 0, error: "Ad not found." };

  const hashtags = ad.hashtags;
  const tagLine = hashtags.length ? hashtags.map((h) => `#${String(h).replace(/^#/, "")}`).join(" ") : "";
  const caption = [ad.caption?.trim(), tagLine].filter(Boolean).join("\n\n");

  const base = getSiteUrl().replace(/\/$/, "");
  const imageUrl = `${base}/api/social/ad/${adId}`;

  const { data: accountRows } = await supabaseAdmin
    .from("social_accounts")
    .select("id, platform, fb_page_id, ig_business_user_id, linkedin_member_urn, status")
    .eq("agent_id", agentId)
    .in("platform", ["meta", "linkedin"])
    .eq("status", "connected");
  const accounts = (accountRows as
    | {
        id: string;
        platform: string;
        fb_page_id: string | null;
        ig_business_user_id: string | null;
        linkedin_member_urn: string | null;
      }[]
    | null) ?? [];

  const allow = params.platforms ? new Set<AdPlatform>(params.platforms) : null;
  const wants = (p: AdPlatform) => !allow || allow.has(p);
  const scheduledFor = params.scheduledFor ?? new Date().toISOString();
  const status = params.queueStatus ?? "scheduled";

  const mkRow = (platform: AdPlatform, socialAccountId: string) => ({
    agent_id: agentId,
    social_account_id: socialAccountId,
    platform,
    caption,
    hashtags,
    media_library_id: null,
    image_url: imageUrl,
    carousel_id: null,
    trigger_kind: "marketing_assistant_ad",
    subject_kind: "social_ad",
    subject_ref_id: adId,
    status,
    scheduled_for: scheduledFor,
  });

  const rows: ReturnType<typeof mkRow>[] = [];
  for (const acct of accounts) {
    if (acct.platform === "meta") {
      if (acct.fb_page_id && wants("facebook")) rows.push(mkRow("facebook", acct.id));
      if (acct.ig_business_user_id && wants("instagram")) rows.push(mkRow("instagram", acct.id));
    } else if (acct.platform === "linkedin") {
      if (acct.linkedin_member_urn && wants("linkedin")) rows.push(mkRow("linkedin", acct.id));
    }
  }

  if (rows.length === 0) {
    return { scheduled: 0, error: "No connected ad-capable accounts (Facebook, Instagram, or LinkedIn)." };
  }

  const { error } = await supabaseAdmin.from("scheduled_posts").insert(rows as never);
  if (error) return { scheduled: 0, error: error.message };
  return { scheduled: rows.length };
}
