import { NextResponse } from "next/server";
import { z } from "zod";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Choose which newly-granted Facebook Pages to actually connect.
 *
 * Facebook's Page grant is cumulative — the token carries every Page ever
 * granted to this app, so a connect that returns five Pages does not mean the
 * agent wants five Pages. The callback parks new ones as "awaiting_selection";
 * this is where that choice is recorded.
 *
 * GET  — the Pages waiting on a decision.
 * POST — { keep: string[] } — the listed ones become connected, the rest are
 *        deleted along with their tokens. An empty list is a valid answer and
 *        means "none of these", not "you forgot to choose".
 */

const AWAITING = "awaiting_selection";

const bodySchema = z.object({
  keep: z.array(z.string().uuid()),
});

const SELECT_COLS =
  "id, fb_page_id, fb_page_name, account_picture_url, ig_business_username, connected_at";

export async function GET() {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    const { data, error } = await supabaseAdmin
      .from("social_accounts")
      .select(SELECT_COLS)
      .eq("agent_id", auth.agentId as never)
      .eq("platform", "meta" as never)
      .eq("status", AWAITING as never)
      .order("connected_at", { ascending: true });
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, pages: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }
    const keep = [...new Set(parsed.data.keep)];

    // Scope every id to THIS agent's awaiting rows before acting on it. Without
    // this, a crafted id could flip someone else's connection to connected.
    const { data: mine, error: readErr } = await supabaseAdmin
      .from("social_accounts")
      .select("id")
      .eq("agent_id", auth.agentId as never)
      .eq("platform", "meta" as never)
      .eq("status", AWAITING as never);
    if (readErr) throw new Error(readErr.message);

    const awaitingIds = ((mine as Array<{ id: string }> | null) ?? []).map((r) => r.id);
    const toConnect = keep.filter((id) => awaitingIds.includes(id));
    const toDrop = awaitingIds.filter((id) => !toConnect.includes(id));

    const nowIso = new Date().toISOString();

    if (toConnect.length) {
      const { error } = await supabaseAdmin
        .from("social_accounts")
        .update({ status: "connected", updated_at: nowIso } as never)
        .in("id", toConnect as never);
      if (error) throw new Error(error.message);
    }

    if (toDrop.length) {
      // Delete rather than mark: the row holds encrypted page and user tokens,
      // and a Page the agent declined has no business keeping them.
      const { error } = await supabaseAdmin
        .from("social_accounts")
        .delete()
        .in("id", toDrop as never);
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ ok: true, connected: toConnect.length, discarded: toDrop.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("POST /api/leads-gen/connect/meta/select:", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
