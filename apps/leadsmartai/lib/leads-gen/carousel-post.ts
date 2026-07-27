import "server-only";

import { publishCarousel, type CarouselPlatform } from "@/lib/leads-gen/carousel-publish";
import { decryptToken } from "@/lib/leads-gen/token-enc";
import { getSiteUrl } from "@/lib/siteUrl";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Publish a stored carousel to one connected account, returning the same
 * ok/retryable/error shape as publishPost so the publish-scheduled cron (and
 * the manual trigger endpoint) can treat carousels and single posts uniformly.
 *
 * Config/validation problems (no connection, bad token, <2 slides) are
 * PERMANENT (retryable:false). A platform API throw is treated as transient
 * (retryable:true) — the cron's attempt cap bounds it to 3 tries.
 */

export type CarouselPostOutcome =
  | { ok: true; leadPostId: string | null; externalPostId: string; externalPostUrl: string | null }
  | { ok: false; error: string; retryable: boolean };

export async function publishCarouselPost(params: {
  agentId: string;
  connectionId: string;
  platform: CarouselPlatform;
  carouselId: string;
  /** Final caption (hashtags already folded in by the caller). */
  caption: string;
  hashtags?: string[] | null;
}): Promise<CarouselPostOutcome> {
  const { agentId, connectionId, platform, carouselId, caption } = params;

  // 1. Carousel slides → count drives the public slide URLs.
  const { data: carRow } = await supabaseAdmin
    .from("social_carousels")
    .select("slides")
    .eq("id", carouselId)
    .maybeSingle();
  const slides = (carRow as { slides?: unknown[] } | null)?.slides;
  if (!Array.isArray(slides) || slides.length < 2) {
    return { ok: false, error: "Carousel not found or has fewer than 2 slides.", retryable: false };
  }

  // 2. Connection (scoped to the agent).
  const { data: connRow } = await supabaseAdmin
    .from("social_accounts")
    .select(
      "id, fb_page_id, ig_business_user_id, page_access_token_enc, user_access_token_enc, linkedin_member_urn",
    )
    .eq("id", connectionId)
    .eq("agent_id", agentId)
    .maybeSingle();
  const conn = connRow as {
    id: string;
    fb_page_id: string | null;
    ig_business_user_id: string | null;
    page_access_token_enc: string | null;
    user_access_token_enc: string | null;
    linkedin_member_urn: string | null;
  } | null;
  if (!conn) return { ok: false, error: "Connection not found.", retryable: false };

  // 3. Token.
  let accessToken: string;
  try {
    const enc = platform === "linkedin" ? conn.user_access_token_enc : conn.page_access_token_enc;
    if (!enc) throw new Error("missing token");
    accessToken = decryptToken(enc);
  } catch {
    return { ok: false, error: `Connection token is invalid — reconnect ${platform}.`, retryable: false };
  }

  // 4. Public slide image URLs.
  const base = getSiteUrl().replace(/\/$/, "");
  const imageUrls = Array.from(
    { length: slides.length },
    (_, k) => `${base}/api/social/carousel/${carouselId}/${k}`,
  );

  // 5. Publish + 6. record.
  try {
    const result = await publishCarousel({
      platform,
      caption,
      imageUrls,
      accessToken,
      fbPageId: conn.fb_page_id,
      igUserId: conn.ig_business_user_id,
      linkedinMemberUrn: conn.linkedin_member_urn,
    });

    const nowIso = new Date().toISOString();
    const { data: lp } = await supabaseAdmin
      .from("lead_posts")
      .insert({
        agent_id: agentId,
        social_account_id: conn.id,
        platform,
        caption,
        hashtags: params.hashtags ?? [],
        status: "published",
        external_post_id: result.externalPostId,
        external_post_url: result.externalPostUrl,
        published_at: nowIso,
      } as never)
      .select("id")
      .maybeSingle();
    await supabaseAdmin
      .from("social_carousels")
      .update({ status: "posted", updated_at: nowIso } as never)
      .eq("id", carouselId);

    return {
      ok: true,
      leadPostId: (lp as { id?: string } | null)?.id ?? null,
      externalPostId: result.externalPostId,
      externalPostUrl: result.externalPostUrl,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Carousel publish failed",
      retryable: true,
    };
  }
}
