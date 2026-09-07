"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import type { GaBlock } from "@/lib/leads-gen/google-analytics";
import type { AdsSummary, SocialSummary, SourceFunnelRow } from "@/lib/marketing-hub/marketingMetrics";
import GoogleAnalyticsPanel from "./GoogleAnalyticsPanel";
import { Card, Empty } from "./ui";

/**
 * The agent's marketing numbers across platforms, on the hub's Analytics
 * section: social posts by platform, Meta ad campaigns, hub visitors by
 * source, and Google Analytics read from the agent's own property.
 *
 * A dash is a dash. Where a platform cannot report a figure, the cell says
 * so in words rather than showing a zero that would read as "nobody saw
 * it". Where Facebook has not granted insight permissions, the table says
 * to reconnect — that is the fix, and the agent can do it themselves.
 */

type Payload = {
  days: number;
  social: SocialSummary;
  ads: AdsSummary;
  sources: SourceFunnelRow[];
  connections: { platforms: string[]; metaInsights: { pageInsights: boolean; instagramInsights: boolean; ads: boolean } };
  google: { ga4TagConfigured: boolean; metaPixelConfigured: boolean; analytics: GaBlock };
};

const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  pinterest: "Pinterest",
  threads: "Threads",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X",
};

function n(v: number | null | undefined, locale: string): string {
  return v == null ? "—" : v.toLocaleString(locale);
}

