import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadDraftAds, persistAdDrafts, type AdDraft } from "@/lib/social/ads";
import { buildFeatureAd, buildInterestRateAd, buildPhotoAd, buildPromoAd, buildSpotlightAd } from "@/lib/social/adPresets";
import { pickAgentAdPhoto } from "@/lib/social/adPhotos";
import { pickThemeForIndex } from "@/lib/social/renderAd";
import { scheduleAd } from "@/lib/social/scheduleAd";

/**
 * Weekly promo-ad auto-enqueue — the ad sibling of runWeeklyCarousels.
 *
 * Ads are BRAND content, so this runs for agents that OWN brand library content
 * (same axis as carousels). For each such agent with a connected ad-capable
 * account it: tops up the unposted-ad pool from data-driven presets (interest
 * rate + rotating promos, themes rotating for visual variety), picks the oldest
 * draft, and enqueues it via scheduleAd — publishable ('auto' mode) or held for
 * approval otherwise. Best-effort per agent.
 *
 * Market-update ads need a specific metro, so they're generated on demand from
 * the composer rather than here; the weekly auto-batch stays city-agnostic.
 */

const TOPUP_MIN = 2;
const TOPUP_BATCH = 4;
const AD_HASHTAGS = ["realestate", "realtor", "aiforrealestate", "closebossai"];

export type WeeklyAdResult = { brandAgents: number; generated: number; scheduled: number };

/**
 * Build a rotating batch of ad drafts for an agent: interest-rate (data),
 * photo (agent's uploaded lifestyle photos, when any), and promo statements —
 * cycling so the pool stays varied.
 */
async function buildAdBatch(agentStr: string, count: number): Promise<AdDraft[]> {
  const out: AdDraft[] = [];
  for (let i = 0; i < count; i += 1) {
    const theme = pickThemeForIndex(i);
    const slot = i % 5;
    if (slot === 0) {
      const input = await buildInterestRateAd("square", theme);
      out.push({
        input,
        preset: "interest-rate",
        caption: `Mortgage rate check — 30-year fixed at ${input.statValue}. Know your buyer's real budget before you show a single home.`,
        hashtags: ["mortgagerates", "homebuying", ...AD_HASHTAGS],
      });
    } else if (slot === 1) {
      const photo = await pickAgentAdPhoto(agentStr, i);
      if (photo) {
        const input = buildPhotoAd(photo.url, i, "square", theme);
        out.push({
          input,
          preset: "photo",
          caption: input.subhead ? `${input.headline} ${input.subhead}` : input.headline,
          hashtags: AD_HASHTAGS,
        });
        continue;
      }
      // no photos yet → fall through to a promo
      const input = buildPromoAd(i, "square", theme);
      out.push({ input, preset: "promo", caption: input.subhead ?? input.headline, hashtags: AD_HASHTAGS });
    } else if (slot === 2) {
      // Spotlight direct-response ad — uses an uploaded scene photo when available.
      const photo = await pickAgentAdPhoto(agentStr, i);
      const input = buildSpotlightAd(i, "portrait", undefined, photo?.url);
      out.push({
        input,
        preset: "spotlight",
        caption: [input.headline, input.headlineAccent, input.subhead].filter(Boolean).join(" "),
        hashtags: AD_HASHTAGS,
      });
    } else if (slot === 3) {
      // Feature capability poster — self-contained brand content (photo optional).
      const photo = await pickAgentAdPhoto(agentStr, i);
      const input = buildFeatureAd(i, "portrait", undefined, photo?.url);
      out.push({
        input,
        preset: "feature",
        caption: `${input.headline} ${input.headlineAccent} ${input.subhead ?? ""}`.trim(),
        hashtags: AD_HASHTAGS,
      });
    } else {
      const input = buildPromoAd(i, "square", theme);
      out.push({
        input,
        preset: "promo",
        caption: input.subhead ? `${input.headline} ${input.subhead}` : input.headline,
        hashtags: AD_HASHTAGS,
      });
    }
  }
  return out;
}

export async function runWeeklyAds(): Promise<WeeklyAdResult> {
  const { data: brandRows } = await supabaseAdmin
    .from("social_content_library")
    .select("agent_id")
    .eq("category", "brand")
    .not("agent_id", "is", null);
  const brandAgentIds = Array.from(
    new Set(((brandRows as { agent_id: number }[] | null) ?? []).map((r) => r.agent_id)),
  );

  let generated = 0;
  let scheduled = 0;

  for (const agentId of brandAgentIds) {
    try {
      const agentStr = String(agentId);

      const { data: accts } = await supabaseAdmin
        .from("social_accounts")
        .select("platform, fb_page_id, ig_business_user_id, linkedin_member_urn")
        .eq("agent_id", agentStr)
        .in("platform", ["meta", "linkedin"])
        .eq("status", "connected");
      const capable = ((accts as
        | { platform: string; fb_page_id: string | null; ig_business_user_id: string | null; linkedin_member_urn: string | null }[]
        | null) ?? []
      ).some(
        (a) =>
          (a.platform === "meta" && (a.fb_page_id || a.ig_business_user_id)) ||
          (a.platform === "linkedin" && a.linkedin_member_urn),
      );
      if (!capable) continue;

      let drafts = await loadDraftAds(agentStr);
      if (drafts.length < TOPUP_MIN) {
        const batch = await buildAdBatch(agentStr, TOPUP_BATCH);
        if (batch.length > 0) {
          await persistAdDrafts(agentId, batch);
          generated += batch.length;
          drafts = await loadDraftAds(agentStr);
        }
      }
      if (drafts.length === 0) continue;

      const pick = drafts[0];

      const { data: setting } = await supabaseAdmin
        .from("boss_autopilot_settings")
        .select("mode")
        .eq("agent_id", agentStr)
        .eq("assignee", "marketing_assistant")
        .eq("channel", "social")
        .maybeSingle();
      const mode = (setting as { mode?: string } | null)?.mode ?? "ask";
      const queueStatus = mode === "auto" ? "scheduled" : "awaiting_approval";

      const res = await scheduleAd({ agentId: agentStr, adId: pick.id, queueStatus });
      if (res.scheduled > 0) {
        await supabaseAdmin
          .from("social_ads")
          .update({ status: "scheduled", updated_at: new Date().toISOString() } as never)
          .eq("id", pick.id);
        scheduled += res.scheduled;
      }
    } catch (e) {
      console.warn("[ads] weekly enqueue failed for agent", agentId, e instanceof Error ? e.message : e);
    }
  }

  return { brandAgents: brandAgentIds.length, generated, scheduled };
}
