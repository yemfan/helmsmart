import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getReel } from "./reels";

/**
 * Enqueue a rendered video reel into scheduled_posts — one row per connected,
 * video-capable account (Meta → Facebook video and/or Instagram Reels; LinkedIn
 * → LinkedIn video). The publish-scheduled cron routes subject_kind='social_reel'
 * rows through publishPost with mediaKind:"video", using the row's image_url as
 * the MP4 source.
 *
 * Mirrors scheduleAd, but video: image_url points at the reel's public mp4_url
 * (rendered by Remotion Lambda) and carousel_id stays null.
 */

export type ReelPlatform = "facebook" | "instagram" | "linkedin";

export async function scheduleReel(params: {
  agentId: string;
  reelId: string;
  /** ISO time to publish; defaults to now (drains on the next cron tick). */
  scheduledFor?: string;
  /** Optional platform allow-list; default = every connected supported platform. */
  platforms?: ReelPlatform[];
  /** 'scheduled' publishes on the next tick; 'awaiting_approval' holds for review. */
  queueStatus?: "scheduled" | "awaiting_approval";
}): Promise<{ scheduled: number; error?: string }> {
  const { agentId, reelId } = params;

  const reel = await getReel(reelId);
  if (!reel) return { scheduled: 0, error: "Reel not found." };
  if (!reel.mp4_url) return { scheduled: 0, error: "Reel has not finished rendering yet." };

  const hashtags = reel.hashtags;
  const tagLine = hashtags.length ? hashtags.map((h) => `#${String(h).replace(/^#/, "")}`).join(" ") : "";
  const caption = [reel.caption?.trim(), tagLine].filter(Boolean).join("\n\n");

  // The MP4 is already a public URL (Remotion Lambda S3 render). Meta pulls it
  // by URL; LinkedIn's publisher fetches the bytes itself.
  const mp4Url = reel.mp4_url;

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

  const allow = params.platforms ? new Set<ReelPlatform>(params.platforms) : null;
  const wants = (p: ReelPlatform) => !allow || allow.has(p);
  const scheduledFor = params.scheduledFor ?? new Date().toISOString();
  const status = params.queueStatus ?? "scheduled";

  const mkRow = (platform: ReelPlatform, socialAccountId: string) => ({
    agent_id: agentId,
    social_account_id: socialAccountId,
    platform,
    caption,
    hashtags,
    media_library_id: null,
    image_url: mp4Url,
    carousel_id: null,
    trigger_kind: "marketing_assistant_reel",
    subject_kind: "social_reel",
    subject_ref_id: reelId,
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
    return { scheduled: 0, error: "No connected video-capable accounts (Facebook, Instagram, or LinkedIn)." };
  }

  const { error } = await supabaseAdmin.from("scheduled_posts").insert(rows as never);
  if (error) return { scheduled: 0, error: error.message };
  return { scheduled: rows.length };
}
