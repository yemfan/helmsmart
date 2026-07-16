import { NextResponse } from "next/server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The post queue — what's about to go out, and what already did.
 *
 * GET  /api/social/queue
 *   → { ok, pending: QueueItem[], recent: QueueItem[] }
 *   pending = awaiting_approval | scheduled | posting | failed, soonest first.
 *   recent  = the last few posted, newest first (proof it actually published).
 *
 * POST /api/social/queue { action: 'approve_all' }
 *   → clears every awaiting_approval post for this agent in one call. Daily
 *     cadence means ~7 posts a week; approving them one at a time is the kind of
 *     chore that makes people switch the gate off entirely.
 *
 * scheduled_posts is a service-role table (the session client can't read it), so
 * everything here is explicitly scoped with .eq('agent_id', …).
 */

const SELECT =
  "id, platform, caption, image_url, scheduled_for, status, attempt_count, last_error, published_at, social_account_id, review_verdict, review_issues, reviewed_at";

const PENDING_STATUSES = ["awaiting_approval", "scheduled", "posting", "failed"];

export async function GET() {
  try {
    const { agentId } = await getCurrentAgentContext();

    const [pendingRes, recentRes, accountsRes] = await Promise.all([
      supabaseServer
        .from("scheduled_posts")
        .select(SELECT)
        .eq("agent_id", String(agentId))
        .in("status", PENDING_STATUSES)
        .order("scheduled_for", { ascending: true })
        .limit(60),
      supabaseServer
        .from("scheduled_posts")
        .select(SELECT)
        .eq("agent_id", String(agentId))
        .eq("status", "posted")
        .order("published_at", { ascending: false })
        .limit(8),
      supabaseServer
        .from("social_accounts")
        .select("id, platform, fb_page_name, account_display_name")
        .eq("agent_id", String(agentId))
        .eq("status", "connected"),
    ]);

    // Label each queued post with the account it will publish to, so the queue
    // reads "LinkedIn — Michael Ye" rather than a bare uuid.
    const accounts = new Map(
      ((accountsRes.data ?? []) as AccountRow[]).map((a) => [
        a.id,
        a.fb_page_name || a.account_display_name || a.platform,
      ]),
    );
    const decorate = (rows: unknown[]) =>
      (rows as QueueRow[]).map((r) => ({
        ...r,
        accountName: accounts.get(r.social_account_id) ?? null,
      }));

    return NextResponse.json({
      ok: true,
      pending: decorate(pendingRes.data ?? []),
      recent: decorate(recentRes.data ?? []),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const body = (await req.json().catch(() => ({}))) as { action?: unknown };
    if (body.action !== "approve_all") {
      return NextResponse.json(
        { ok: false, error: "action must be 'approve_all'" },
        { status: 400 },
      );
    }

    // Only awaiting_approval → scheduled. Filtering on the source status makes
    // this idempotent and keeps it from touching posted/cancelled rows.
    const { data, error } = await supabaseServer
      .from("scheduled_posts")
      .update({ status: "scheduled", updated_at: new Date().toISOString() })
      .eq("agent_id", String(agentId))
      .eq("status", "awaiting_approval")
      .select("id");
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      approved: Array.isArray(data) ? data.length : 0,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

type AccountRow = {
  id: string;
  platform: string;
  fb_page_name: string | null;
  account_display_name: string | null;
};

type QueueRow = { social_account_id: string };
