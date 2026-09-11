"use client";

import { useState, type ComponentType } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Phone, MessageSquare, Mail, Settings, ArrowRight, CheckCircle2, Plus } from "lucide-react";

type Channel = "voice" | "sms" | "email";

interface Props {
  /**
   * `answeredByAi` is the /voice headline for the same window (lib/voice-window),
   * or null when it couldn't be loaded.
   */
  voice: { configured: boolean; answeredByAi: number | null; periodDays: number };
  sms: { active: boolean; number: string | null };
  email: { sent: number; reached: number };
}

// Keys stay the channel vocabulary; labels come from `overview.tabs.<key>`.
const TABS: { key: Channel; icon: ComponentType<{ className?: string }> }[] = [
  { key: "voice", icon: Phone },
  { key: "sms", icon: MessageSquare },
  { key: "email", icon: Mail },
];

// The active channel's "create new" action, shown in the tab bar (changes per tab).
// The label comes from `overview.create.<channel>`.
const CREATE_HREF: Record<Channel, string> = {
  voice: "/client-assistant",
  sms: "/settings#operations",
  email: "/marketing/new",
};

/**
 * Marketing Overview — a multi-channel control panel. One tab per outreach channel
 * (Voice / SMS / Email); each shows how to SET UP the channel and a MONITOR snapshot,
 * with links into the existing config + activity views.
 */
export function MarketingOverview({ voice, sms, email }: Props) {
  const [tab, setTab] = useState<Channel>("voice");
  const { t } = useTranslation("marketing");

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-slate-700 mb-3">{t("overview.title")}</h2>
      <div className="bg-white rounded-xl border border-slate-200">
        {/* Channel tabs + the active channel's "create new" action */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pr-3">
          <div className="flex">
            {TABS.map(({ key, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === key
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t(`overview.tabs.${key}`)}
              </button>
            ))}
          </div>
          <Link
            href={CREATE_HREF[tab]}
            className="flex items-center gap-1.5 shrink-0 m-3 sm:m-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t(`overview.create.${tab}`)}
          </Link>
        </div>

        {/* Tab content */}
        <div className="p-6">
          {tab === "voice" && (
            <div className="grid sm:grid-cols-2 gap-4">
              <SetupCard
                title={t("overview.voice.setupTitle")}
                desc={t("overview.voice.setupDesc")}
                ok={voice.configured}
                status={voice.configured ? t("overview.voice.connected") : t("overview.voice.notSetUp")}
                href="/settings#voice-agent"
                cta={t("overview.voice.configure")}
              />
              <MonitorCard
                title={t("overview.voice.monitorTitle")}
                metric={voice.answeredByAi === null ? "—" : String(voice.answeredByAi)}
                metricLabel={t("overview.voice.monitorLabel", { count: voice.periodDays })}
                error={voice.answeredByAi === null ? t("overview.voice.statsError") : undefined}
                href="/voice"
                cta={t("overview.voice.viewCalls")}
              />
            </div>
          )}

          {tab === "sms" && (
            <div className="grid sm:grid-cols-2 gap-4">
              <SetupCard
                title={t("overview.sms.setupTitle")}
                desc={t("overview.sms.setupDesc")}
                ok={Boolean(sms.number) && sms.active}
                status={
                  sms.number
                    ? sms.active
                      ? t("overview.sms.autoReplyOn")
                      : t("overview.sms.autoReplyOff")
                    : t("overview.sms.noNumber")
                }
                href="/settings#operations"
                cta={t("overview.sms.configure")}
              />
              <MonitorCard
                title={t("overview.sms.monitorTitle")}
                metric={sms.active ? t("overview.sms.on") : t("overview.sms.off")}
                metricLabel={sms.number ?? t("overview.sms.noNumberConfigured")}
                href="/voice"
                cta={t("overview.sms.viewActivity")}
              />
            </div>
          )}

          {tab === "email" && (
            <div className="grid sm:grid-cols-2 gap-4">
              <SetupCard
                title={t("overview.email.setupTitle")}
                desc={t("overview.email.setupDesc")}
                ok
                status={t("overview.email.ready")}
                href="/marketing/new"
                cta={t("overview.email.newCampaign")}
              />
              <MonitorCard
                title={t("overview.email.monitorTitle")}
                metric={String(email.sent)}
                metricLabel={t("overview.email.monitorLabel", { reached: email.reached })}
                href="#email-campaigns"
                cta={t("overview.email.viewCampaigns")}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SetupCard({
  title,
  desc,
  ok,
  status,
  href,
  cta,
}: {
  title: string;
  desc: string;
  ok: boolean;
  status: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
            ok ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {ok && <CheckCircle2 className="w-3 h-3" />}
          {status}
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-4 leading-relaxed">{desc}</p>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700"
      >
        <Settings className="w-3.5 h-3.5" />
        {cta}
      </Link>
    </div>
  );
}

function MonitorCard({
  title,
  metric,
  metricLabel,
  error,
  href,
  cta,
}: {
  title: string;
  metric: string;
  metricLabel: string;
  /** Why the metric is missing — shown instead of letting "—" read as zero. */
  error?: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-5 flex flex-col">
      <h3 className="text-sm font-semibold text-slate-800 mb-2">{title}</h3>
      <p className="text-2xl font-semibold text-slate-800 font-mono">{metric}</p>
      <p className={`text-xs text-slate-400 mt-0.5 truncate ${error ? "" : "mb-4"}`}>{metricLabel}</p>
      {error && (
        <p className="text-xs text-rose-600 mt-1 mb-4" role="alert">
          {error}
        </p>
      )}
      <Link
        href={href}
        className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700"
      >
        {cta}
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
