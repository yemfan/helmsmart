import "server-only";

import type { CarouselPlatform } from "@/lib/leads-gen/carousel-publish";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Enqueue a stored carousel into scheduled_posts — one row per connected,
 * carousel-capable account (a Meta connection yields a Facebook row and/or an
 * Instagram row; a LinkedIn connection yields a LinkedIn row). The
 * publish-scheduled cron then multi-image-publishes each via carousel_id.
 *
 * Mirrors scheduleRecommendation (single posts) but for the carousel path.
 */
export async function scheduleCarousel(params: {
  agentId: string;
  carouselId: string;
  /** ISO time to publish; defaults to now (drains on the next cron tick). */
  scheduledFor?: string;
  /** Optional platform allow-list; default = every supported connected platform. */
  platforms?: CarouselPlatform[];
  /** 'scheduled' publishes on the next tick; 'awaiting_approval' holds for review. */
  queueStatus?: "scheduled" | "awaiting_approval";
}): Promise<{ scheduled: number; error?: string }> {
  const { agentId, carouselId } = params;

  const { data: carRow } = await supabaseAdmin
    .from("social_carousels")
    .select("caption, hashtags")
    .eq("id", carouselId)
    .maybeSingle();
  const carousel = carRow as { caption?: string; hashtags?: string[] } | null;
  if (!carousel) return { scheduled: 0, error: "Carousel not found." };

  const hashtags = Array.isArray(carousel.hashtags) ? carousel.hashtags : [];
  const tagLine = hashtags.length ? hashtags.map((h) => `#${String(h).replace(/^#/, "")}`).join(" ") : "";
  const caption = [carousel.caption?.trim(), tagLine].filter(Boolean).join("\n\n");

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

  const allow = params.platforms ? new Set<CarouselPlatform>(params.platforms) : null;
  const wants = (p: CarouselPlatform) => !allow || allow.has(p);
  const scheduledFor = params.scheduledFor ?? new Date().toISOString();
  const status = params.queueStatus ?? "scheduled";

  const mkRow = (platform: CarouselPlatform, socialAccountId: string) => ({
    agent_id: agentId,
    social_account_id: socialAccountId,
    platform,
    caption,
    hashtags,
    media_library_id: null,
    image_url: null,
    carousel_id: carouselId,
    trigger_kind: "marketing_assistant_carousel",
    subject_kind: "social_carousel",
    subject_ref_id: carouselId,
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
    return { scheduled: 0, error: "No connected carousel-capable accounts (Facebook, Instagram, or LinkedIn)." };
  }

  const { error } = await supabaseAdmin.from("scheduled_posts").insert(rows as never);
  if (error) return { scheduled: 0, error: error.message };
  return { scheduled: rows.length };
}
