import { NextResponse } from "next/server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import {
  getConnectedSocialAccounts,
  scheduleRecommendation,
  type ConnectedSocialAccount,
  type SocialRecommendation,
} from "@/lib/social/recommend";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

/**
 * POST /api/social/recommendation/[id]/schedule
 *
 * The GLUE: takes an approved social-post recommendation and QUEUES it into the
 * existing publish engine (scheduled_posts → /api/cron/publish-scheduled →
 * publishPost). Agent-authed via getCurrentAgentContext.
 *
 * Body (all optional):
 *   { accountId?: string }  — schedule to just this connected account
 *   { platform?: 'meta'|'linkedin' } — schedule to the agent's connected
 *                             accounts of this platform
 *   { scheduledFor?: string } — ISO time to publish; defaults to now()
 * With no body, schedules to ALL connected accounts (one scheduled_posts row
 * each) — the documented MVP default.
 *
 * If the agent has NO connected account → { ok:false, needsConnection:true }
 * (400) so the UI can prompt "Connect an account".
 *
 * The rec's branded-card image_url (a public URL in the social-images bucket)
 * rides along on each scheduled_posts row; publishPost publishes it directly
 * without touching media_library.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;

    const body = (await req.json().catch(() => ({}))) as {
      accountId?: unknown;
      platform?: unknown;
      scheduledFor?: unknown;
    };
    const accountId =
      typeof body.accountId === "string" && body.accountId.trim()
        ? body.accountId.trim()
        : null;
    const platformFilter =
      typeof body.platform === "string" && body.platform.trim()
        ? body.platform.trim()
        : null;

    // Optional future-scheduled time; must parse. Default = now (publish ASAP on
    // the next cron tick).
    let scheduledForIso: string | undefined;
    if (typeof body.scheduledFor === "string" && body.scheduledFor.trim()) {
      const ms = Date.parse(body.scheduledFor);
      if (Number.isNaN(ms)) {
        return NextResponse.json(
          { ok: false, error: "Invalid scheduledFor timestamp." },
          { status: 400 },
        );
      }
      scheduledForIso = new Date(ms).toISOString();
    }

    // 1. Load the recommendation, scoped to the agent.
    const { data: recRow, error: recErr } = await supabaseServer
      .from("social_post_recommendations")
      .select("id, caption, hashtags, image_url, status")
      .eq("id", id)
      .eq("agent_id", String(agentId))
      .maybeSingle();
    if (recErr) throw recErr;
    if (!recRow) {
      return NextResponse.json(
        { ok: false, error: "Recommendation not found" },
        { status: 404 },
      );
    }
    const rec = recRow as Pick<
      SocialRecommendation,
      "id" | "caption" | "hashtags" | "image_url" | "status"
    >;

    // 2. Connected accounts.
    const allAccounts = await getConnectedSocialAccounts(String(agentId));
    if (allAccounts.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          needsConnection: true,
          error: "Connect a social account to publish.",
        },
        { status: 400 },
      );
    }

    // 3. Resolve target account(s): accountId > platform filter > all connected.
    let targets: ConnectedSocialAccount[] = allAccounts;
    if (accountId) {
      targets = allAccounts.filter((a) => a.id === accountId);
      if (targets.length === 0) {
        return NextResponse.json(
          { ok: false, error: "That connected account was not found." },
          { status: 404 },
        );
      }
    } else if (platformFilter) {
      targets = allAccounts.filter((a) => a.platform === platformFilter);
      if (targets.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            needsConnection: true,
            error: `No connected ${platformFilter} account to publish to.`,
          },
          { status: 400 },
        );
      }
    }

    // 4. Queue it — one scheduled_posts row per target, image_url carried,
    //    then mark the rec 'scheduled'.
    const { scheduledCount, scheduledFor } = await scheduleRecommendation(
      String(agentId),
      rec,
      targets,
      scheduledForIso,
    );

    if (scheduledCount === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            rec.status === "scheduled"
              ? "This post is already scheduled."
              : "Could not schedule the post.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, scheduledCount, scheduledFor });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
