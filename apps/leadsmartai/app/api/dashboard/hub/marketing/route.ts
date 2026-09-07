import { NextResponse } from "next/server";
import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { loadGaBlock } from "@/lib/leads-gen/google-analytics";
import { sourceFunnel, summariseAds, summariseSocial } from "@/lib/marketing-hub/marketingMetrics";
import { gscSiteFor, hubPagePrefixes, hubSearchSummary } from "@/lib/marketing-hub/searchConsole";
import { getSiteUrl } from "@/lib/siteUrl";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/hub/marketing?days=30
 *
 * Everything the agent's marketing produced, in one answer: social posts by
 * platform (from the metrics the hourly cron pulls), ad campaigns (from Meta
 * insights), hub traffic by source, Google Search for the hub's pages (from
 * the platform's daily Search Console import), and Google Analytics when
 * the agent has connected it (their property, read for them). Each block says when its numbers were last refreshed and, when a
 * platform cannot be measured, why — so an empty column is never mistaken
 * for a quiet one.
 *
 * Every read is filtered on the caller's agent id.
 */
export async function GET(req: Request) {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;
    const agentId = auth.agentId;

    const url = new URL(req.url);
    const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days")) || 30));
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const sinceDate = since.slice(0, 10);

    const { data: agentRow } = await supabaseAdmin.from("agents").select("username").eq("id", agentId as never).maybeSingle();
    const username = String((agentRow as { username?: string | null } | null)?.username ?? "").trim();
    const origin = getSiteUrl();
    const gscSite = username ? gscSiteFor(origin) : null;
    const prefixes = hubPagePrefixes(origin, username);
    // Both spellings of "@"; the pure summary narrows to exactly this hub.
    const prefixFilter = prefixes.map((x) => `page.ilike.${x}%`).join(",");
    const gscCols = "page, date, clicks, impressions, position";

    const [posts, ads, traffic, tracking, accounts, gscPages, gscQueries] = await Promise.all([
      supabaseAdmin
        .from("lead_posts")
        .select("platform, status, metrics, metrics_refreshed_at, published_at, external_post_url, caption")
        .eq("agent_id", agentId as never)
        .eq("status", "published")
        .gte("published_at", since)
        .order("published_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("lead_ad_campaigns")
        .select("id, name, status, objective, metrics, metrics_refreshed_at, leads_received_count, daily_budget_cents, launched_at")
        .eq("agent_id", agentId as never)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("traffic_events")
        .select("event_type, source")
        .eq("agent_id", agentId as never)
        .in("event_type", ["page_view", "conversion"])
        .gte("created_at", since)
        .limit(20000),
      supabaseAdmin.from("agent_tracking_config").select("ga_measurement_id, meta_pixel_id").eq("agent_id", agentId as never).maybeSingle(),
      supabaseAdmin
        .from("social_accounts")
        .select("platform, status, scopes")
        .eq("agent_id", agentId as never),
      gscSite
        ? supabaseAdmin.from("gsc_page_metrics").select(gscCols).eq("site", gscSite).gte("date", sinceDate).or(prefixFilter).limit(5000)
        : Promise.resolve({ data: null }),
      gscSite
        ? supabaseAdmin.from("gsc_query_metrics").select(`query, ${gscCols}`).eq("site", gscSite).gte("date", sinceDate).or(prefixFilter).limit(5000)
        : Promise.resolve({ data: null }),
    ]);

    // Google Analytics is read after the rest: it may go to Google.
    const analytics = await loadGaBlock(agentId, days, username ? `/@${username}` : null);

    const connected = ((accounts.data as { platform: string; status: string; scopes: string[] | null }[] | null) ?? [])
      .filter((a) => a.status === "connected" && a.platform !== "google")
      .map((a) => ({ platform: String(a.platform).toLowerCase(), scopes: a.scopes ?? [] }));
    const metaScopes = new Set(connected.filter((a) => a.platform === "facebook" || a.platform === "meta").flatMap((a) => a.scopes));

    const cfg = (tracking.data ?? {}) as { ga_measurement_id?: string | null; meta_pixel_id?: string | null };

    return NextResponse.json({
      ok: true,
      days,
      social: summariseSocial((posts.data as Record<string, unknown>[] | null) ?? []),
      ads: summariseAds((ads.data as Record<string, unknown>[] | null) ?? []),
      sources: sourceFunnel((traffic.data as Record<string, unknown>[] | null) ?? []),
      /** Hub pages in Google Search, from the daily Search Console import; null = Google has not shown the hub. */
      search: hubSearchSummary({
        origin,
        username,
        pageRows: (gscPages.data as Record<string, unknown>[] | null) ?? [],
        queryRows: (gscQueries.data as Record<string, unknown>[] | null) ?? [],
      }),
      connections: {
        platforms: connected.map((a) => a.platform),
        /** Meta insight permissions the app holds for this agent, so the UI can say what to reconnect for. */
        metaInsights: {
          pageInsights: metaScopes.has("read_insights"),
          instagramInsights: metaScopes.has("instagram_manage_insights"),
          ads: metaScopes.has("ads_read"),
        },
      },
      google: {
        /** The agent's GA4 tag on the hub: their property receives the data; we do not read it. */
        ga4TagConfigured: Boolean(cfg.ga_measurement_id),
        metaPixelConfigured: Boolean(cfg.meta_pixel_id),
        analytics,
        adsConnected: false,
        searchConsoleConnected: false,
      },
    });
  } catch (e) {
    console.error("[hub.marketing] threw:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
}
