import "server-only";

import { persistCarouselDrafts } from "@/lib/social/carousels";
import { carouselClaimViolation, generateCarouselBatch } from "@/lib/social/generateCarousel";
import { scheduleCarousel } from "@/lib/social/scheduleCarousel";
import { queueStatusForPost } from "@/lib/social/queueGate";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Weekly carousel auto-enqueue (reach Phase 3a — the last mile).
 *
 * Carousels are BRAND content (brand-voice marketing to realtors, like
 * generateBrandPosts), so this runs for the agents that OWN brand library
 * content — same ownership axis the single-post brand flow uses, no hardcoded
 * id. For each such agent with a connected carousel-capable account it:
 *   1. tops up the owned unposted-carousel pool (generate + claim-screen +
 *      persist) when it runs low,
 *   2. picks the oldest unposted carousel,
 *   3. enqueues it via scheduleCarousel — queueStatus follows the agent's
 *      autopilot mode ('auto' → publishable, anything else → held for approval),
 *   4. marks it 'scheduled' so it isn't picked again.
 *
 * Best-effort per agent: one agent's failure never aborts the batch.
 */

const TOPUP_MIN = 2; // keep at least this many unposted carousels on hand
const TOPUP_BATCH = 4;

export type WeeklyCarouselResult = {
  brandAgents: number;
  generated: number;
  scheduled: number;
};

export async function runWeeklyCarousels(): Promise<WeeklyCarouselResult> {
  // Brand agents = owners of brand-category library content.
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

      // Must have a connected carousel-capable account (else nothing to post to).
      const { data: accts } = await supabaseAdmin
        .from("social_accounts")
        .select("platform, fb_page_id, ig_business_user_id, linkedin_member_urn")
        .eq("agent_id", agentStr)
        .in("platform", ["meta", "linkedin"])
        .eq("status", "connected");
      const capable = ((accts as
        | {
            platform: string;
            fb_page_id: string | null;
            ig_business_user_id: string | null;
            linkedin_member_urn: string | null;
          }[]
        | null) ?? []
      ).some(
        (a) =>
          (a.platform === "meta" && (a.fb_page_id || a.ig_business_user_id)) ||
          (a.platform === "linkedin" && a.linkedin_member_urn),
      );
      if (!capable) continue;

      // Top up the unposted pool when low.
      let drafts = await loadDraftCarousels(agentStr);
      if (drafts.length < TOPUP_MIN) {
        const existingTitles = await loadAllCarouselTitles(agentStr);
        const batch = (await generateCarouselBatch(TOPUP_BATCH, existingTitles)).filter(
          (d) => !carouselClaimViolation(d),
        );
        if (batch.length > 0) {
          await persistCarouselDrafts(agentId, batch);
          generated += batch.length;
          drafts = await loadDraftCarousels(agentStr);
        }
      }
      if (drafts.length === 0) continue;

      const pick = drafts[0];

      // Autopilot mode → publishable vs held.
      const { data: setting } = await supabaseAdmin
        .from("boss_autopilot_settings")
        .select("mode")
        .eq("agent_id", agentStr)
        .eq("assignee", "marketing_assistant")
        .eq("channel", "social")
        .maybeSingle();
      const mode = (setting as { mode?: string } | null)?.mode ?? "ask";
      // Carousels are AI-written → in 'assisted' the caption is claim-checked
      // (clean publishes, flagged holds); 'auto' publishes unchecked.
      const queueStatus = await queueStatusForPost(mode, pick.caption, { aiGenerated: true });

      const res = await scheduleCarousel({ agentId: agentStr, carouselId: pick.id, queueStatus });
      if (res.scheduled > 0) {
        await supabaseAdmin
          .from("social_carousels")
          .update({ status: "scheduled", updated_at: new Date().toISOString() } as never)
          .eq("id", pick.id);
        scheduled += res.scheduled;
      }
    } catch (e) {
      console.warn(
        "[carousels] weekly enqueue failed for agent",
        agentId,
        e instanceof Error ? e.message : e,
      );
    }
  }

  return { brandAgents: brandAgentIds.length, generated, scheduled };
}

async function loadDraftCarousels(
  agentStr: string,
): Promise<{ id: string; title: string; caption: string }[]> {
  const { data } = await supabaseAdmin
    .from("social_carousels")
    .select("id, title, caption")
    .eq("agent_id", agentStr)
    .eq("status", "draft")
    .order("created_at", { ascending: true });
  return (data as { id: string; title: string; caption: string }[] | null) ?? [];
}

async function loadAllCarouselTitles(agentStr: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("social_carousels")
    .select("title")
    .eq("agent_id", agentStr);
  return ((data as { title: string }[] | null) ?? []).map((r) => r.title);
}
