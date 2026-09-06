import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import HomeValueSmartLinkCopyShare from "@/components/dashboard/HomeValueSmartLinkCopyShare";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.marketing.metaTitle", { ns: "dashboard" }),
    description: t("pages.marketing.metaDescription", { ns: "dashboard" }),
    keywords: ["marketing", "campaigns", "real estate marketing"],
    robots: { index: false },
  };
}

export default async function MarketingPage() {
  const t = await getServerT();
  const { agentId, userId } = await getCurrentAgentContext();
  const widgetAgentKey = agentId || userId;

  // Follow-up automation status.
  const { count: pendingCount } = await supabaseServer
    .from("lead_sequences")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const { count: sentCount } = await supabaseServer
    .from("lead_sequences")
    .select("id", { count: "exact", head: true })
    .eq("status", "completed");

  const homeValueSmartLink = `/home-value-widget?agentId=${encodeURIComponent(widgetAgentKey)}`;

  // Traffic funnel snapshot (last 30 days)
  const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  // Platform traffic only (`agent_id is null`). Rows with an agent id are
  // visits to that agent's marketing hub; without this filter every agent's
  // hub visitors were folded into the funnel numbers shown here.
  const { count: trafficViews } = await supabaseServer
    .from("traffic_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "page_view")
    .is("agent_id", null)
    .gte("created_at", sinceIso);

  const { count: trafficConversions } = await supabaseServer
    .from("traffic_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "conversion")
    .is("agent_id", null)
    .gte("created_at", sinceIso);

  const conversionRate =
    Number(trafficViews ?? 0) > 0
      ? (((Number(trafficConversions ?? 0) / Number(trafficViews ?? 0)) * 100).toFixed(2) as any)
      : "0.00";

  const { data: sourceRows } = await supabaseServer
    .from("traffic_events")
    .select("source,event_type")
    .is("agent_id", null)
    .gte("created_at", sinceIso)
    .limit(2000);

  const bySource = new Map<string, { views: number; conversions: number }>();
  (sourceRows ?? []).forEach((row: any) => {
    const k = String(row?.source ?? "unknown");
    const rec = bySource.get(k) ?? { views: 0, conversions: 0 };
    if (row?.event_type === "page_view") rec.views += 1;
    if (row?.event_type === "conversion") rec.conversions += 1;
    bySource.set(k, rec);
  });
  const topSources = Array.from(bySource.entries())
    .map(([source, v]) => ({
      source,
      views: v.views,
      conversions: v.conversions,
      conversionRate: v.views ? Number(((v.conversions / v.views) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="ui-page-title text-brand-text">{t("pages.marketing.heading", { ns: "dashboard" })}</h1>
        <p className="ui-page-subtitle text-brand-text/80">{t("pages.marketing.shareLinks", { ns: "dashboard" })}</p>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-5 space-y-5">
        <div className="space-y-2">
          <div className="ui-card-title text-brand-text">{t("pages.marketing.shareableLinks", { ns: "dashboard" })}</div>
          <div className="text-xs text-brand-text/80">{t("pages.marketing.shareableIntro", { ns: "dashboard" })}</div>

          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t("pages.marketing.homeValueLink", { ns: "dashboard" })}</div>
              <HomeValueSmartLinkCopyShare showUrl relativePath={homeValueSmartLink} />
              <div className="mt-2">
                <Link
                  href="/dashboard/settings"
                  className="text-sm font-semibold px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
                >{t("pages.marketing.updateBranding", { ns: "dashboard" })}</Link>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t("pages.marketing.smartPropertyLinks", { ns: "dashboard" })}</div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                {t("pages.marketing.smartPropertyLinksHelp", { ns: "dashboard" })}
              </div>
              <div className="mt-2">
                <Link
                  href="/dashboard/send"
                  className="inline-flex items-center justify-center rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-[#005ca8]"
                >{t("pages.marketing.openSmartLinks", { ns: "dashboard" })}</Link>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-700 pt-5 space-y-3">
          <div className="ui-card-title text-slate-900 dark:text-slate-100">{t("pages.marketing.marketingPlans", { ns: "dashboard" })}</div>
          <p className="text-xs text-slate-600 dark:text-slate-400">{t("pages.marketing.plansBlurb", { ns: "dashboard" })}</p>
          <Link
            href="/dashboard/marketing/plans"
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >{t("pages.marketing.openPlans", { ns: "dashboard" })}</Link>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-700 pt-5 space-y-3">
          <div className="ui-card-title text-slate-900 dark:text-slate-100">{t("pages.marketing.followUpAutomation", { ns: "dashboard" })}</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
              <div className="ui-card-subtitle text-slate-600 dark:text-slate-400">{t("pages.marketing.pending", { ns: "dashboard" })}</div>
              <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">{pendingCount ?? 0}</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
              <div className="ui-card-subtitle text-slate-600 dark:text-slate-400">{t("pages.marketing.sent", { ns: "dashboard" })}</div>
              <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">{sentCount ?? 0}</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
              <div className="ui-card-subtitle text-slate-600 dark:text-slate-400">{t("pages.marketing.status", { ns: "dashboard" })}</div>
              <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">{t("pages.marketing.autoSend", { ns: "dashboard" })}</div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-700 pt-5 space-y-3">
          <div className="ui-card-title text-slate-900 dark:text-slate-100">{t("pages.marketing.traffic", { ns: "dashboard" })}</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
              <div className="ui-card-subtitle text-slate-600 dark:text-slate-400">{t("pages.marketing.pageViews", { ns: "dashboard" })}</div>
              <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">{trafficViews ?? 0}</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
              <div className="ui-card-subtitle text-slate-600 dark:text-slate-400">{t("pages.marketing.conversions", { ns: "dashboard" })}</div>
              <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">{trafficConversions ?? 0}</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
              <div className="ui-card-subtitle text-slate-600 dark:text-slate-400">{t("pages.marketing.conversionRate", { ns: "dashboard" })}</div>
              <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">{conversionRate}%</div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">{t("pages.marketing.topSources", { ns: "dashboard" })}</div>
            {topSources.length ? (
              <div className="space-y-1">
                {topSources.map((s) => (
                  <div key={s.source} className="text-xs text-slate-700 dark:text-slate-300 flex items-center justify-between gap-2">
                    <span className="font-medium">{s.source}</span>
                    <span className="text-slate-500">
                      {s.conversions}/{s.views} ({s.conversionRate}%)
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500">{t("pages.marketing.noTraffic", { ns: "dashboard" })}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

