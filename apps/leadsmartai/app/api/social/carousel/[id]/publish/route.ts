import { NextResponse } from "next/server";
import { z } from "zod";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { publishCarousel, type CarouselPlatform } from "@/lib/leads-gen/carousel-publish";
import { decryptToken } from "@/lib/leads-gen/token-enc";
import { getSiteUrl } from "@/lib/siteUrl";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/social/carousel/[id]/publish  { platform: "facebook"|"instagram"|"linkedin" }
 *
 * Publishes a stored carousel NOW to one connected platform — the manual trigger
 * used to smoke-test the multi-image publish path (reach Phase 3a) before it's
 * wired into the scheduler. Auth: the dashboard agent context; the carousel's
 * slide images are the public on-the-fly /api/social/carousel/[id]/[slide] URLs.
 */
export const runtime = "nodejs";
// Multi-image publish is several sequential platform calls (+ IG container polls).
export const maxDuration = 60;

const bodySchema = z.object({
  platform: z.enum(["facebook", "instagram", "linkedin"]),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getDashboardAgentContext();
  if (auth.ok === false) return auth.response;
  const agentId = auth.agentId;

  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "platform must be facebook, instagram, or linkedin" },
      { status: 400 },
    );
  }
  const platform = parsed.data.platform as CarouselPlatform;

  // 1. Load the carousel.
  const { data: carRow } = await supabaseAdmin
    .from("social_carousels")
    .select("caption, hashtags, slides")
    .eq("id", id)
    .maybeSingle();
  const carousel = carRow as
    | { caption?: string; hashtags?: string[]; slides?: unknown[] }
    | null;
  if (!carousel || !Array.isArray(carousel.slides) || carousel.slides.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Carousel not found or has fewer than 2 slides." },
      { status: 404 },
    );
  }
  const slideCount = carousel.slides.length;

  // 2. Load the platform connection (facebook/instagram → the Meta row).
  const family = platform === "linkedin" ? "linkedin" : "meta";
  const { data: connRow } = await supabaseAdmin
    .from("social_accounts")
    .select(
      "id, platform, fb_page_id, ig_business_user_id, page_access_token_enc, user_access_token_enc, linkedin_member_urn, status",
    )
    .eq("agent_id", agentId)
    .eq("platform", family)
    .maybeSingle();
  const conn = connRow as {
    id: string;
    fb_page_id: string | null;
    ig_business_user_id: string | null;
    page_access_token_enc: string | null;
    user_access_token_enc: string | null;
    linkedin_member_urn: string | null;
  } | null;
  if (!conn) {
    return NextResponse.json(
      { ok: false, error: `No ${platform} connection for this agent. Connect it first.` },
      { status: 404 },
    );
  }

  // 3. Decrypt the token (LinkedIn uses the user token; Meta uses the page token).
  let accessToken: string;
  try {
    const enc = platform === "linkedin" ? conn.user_access_token_enc : conn.page_access_token_enc;
    if (!enc) throw new Error("missing token");
    accessToken = decryptToken(enc);
  } catch {
    return NextResponse.json(
      { ok: false, error: `Connection token is invalid. Reconnect ${platform} to publish.` },
      { status: 422 },
    );
  }

  // 4. Build the caption (hashtags inlined) + the public slide image URLs.
  const tags =
    Array.isArray(carousel.hashtags) && carousel.hashtags.length
      ? carousel.hashtags.map((h) => `#${String(h).replace(/^#/, "")}`).join(" ")
      : "";
  const caption = [carousel.caption?.trim(), tags].filter(Boolean).join("\n\n");
  const base = getSiteUrl().replace(/\/$/, "");
  const imageUrls = Array.from(
    { length: slideCount },
    (_, k) => `${base}/api/social/carousel/${id}/${k}`,
  );

  // 5. Publish + record.
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
    await supabaseAdmin.from("lead_posts").insert({
      agent_id: agentId,
      social_account_id: conn.id,
      platform,
      caption,
      hashtags: carousel.hashtags ?? [],
      status: "published",
      external_post_id: result.externalPostId,
      external_post_url: result.externalPostUrl,
      published_at: nowIso,
    } as never);
    await supabaseAdmin
      .from("social_carousels")
      .update({ status: "posted", updated_at: nowIso } as never)
      .eq("id", id);

    return NextResponse.json({ ok: true, platform, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Publish failed";
    console.error("[social/carousel/publish]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
