import { NextResponse } from "next/server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

/**
 * POST /api/social/queue/[id]
 *   { action: 'approve' }                      → awaiting_approval → scheduled
 *   { action: 'cancel' }                       → awaiting_approval|scheduled|failed → cancelled
 *   { action: 'reschedule', scheduledFor: ISO }→ move an unpublished post
 *
 * Every write is filtered on BOTH agent_id and the expected source status. That
 * does two jobs at once: it scopes the row to its owner, and it makes each
 * action a no-op against a post that has already moved on — so approving a post
 * the cron grabbed a second ago (status 'posting') changes nothing rather than
 * resurrecting it. A 409 tells the UI to re-sync instead of lying about success.
 *
 * Approving a slot that's already passed is allowed and publishes on the next
 * cron tick (the claim query is `scheduled_for <= now`), which is what someone
 * approving Monday's post on Tuesday actually wants.
 */

const RESCHEDULABLE = ["awaiting_approval", "scheduled", "failed"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown;
      scheduledFor?: unknown;
    };

    const nowIso = new Date().toISOString();

    if (body.action === "approve") {
      const { data, error } = await supabaseServer
        .from("scheduled_posts")
        .update({ status: "scheduled", updated_at: nowIso })
        .eq("id", id)
        .eq("agent_id", String(agentId))
        .eq("status", "awaiting_approval")
        .select("id, scheduled_for");
      if (error) throw error;
      if (!data?.length) return conflict("That post is no longer awaiting approval.");
      return NextResponse.json({ ok: true, status: "scheduled", post: data[0] });
    }

    if (body.action === "cancel") {
      const { data, error } = await supabaseServer
        .from("scheduled_posts")
        .update({ status: "cancelled", updated_at: nowIso })
        .eq("id", id)
        .eq("agent_id", String(agentId))
        .in("status", ["awaiting_approval", "scheduled", "failed"])
        .select("id");
      if (error) throw error;
      if (!data?.length) return conflict("That post can no longer be cancelled.");
      return NextResponse.json({ ok: true, status: "cancelled" });
    }

    if (body.action === "reschedule") {
      if (typeof body.scheduledFor !== "string" || !body.scheduledFor.trim()) {
        return NextResponse.json(
          { ok: false, error: "scheduledFor is required." },
          { status: 400 },
        );
      }
      const ms = Date.parse(body.scheduledFor);
      if (Number.isNaN(ms)) {
        return NextResponse.json(
          { ok: false, error: "Invalid scheduledFor timestamp." },
          { status: 400 },
        );
      }
      const { data, error } = await supabaseServer
        .from("scheduled_posts")
        .update({ scheduled_for: new Date(ms).toISOString(), updated_at: nowIso })
        .eq("id", id)
        .eq("agent_id", String(agentId))
        .in("status", RESCHEDULABLE)
        .select("id, scheduled_for, status");
      if (error) throw error;
      if (!data?.length) return conflict("That post can no longer be rescheduled.");
      return NextResponse.json({ ok: true, post: data[0] });
    }

    return NextResponse.json(
      { ok: false, error: "action must be 'approve', 'cancel' or 'reschedule'" },
      { status: 400 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

function conflict(error: string) {
  return NextResponse.json({ ok: false, error, resync: true }, { status: 409 });
}