function money(cents: number | null | undefined, locale: string): string {
  return cents == null ? "—" : (cents / 100).toLocaleString(locale, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function pct(v: number | null): string {
  return v == null ? "—" : `${(v * 100).toFixed(1)}%`;
}

export default function MarketingPerformance({ days }: { days: number }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.hubEditor.marketing.${s}`, vars);
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  // Bumped when the Google connection changes, so the page re-reads without a reload.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    fetch(`/api/dashboard/hub/marketing?days=${days}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j?.ok) return setFailed(true);
        setData(j as Payload);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [days, tick]);

  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : null);
  const th = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500";
  const td = "px-3 py-2 text-sm text-slate-800 tabular-nums";

  if (failed) {
    return (
      <Card title={k("title")} description={k("desc")}>
        <Empty>{t("pages.hubEditor.loadFailed")}</Empty>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card title={k("title")} description={k("desc")}>
        <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-busy />
      </Card>
    );
  }

  const needsReconnect = data.connections.platforms.some((p) => p === "meta" || p === "facebook") && !data.connections.metaInsights.pageInsights;

  return (
    <Card title={k("title")} description={k("desc")}>
      {/* ── Social ── */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{k("social")}</h3>
          <Link href="/dashboard/leads/generate/posts" className="text-xs font-medium text-[#0072ce] hover:underline">
            {k("openPosts")}
          </Link>
        </div>
        {needsReconnect ? <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">{k("needsReconnect")}</p> : null}
        {data.social.platforms.length === 0 ? (
          <Empty>{k("noPosts")}</Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full min-w-[40rem]">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className={th}>{k("platform")}</th>
                  <th className={th}>{k("posts")}</th>
                  <th className={th}>{k("impressions")}</th>
                  <th className={th}>{k("reach")}</th>
                  <th className={th}>{k("clicks")}</th>
                  <th className={th}>{k("engagement")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.social.platforms.map((p) => (
                  <tr key={p.platform}>
                    <td className={td}>
                      <span className="font-medium">{PLATFORM_LABEL[p.platform] ?? p.platform}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        {p.metrics
                          ? `${k("measured", { measured: p.measured, posts: p.posts })}${p.lastRefreshedAt ? ` · ${k("refreshedAt", { when: when(p.lastRefreshedAt) })}` : ""}`
                          : p.reason === "unsupported"
                            ? k("unsupported")
                            : k("noData")}
                      </span>
                    </td>
                    <td className={td}>{n(p.posts, locale)}</td>
                    <td className={td}>{n(p.metrics?.impressions, locale)}</td>
                    <td className={td}>{n(p.metrics?.reach, locale)}</td>
                    <td className={td}>{n(p.metrics?.clicks, locale)}</td>
                    <td className={td}>
                      {n(p.metrics?.engagement, locale)}
                      {p.metrics && p.metrics.engagement != null ? (
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          {[
                            p.metrics.likes != null ? `${n(p.metrics.likes, locale)} ${k("likes").toLowerCase()}` : null,
                            p.metrics.comments != null ? `${n(p.metrics.comments, locale)} ${k("comments").toLowerCase()}` : null,
                            p.metrics.shares != null ? `${n(p.metrics.shares, locale)} ${k("shares").toLowerCase()}` : null,
                            p.metrics.saves != null ? `${n(p.metrics.saves, locale)} ${k("saves").toLowerCase()}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.social.topPosts.length ? (
          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{k("topPosts")}</p>
            <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
              {data.social.topPosts.map((p, i) => (
                <li key={i} className="flex items-start justify-between gap-3 py-1.5 text-sm">
                  <span className="min-w-0">
                    <span className="mr-2 rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600 dark:text-slate-400">{PLATFORM_LABEL[p.platform] ?? p.platform}</span>
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-slate-800 dark:text-slate-200 hover:underline">
                        {p.caption || "…"}
                      </a>
                    ) : (
                      <span className="text-slate-800 dark:text-slate-200">{p.caption || "…"}</span>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-400">{n(p.engagement, locale)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* ── Ads ── */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{k("ads")}</h3>
          <Link href="/dashboard/leads/generate/ads" className="text-xs font-medium text-[#0072ce] hover:underline">
            {k("openAds")}
          </Link>
        </div>
        {data.ads.campaigns.length === 0 ? (
          <Empty>{k("noAds")}</Empty>
        ) : (
          <>
            {data.ads.staleCount > 0 ? (
              <p className="mb-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs text-slate-600 dark:text-slate-400 ring-1 ring-inset ring-slate-200 dark:ring-slate-700">{k("adsStale", { count: data.ads.staleCount })}</p>
            ) : null}
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full min-w-[40rem]">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr>
                    <th className={th}>{k("campaign")}</th>
                    <th className={th}>{k("status")}</th>
                    <th className={th}>{k("spend")}</th>
                    <th className={th}>{k("impressions")}</th>
                    <th className={th}>{k("clicks")}</th>
                    <th className={th}>{k("leads")}</th>
                    <th className={th}>{k("cpl")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.ads.campaigns.map((c) => (
                    <tr key={c.id}>
                      <td className={td}>
                        <span className="font-medium">{c.name}</span>
                        {c.lastRefreshedAt ? <span className="block text-xs text-slate-500 dark:text-slate-400">{k("refreshedAt", { when: when(c.lastRefreshedAt) })}</span> : null}
                      </td>
                      <td className={td}>{c.status}</td>
                      <td className={td}>{money(c.spendCents, locale)}</td>
                      <td className={td}>{n(c.impressions, locale)}</td>
                      <td className={td}>{n(c.clicks, locale)}</td>
                      <td className={td}>{n(c.leads, locale)}</td>
                      <td className={td}>{money(c.cplCents, locale)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 dark:bg-slate-800/60 font-medium">
                  <tr>
                    <td className={td} colSpan={2} />
                    <td className={td}>{money(data.ads.totals.spendCents, locale)}</td>
                    <td className={td}>{n(data.ads.totals.impressions, locale)}</td>
                    <td className={td}>{n(data.ads.totals.clicks, locale)}</td>
                    <td className={td}>{n(data.ads.totals.leads, locale)}</td>
                    <td className={td}>{money(data.ads.totals.cplCents, locale)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Sources ── */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{k("sources")}</h3>
        {data.sources.length === 0 ? (
          <Empty>{k("noSources")}</Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full min-w-[24rem]">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className={th}>{k("source")}</th>
                  <th className={th}>{k("views")}</th>
                  <th className={th}>{k("hubLeads")}</th>
                  <th className={th}>{k("rate")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.sources.map((s) => (
                  <tr key={s.source}>
                    <td className={`${td} font-medium`}>{s.source}</td>
                    <td className={td}>{n(s.views, locale)}</td>
                    <td className={td}>{n(s.leads, locale)}</td>
                    <td className={td}>{pct(s.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Google ── */}
      <GoogleAnalyticsPanel ga={data.google.analytics} ga4TagConfigured={data.google.ga4TagConfigured} onChanged={() => setTick((v) => v + 1)} />
    </Card>
  );
}
