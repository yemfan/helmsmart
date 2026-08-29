import { NextResponse } from "next/server";
import { computeViralMetrics } from "@repo/growth";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { listReferralCodesForAgent } from "@/lib/growth/referralDb";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const ctx = await getCurrentAgentContext();
    const url = new URL(req.url);
    const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") ?? "30")));
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const codes = await listReferralCodesForAgent(ctx.agentId);
    const codeList = codes.map((c: any) => c.code).filter(Boolean);

    let referralSignups = 0;
    let referralShares = 0;
    let referralConversions = 0;

    if (codeList.length) {
      const { data: ev } = await supabaseServer
        .from("referral_events")
        .select("event_type")
        .in("code", codeList)
        .gte("created_at", since);
      for (const row of ev ?? []) {
        const t = String((row as any).event_type);
        if (t === "signup") referralSignups += 1;
        if (t === "share") referralShares += 1;
        if (t === "conversion") referralConversions += 1;
      }
    }

    // Platform traffic only. Agent marketing hubs write to this same table
    // with agent_id set, so every aggregate here has to say which it wants.
    // Omitting the filter would not error — it would quietly fold every
    // agent's visitors into CloseBoss's own numbers.
    const { data: viewsRows } = await supabaseServer
      .from("traffic_events")
      .select("id,metadata")
      .eq("event_type", "page_view")
      .is("agent_id", null)
      .gte("created_at", since)
      .limit(8000);

    const { data: convRows } = await supabaseServer
      .from("traffic_events")
      .select("id,metadata")
      .eq("event_type", "conversion")
      .is("agent_id", null)
      .gte("created_at", since)
      .limit(8000);

    const { data: toolRows } = await supabaseServer
      .from("traffic_events")
      .select("id,page_path")
      .eq("event_type", "tool_usage")
      .is("agent_id", null)
      .gte("created_at", since)
      .limit(8000);

    const views = viewsRows ?? [];
    const conversions = convRows ?? [];
    const toolUses = toolRows ?? [];
    const totalSignups = conversions.length;
    const conversionRate = views.length ? Number(((conversions.length / views.length) * 100).toFixed(2)) : 0;

    const sharesFromCodes = (codes as any[]).reduce((s, c) => s + Number(c.shares_count ?? 0), 0);
    const uniqueSharers = Math.max(1, codeList.length);

    const viral = computeViralMetrics({
      totalSignups: Math.max(totalSignups, referralSignups),
      referralSignups,
      totalShares: Math.max(referralShares, sharesFromCodes),
      uniqueSharers,
    });

    return NextResponse.json({
      ok: true,
      windowDays: days,
      traffic: {
        pageViews: views.length,
        conversions: conversions.length,
        conversionRate,
        toolUsage: toolUses.length,
      },
      referrals: {
        codes: codes.length,
        eventsSignups: referralSignups,
        eventsShares: referralShares,
        eventsConversions: referralConversions,
      },
      viral,
    });
  } catch (e: any) {
    if (e?.message === "Not authenticated") {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
