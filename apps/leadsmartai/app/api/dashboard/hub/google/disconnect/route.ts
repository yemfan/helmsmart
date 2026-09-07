import { NextResponse } from "next/server";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * POST /api/dashboard/hub/google/disconnect
 * Removes the agent's Google Analytics connection (tokens and cached
 * report with it). The agent's GA4 tag on the hub is untouched: that is
 * Settings, and it keeps sending. Mirrors the YouTube disconnect route.
 */
export async function POST() {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    const { error, count } = await supabaseAdmin
      .from("social_accounts")
      .delete({ count: "exact" })
      .eq("agent_id", auth.agentId)
      .eq("platform", "google");
    if (error) throw error;

    return NextResponse.json({ ok: true, removed: count ?? 0 });
  } catch (e) {
    console.error("[hub/google/disconnect]", e);
    return NextResponse.json({ ok: false, error: "disconnect_failed" }, { status: 500 });
  }
}
