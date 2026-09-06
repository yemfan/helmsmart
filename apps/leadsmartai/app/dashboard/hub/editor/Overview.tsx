"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, ExternalLink, X } from "lucide-react";
import { intlLocale } from "@/lib/i18n/locale";
import type { HubMetrics } from "@/lib/marketing-hub/events";
import type { SectionProps } from "../HubEditorClient";
import type { MetricsData, SectionKey } from "./types";
import { Card, Empty } from "./ui";

/**
 * Overview and Analytics.
 *
 * Real rows or an empty state — never a placeholder number. The overview
 * also carries a setup checklist because the most common reason a hub gets
 * no traffic is that it was never published, and the second is that it has
 * nothing on it.
 */

function useMetrics(days: number) {
  const [data, setData] = useState<MetricsData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    fetch(`/api/dashboard/hub/metrics?days=${days}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j?.ok) return setFailed(true);
        setData({ metrics: j.metrics as HubMetrics, conversations: j.conversations ?? [] });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [days]);
  return { data, failed };
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
      {sub ? <p className="text-xs text-gray-500">{sub}</p> : null}
    </div>
  );
}

function Sparkline({ series }: { series: { day: string; views: number }[] }) {
  const max = Math.max(1, ...series.map((s) => s.views));
  return (
    <div className="flex h-16 items-end gap-0.5" aria-hidden>
      {series.map((s) => (
        <div key={s.day} className="flex-1 rounded-sm bg-[#0072ce]/70" style={{ height: `${Math.max(2, (s.views / max) * 100)}%` }} title={`${s.day}: ${s.views}`} />
      ))}
    </div>
  );
}

function TopList({ title, rows, empty }: { title: string; rows: { label: string; count: number }[]; empty: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
      {rows.length ? (
        <ul className="mt-2 space-y-1.5">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-gray-800">{r.label}</span>
              <span className="tabular-nums text-gray-500">{r.count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-gray-400">{empty}</p>
      )}
    </div>
  );
}

export function OverviewSection({ data, goTo }: SectionProps) {
  const { t } = useTranslation("dashboard");
  const k = (s: string) => t(`pages.hubEditor.overview.${s}`);
  const { data: m, failed } = useMetrics(30);
  const [copied, setCopied] = useState(false);
  const url = data.identity.username ? `${typeof window !== "undefined" ? window.location.origin : ""}/@${data.identity.username}` : null;

  const checklist: { key: string; done: boolean; section: SectionKey }[] = [
    { key: "username", done: Boolean(data.identity.username), section: "settings" },
    { key: "photo", done: Boolean(data.agent.photoUrl), section: "profile" },
    { key: "bio", done: Boolean(data.identity.bio), section: "profile" },
    { key: "services", done: !data.hasSavedConfig || data.config.services.items.length > 0, section: "services" },
    { key: "assistant", done: data.config.assistant.enabled, section: "assistant" },
    { key: "publish", done: data.identity.published, section: "settings" },
  ];

  const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

  return (
    <>
      <Card title={k("urlLabel")}>
        {url ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-200">{url}</code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(url).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              {copied ? k("copied") : k("copy")}
            </button>
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              {t("pages.hubEditor.viewHub")}
            </a>
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            {k("noUsername")}{" "}
            <button type="button" onClick={() => goTo("settings")} className="font-medium text-[#0072ce] hover:underline">
              {t("pages.hubEditor.sections.settings")}
            </button>
          </p>
        )}
      </Card>

      <Card title={k("checklistTitle")}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {checklist.map((c) => (
            <li key={c.key} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                {c.done ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <X className="h-4 w-4 text-gray-300" aria-hidden />}
                <span className={c.done ? "text-gray-700" : "text-gray-900"}>{t(`pages.hubEditor.overview.checklist.${c.key}`)}</span>
              </span>
              {c.done ? (
                <span className="text-xs text-emerald-700">{k("done")}</span>
              ) : (
                <button type="button" onClick={() => goTo(c.section)} className="text-xs font-medium text-[#0072ce] hover:underline">
                  {k("fix")}
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title={k("metricsTitle")} description={k("last30")}>
        {failed ? (
          <Empty>{t("pages.hubEditor.loadFailed")}</Empty>
        ) : !m ? (
          <div className="grid gap-3 sm:grid-cols-4" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : m.metrics.empty ? (
          <Empty>{k("empty")}</Empty>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Kpi label={k("visitors")} value={String(m.metrics.visitors)} sub={`${m.metrics.views} ${k("views")}`} />
              <Kpi label={k("aiConversations")} value={String(m.metrics.aiConversations)} />
              <Kpi label={k("leads")} value={String(m.metrics.leads)} sub={`${k("conversionRate")} ${pct(m.metrics.conversionRate)}`} />
              <Kpi label={k("appointments")} value={String(m.metrics.appointments)} />
            </div>
            <Sparkline series={m.metrics.viewsByDay} />
            <div className="grid gap-3 sm:grid-cols-3">
              <TopList title={k("topTools")} rows={m.metrics.topTools.map((r) => ({ label: t(`hub.tools.items.${r.key}.name`, { ns: "web_marketing", defaultValue: r.key }), count: r.count }))} empty="—" />
              <TopList title={k("topSources")} rows={m.metrics.topSources.map((r) => ({ label: r.source, count: r.count }))} empty="—" />
              <TopList title={k("topContent")} rows={m.metrics.topContent.map((r) => ({ label: r.slug, count: r.count }))} empty="—" />
            </div>
          </>
        )}
      </Card>
    </>
  );
}

export function AnalyticsSection({ data }: SectionProps) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const k = (s: string) => t(`pages.hubEditor.analytics.${s}`);
  const [days, setDays] = useState(30);
  const { data: m, failed } = useMetrics(days);
  const ranges = [7, 30, 90];
  return (
    <>
      <Card title={k("title")}>
        <div className="flex gap-2" role="group" aria-label={k("title")}>
          {ranges.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              className={`min-h-9 rounded-lg px-3 py-1.5 text-sm font-medium ${days === d ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"}`}
            >
              {t(`pages.hubEditor.analytics.days${d}`)}
            </button>
          ))}
        </div>
        {failed ? (
          <Empty>{t("pages.hubEditor.loadFailed")}</Empty>
        ) : !m ? (
          <div className="h-40 animate-pulse rounded-xl bg-gray-100" aria-busy />
        ) : m.metrics.empty ? (
          <Empty>{t("pages.hubEditor.overview.empty")}</Empty>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Kpi label={t("pages.hubEditor.overview.visitors")} value={String(m.metrics.visitors)} />
              <Kpi label={t("pages.hubEditor.overview.views")} value={String(m.metrics.views)} />
              <Kpi label={k("ctaClicks")} value={String(m.metrics.ctaClicks)} />
              <Kpi label={t("pages.hubEditor.overview.aiConversations")} value={String(m.metrics.aiConversations)} sub={`${m.metrics.aiMessages} ${k("aiMessages")}`} />
              <Kpi label={t("pages.hubEditor.overview.leads")} value={String(m.metrics.leads)} />
              <Kpi label={t("pages.hubEditor.overview.appointments")} value={String(m.metrics.appointments)} />
              <Kpi label={k("homeValueStarted")} value={String(m.metrics.homeValueStarted)} sub={`${m.metrics.homeValueCompleted} ${k("homeValueCompleted")}`} />
              <Kpi label={k("homeSearchStarted")} value={String(m.metrics.homeSearchStarted)} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{k("viewsByDay")}</p>
              <Sparkline series={m.metrics.viewsByDay} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <TopList title={t("pages.hubEditor.overview.topTools")} rows={m.metrics.topTools.map((r) => ({ label: t(`hub.tools.items.${r.key}.name`, { ns: "web_marketing", defaultValue: r.key }), count: r.count }))} empty="—" />
              <TopList title={t("pages.hubEditor.overview.topSources")} rows={m.metrics.topSources.map((r) => ({ label: r.source, count: r.count }))} empty="—" />
              <TopList title={t("pages.hubEditor.overview.topContent")} rows={m.metrics.topContent.map((r) => ({ label: r.slug, count: r.count }))} empty="—" />
            </div>
          </>
        )}
      </Card>
      <Card title={t("pages.hubEditor.overview.recentConversations")}>
        {!m ? (
          <div className="h-16 animate-pulse rounded-xl bg-gray-100" />
        ) : m.conversations.length === 0 ? (
          <Empty>{k("noConversations")}</Empty>
        ) : (
          <ul className="divide-y divide-gray-100">
            {m.conversations.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-gray-800">{c.firstMessage || "…"}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(c.createdAt).toLocaleDateString(locale)} · {c.messageCount} {t("pages.hubEditor.overview.messages")}
                    {c.becameLead ? ` · ${t("pages.hubEditor.overview.becameLead")}` : ""}
                  </p>
                </div>
                {c.contactId ? (
                  <Link href={`/dashboard/leads/${c.contactId}`} className="shrink-0 text-xs font-medium text-[#0072ce] hover:underline">
                    {k("openContact")}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {data.identity.published ? null : <p className="text-xs text-gray-500">{t("pages.hubEditor.settings.publishHintOff")}</p>}
    </>
  );
}
