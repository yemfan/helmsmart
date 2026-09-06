import Link from "next/link";
import { getCurrentAgentContext, getLeadUsageThisMonth } from "@/lib/dashboardService";
import { supabaseServer } from "@/lib/supabaseServer";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.brokerHome.metaTitle", { ns: "dashboard" }),
    description: t("pages.brokerHome.metaDescription", { ns: "dashboard" }),
    keywords: ["broker", "brokerage", "pipeline"],
    robots: { index: false },
  };
}

/**
 * Brokerage home — leadership-focused entry to pipeline, growth, and marketing.
 * Requires an `agents` row (same as the rest of `/dashboard/*`).
 */
export default async function BrokerDashboardPage() {
  const t = await getServerT();
  const [usage, ctx] = await Promise.all([getLeadUsageThisMonth(), getCurrentAgentContext()]);

  const { data: leads } = await supabaseServer
    .from("contacts")
    .select("id,rating")
    .eq("agent_id", ctx.agentId)
    .limit(500);
  const leadRows = (leads as { id: unknown; rating?: string | null }[]) ?? [];
  const totalLeads = leadRows.length;
  const hotLeads = leadRows.filter((l) => String(l.rating ?? "").toLowerCase() === "hot").length;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("pages.brokerHome.eyebrow", { ns: "dashboard" })}</p>
        <h1 className="ui-page-title text-brand-text">{t("pages.brokerHome.heading", { ns: "dashboard" })}</h1>
        <p className="ui-page-subtitle text-brand-text/80">
          {t("pages.brokerHome.intro", { ns: "dashboard" })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Link
          href="/dashboard/leads"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-5 hover:border-brand-primary/40 hover:shadow-md transition"
        >
          <div className="ui-card-subtitle text-slate-500">{t("pages.brokerHome.teamLeads", { ns: "dashboard" })}</div>
          <div className="mt-2 text-3xl font-extrabold text-brand-text">{totalLeads}</div>
        </Link>
        <Link
          href="/dashboard/leads?filter=hot"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-5 hover:border-brand-accent/40 hover:shadow-md transition"
        >
          <div className="ui-card-subtitle text-slate-500">{t("pages.brokerHome.hotLeads", { ns: "dashboard" })}</div>
          <div className="mt-2 text-3xl font-extrabold text-brand-text">{hotLeads}</div>
        </Link>
        <Link
          href="/dashboard/growth"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-5 hover:border-emerald-300/60 hover:shadow-md transition"
        >
          <div className="ui-card-subtitle text-slate-500">{t("pages.brokerHome.growthSeo", { ns: "dashboard" })}</div>
          <div className="mt-2 text-sm font-semibold text-brand-text">{t("pages.brokerHome.growthSeoCta", { ns: "dashboard" })}</div>
        </Link>
        <Link
          href="/dashboard/marketing"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-5 hover:border-violet-300/60 hover:shadow-md transition"
        >
          <div className="ui-card-subtitle text-slate-500">{t("pages.brokerHome.marketing", { ns: "dashboard" })}</div>
          <div className="mt-2 text-sm font-semibold text-brand-text">{t("pages.brokerHome.marketingCta", { ns: "dashboard" })}</div>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/dashboard/opportunities"
          className="flex flex-col rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm transition hover:border-brand-primary/40 hover:shadow-md"
        >
          <span className="text-sm font-semibold text-brand-text">{t("pages.brokerHome.marketplace", { ns: "dashboard" })}</span>
          <span className="mt-1 text-xs text-brand-text/80">{t("pages.brokerHome.marketplaceHint", { ns: "dashboard" })}</span>
        </Link>
        <Link
          href="/dashboard/overview"
          className="flex flex-col rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm transition hover:border-slate-300 hover:shadow-md"
        >
          <span className="text-sm font-semibold text-brand-text">{t("pages.brokerHome.agentOverview", { ns: "dashboard" })}</span>
          <span className="mt-1 text-xs text-brand-text/80">
            {t("pages.brokerHome.agentOverviewHint", { ns: "dashboard" })}
          </span>
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/60 px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
        {t("pages.brokerHome.plan", { ns: "dashboard" })} <span className="font-semibold text-slate-900 dark:text-slate-100">{String(usage.planType ?? "").toUpperCase()}</span>
        {" · "}
        {t("pages.brokerHome.leadUsage", { ns: "dashboard" })}{" "}
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {usage.used}
          {Number.isFinite(usage.limit) ? ` / ${usage.limit}` : ""}
        </span>
      </div>
    </div>
  );
}
