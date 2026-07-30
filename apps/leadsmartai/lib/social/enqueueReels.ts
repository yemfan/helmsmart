import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  generateCarouselBatch,
  carouselClaimViolation,
} from "@/lib/social/generateCarousel";
import {
  getReel,
  loadDraftReels,
  loadNextDraftReel,
  listRenderingReels,
  markReelRendered,
  markReelRendering,
  markReelStatus,
  persistReelDrafts,
  type ReelDraft,
} from "@/lib/social/reels";
import { queueStatusForPost } from "@/lib/social/queueGate";
import {
  getReelRenderStatus,
  reelConfigured,
  triggerReelRender,
} from "@/lib/social/renderReel";
import { scheduleReel } from "@/lib/social/scheduleReel";

/**
 * Reel orchestration — the video sibling of runWeeklyCarousels/runWeeklyAds,
 * plus a render-tick because reels render ASYNC on Remotion Lambda.
 *
 *   runWeeklyReels()    — generate 1 reel draft per brand agent that has none
 *                         waiting (reels are expensive to render, so we keep the
 *                         pool tiny — one in flight at a time).
 *   runReelRenderTick() — (a) poll rendering reels → mark rendered/failed, and
 *                         schedule finished ones per the agent's social mode;
 *                         (b) trigger the next draft render, GLOBALLY serialized
 *                         (only when nothing is rendering) because a fresh AWS
 *                         account's Lambda concurrency quota is ~10 and one reel
 *                         already fans out to ~5 lambdas.
 */

const REEL_HASHTAGS = ["realestate", "realtor", "aiforrealestate", "closebossai"];

export type WeeklyReelResult = { brandAgents: number; generated: number };
export type ReelTickResult = {
  polled: number;
  rendered: number;
  failed: number;
  scheduled: number;
  triggered: number;
};

/** Agent's social autopilot mode ('auto' publishes; otherwise hold for review). */
async function socialMode(agentStr: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("boss_autopilot_settings")
    .select("mode")
    .eq("agent_id", agentStr)
    .eq("assignee", "marketing_assistant")
    .eq("channel", "social")
    .maybeSingle();
  return (data as { mode?: string } | null)?.mode ?? "ask";
}

/** True when the agent has a connected Facebook/Instagram/LinkedIn account. */
async function hasVideoCapableAccount(agentStr: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("social_accounts")
    .select("platform, fb_page_id, ig_business_user_id, linkedin_member_urn")
    .eq("agent_id", agentStr)
    .in("platform", ["meta", "linkedin"])
    .eq("status", "connected");
  return ((data as
    | { platform: string; fb_page_id: string | null; ig_business_user_id: string | null; linkedin_member_urn: string | null }[]
    | null) ?? []
  ).some(
    (a) =>
      (a.platform === "meta" && (a.fb_page_id || a.ig_business_user_id)) ||
      (a.platform === "linkedin" && a.linkedin_member_urn),
  );
}

export async function runWeeklyReels(): Promise<WeeklyReelResult> {
  // Reels need the Lambda render env; skip cleanly when not configured.
  if (!reelConfigured()) return { brandAgents: 0, generated: 0 };

  const { data: brandRows } = await supabaseAdmin
    .from("social_content_library")
    .select("agent_id")
    .eq("category", "brand")
    .not("agent_id", "is", null);
  const brandAgentIds = Array.from(
    new Set(((brandRows as { agent_id: number }[] | null) ?? []).map((r) => r.agent_id)),
  );

  let generated = 0;

  for (const agentId of brandAgentIds) {
    try {
      const agentStr = String(agentId);
      if (!(await hasVideoCapableAccount(agentStr))) continue;

      // One reel in flight at a time per agent: skip if a draft is already waiting.
      const drafts = await loadDraftReels(agentStr);
      if (drafts.length > 0) continue;

      // Reuse the brand carousel generator — its slides ({heading, body}) are
      // exactly a reel's slides. Generate one, claim-screen it.
      const batch = await generateCarouselBatch(1);
      const clean = batch.filter((d) => !carouselClaimViolation(d));
      if (clean.length === 0) continue;

      const reelDrafts: ReelDraft[] = clean.slice(0, 1).map((d) => ({
        slides: d.slides,
        caption: d.caption,
        hashtags: d.hashtags?.length ? d.hashtags : REEL_HASHTAGS,
      }));
      const ids = await persistReelDrafts(agentId, reelDrafts);
      generated += ids.length;
    } catch (e) {
      console.warn("[reels] weekly generate failed for agent", agentId, e instanceof Error ? e.message : e);
    }
  }

  return { brandAgents: brandAgentIds.length, generated };
}

export async function runReelRenderTick(): Promise<ReelTickResult> {
  if (!reelConfigured()) {
    return { polled: 0, rendered: 0, failed: 0, scheduled: 0, triggered: 0 };
  }

  // 1. Poll everything currently rendering.
  const rendering = await listRenderingReels();
  let rendered = 0;
  let failed = 0;
  let scheduled = 0;

  for (const r of rendering) {
    try {
      const status = await getReelRenderStatus(r.render_id, r.render_bucket);
      if (!status.done) continue;

      if ("error" in status) {
        await markReelStatus(r.id, "failed", status.error);
        failed += 1;
        continue;
      }

      // Rendered — persist the public MP4, then schedule per the agent's mode.
      await markReelRendered(r.id, status.url);
      rendered += 1;

      const agentStr = r.agent_id != null ? String(r.agent_id) : null;
      if (agentStr) {
        // Reels are AI-written → 'assisted' claim-checks the caption (clean
        // publishes, flagged holds); 'auto' publishes unchecked.
        const reel = await getReel(r.id);
        const queueStatus = await queueStatusForPost(await socialMode(agentStr), reel?.caption ?? "", {
          aiGenerated: true,
        });
        const res = await scheduleReel({ agentId: agentStr, reelId: r.id, queueStatus });
        if (res.scheduled > 0) {
          await markReelStatus(r.id, "scheduled");
          scheduled += res.scheduled;
        }
      }
    } catch (e) {
      console.warn("[reels] poll failed for reel", r.id, e instanceof Error ? e.message : e);
    }
  }

  // 2. Trigger the next draft — only when NOTHING is left rendering. A reel fans
  //    out to ~5 lambdas; a fresh AWS account's concurrency quota is ~10, so we
  //    keep exactly one reel rendering at a time globally.
  const stillRendering = rendering.length - rendered - failed;
  let triggered = 0;
  if (stillRendering <= 0) {
    const next = await loadNextDraftReel();
    if (next && next.slides.length > 0) {
      try {
        const res = await triggerReelRender(next.slides);
        if (res) {
          await markReelRendering(next.id, res.renderId, res.bucketName);
          triggered += 1;
        }
      } catch (e) {
        await markReelStatus(next.id, "failed", e instanceof Error ? e.message : "Render trigger failed.");
        console.warn("[reels] trigger failed for reel", next.id, e instanceof Error ? e.message : e);
      }
    }
  }

  return { polled: rendering.length, rendered, failed, scheduled, triggered };
}
