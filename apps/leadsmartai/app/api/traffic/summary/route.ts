import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") ?? "30")));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Platform traffic only. Agent marketing hubs write to this same table
    // with agent_id set, so every aggregate here has to say which it wants.
    // Omitting the filter would not error — it would quietly fold every
    // agent's visitors into CloseBoss's own numbers.
    const { data: viewsRows } = await supabaseServer
      .from("traffic_events")
      .select("id,source,page_path,metadata")
      .eq("event_type", "page_view")
      .is("agent_id", null)
      .gte("created_at", since)
      .limit(5000);

    const { data: convRows } = await supabaseServer
      .from("traffic_events")
      .select("id,source,page_path,metadata")
      .eq("event_type", "conversion")
      .is("agent_id", null)
      .gte("created_at", since)
      .limit(5000);

    const views = viewsRows ?? [];
    const conversions = convRows ?? [];
    const conversionRate = views.length ? Number(((conversions.length / views.length) * 100).toFixed(2)) : 0;

    const bySource: Record<string, { views: number; conversions: number; conversionRate: number }> = {};
    for (const v of views as any[]) {
      const key = String(v.source ?? "unknown");
      bySource[key] = bySource[key] ?? { views: 0, conversions: 0, conversionRate: 0 };
      bySource[key].views += 1;
    }
    for (const c of conversions as any[]) {
      const key = String(c.source ?? "unknown");
      bySource[key] = bySource[key] ?? { views: 0, conversions: 0, conversionRate: 0 };
      bySource[key].conversions += 1;
    }
    for (const key of Object.keys(bySource)) {
      const row = bySource[key];
      row.conversionRate = row.views ? Number(((row.conversions / row.views) * 100).toFixed(2)) : 0;
    }

    const leadQuality = { high: 0, medium: 0, low: 0, unknown: 0 };
    for (const c of conversions as any[]) {
      const q = String(c?.metadata?.lead_quality ?? "unknown").toLowerCase();
      if (q === "high" || q === "medium" || q === "low") leadQuality[q] += 1;
      else leadQuality.unknown += 1;
    }

    return NextResponse.json({
      ok: true,
      windowDays: days,
      totals: {
        views: views.length,
        conversions: conversions.length,
        conversionRate,
      },
      bySource,
      leadQuality,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}

