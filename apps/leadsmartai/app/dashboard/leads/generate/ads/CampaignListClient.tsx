"use client";

import Link from "next/link";
import { useConfirm } from "@/components/ui/useConfirm";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Lead Ad campaigns dashboard — client interactions:
 *   - Pause / resume / archive a campaign (POSTs /[id]/status)
 *   - Refresh insights from Meta (POSTs /[id]/refresh)
 *   - "View in Ads Manager" deep link
 *
 * The list itself is server-rendered above; after a row action we
 * `router.refresh()` to re-fetch fresh server state. Optimistic UI
 * would feel snappier but the server is the source of truth and
 * the round-trip is sub-second.
 */

export type CampaignRow = {
  id: string;
  name: string;
  status: string;
  lastError: string | null;
  pageName: string | null;
  igBusinessUsername: string | null;
  metaCampaignId: string | null;
  metaAdAccountId: string | null;
  dailyBudgetCents: number | null;
  startTime: string | null;
  endTime: string | null;
  leadsReceivedCount: number;
  lastLeadAt: string | null;
  metrics: Record<string, unknown>;
  metricsRefreshedAt: string | null;
  launchedAt: string | null;
  createdAt: string;
};

type Metrics = {
  impressions?: number;
  reach?: number;
  clicks?: number;
  inlineLinkClicks?: number;
  leads?: number;
  spendCents?: number;
  cpmCents?: number | null;
  cpcCents?: number | null;
  cplCents?: number | null;
  metaUpdatedAt?: string | null;
};

type CampaignsT = (key: string, options?: Record<string, unknown>) => string;

export default function CampaignListClient({
  campaigns,
}: {
  campaigns: CampaignRow[];
}) {
  const router = useRouter();
  const { t, i18n } = useTranslation("web_generate_leads_clients");
  const confirmDialog = useConfirm();
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const onStatusChange = useCallback(
    async (id: string, action: "pause" | "resume" | "archive") => {
      const failKeys: Record<typeof action, string> = {
        pause: "campaigns.errors.failed_to_pause",
        resume: "campaigns.errors.failed_to_resume",
        archive: "campaigns.errors.failed_to_archive",
      };
      if (action === "archive" && !await confirmDialog(t("campaigns.archive_confirm"))) {
        return;
      }
      setActionError(null);
      setActingId(id);
      try {
        const res = await fetch(`/api/leads-gen/ads/${id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !body.ok) {
          throw new Error(body.error ?? t(failKeys[action]));
        }
        router.refresh();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : t("campaigns.errors.action_failed"));
      } finally {
        setActingId(null);
      }
    },
    [router, t],
  );

  const onRefresh = useCallback(
    async (id: string) => {
      setActionError(null);
      setActingId(id);
      try {
        const res = await fetch(`/api/leads-gen/ads/${id}/refresh`, {
          method: "POST",
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !body.ok) {
          throw new Error(body.error ?? t("campaigns.errors.refresh_failed"));
        }
        router.refresh();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : t("campaigns.errors.refresh_failed"));
      } finally {
        setActingId(null);
      }
    },
    [router, t],
  );

  if (campaigns.length === 0) {
    return <EmptyState t={t} />;
  }

  return (
    <div className="space-y-4">
      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {actionError}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/60 dark:bg-slate-900/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("campaigns.columns.campaign")}</th>
              <th className="px-3 py-3">{t("campaigns.columns.status")}</th>
              <th className="px-3 py-3">{t("campaigns.columns.budget")}</th>
              <th className="px-3 py-3">{t("campaigns.columns.spend")}</th>
              <th className="px-3 py-3">{t("campaigns.columns.impressions")}</th>
              <th className="px-3 py-3">{t("campaigns.columns.leads")}</th>
              <th className="px-3 py-3">{t("campaigns.columns.cpl")}</th>
              <th className="px-3 py-3">{t("campaigns.columns.refreshed")}</th>
              <th className="px-3 py-3 w-1" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {campaigns.map((c) => (
              <CampaignRowView
                key={c.id}
                campaign={c}
                onStatusChange={onStatusChange}
                onRefresh={onRefresh}
                busy={actingId === c.id}
                t={t}
                locale={i18n.language}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">{t("campaigns.leads_footer")}</p>
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────

function CampaignRowView({
  campaign: c,
  onStatusChange,
  onRefresh,
  busy,
  t,
  locale,
}: {
  campaign: CampaignRow;
  onStatusChange: (id: string, action: "pause" | "resume" | "archive") => void;
  onRefresh: (id: string) => void;
  busy: boolean;
  t: CampaignsT;
  locale: string;
}) {
  const metrics = c.metrics as Metrics;
  const adsManagerUrl = c.metaCampaignId
    ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?selected_campaign_ids=${encodeURIComponent(c.metaCampaignId)}`
    : null;

  return (
    <tr className="text-slate-800 dark:text-slate-200">
      <td className="px-4 py-3 align-top">
        <div className="font-medium text-slate-900 dark:text-slate-100">{c.name}</div>
        <div className="text-xs text-slate-500">
          {c.pageName ?? t("campaigns.row.empty_value")}
          {c.igBusinessUsername ? t("campaigns.row.ig_handle", { user: c.igBusinessUsername }) : ""}
        </div>
        {c.lastError && (
          <div className="mt-1 truncate text-xs text-red-700" title={c.lastError}>
            {c.lastError}
          </div>
        )}
      </td>

      <td className="px-3 py-3 align-top">
        <StatusBadge status={c.status} t={t} />
      </td>

      <td className="px-3 py-3 align-top text-slate-700 dark:text-slate-300">
        {c.dailyBudgetCents != null
          ? t("campaigns.row.budget_daily", { amount: (c.dailyBudgetCents / 100).toFixed(0) })
          : t("campaigns.row.empty_value")}
        <div className="text-xs text-slate-500">
          {compactDateRange(c.startTime, c.endTime, t, locale)}
        </div>
      </td>

      <td className="px-3 py-3 align-top text-slate-700 dark:text-slate-300">
        {metrics.spendCents != null
          ? `$${(metrics.spendCents / 100).toFixed(2)}`
          : t("campaigns.row.empty_value")}
      </td>

      <td className="px-3 py-3 align-top text-slate-700 dark:text-slate-300">
        {metrics.impressions != null
          ? metrics.impressions.toLocaleString(locale)
          : t("campaigns.row.empty_value")}
      </td>

      <td className="px-3 py-3 align-top">
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {c.leadsReceivedCount}
        </span>
        {metrics.leads && metrics.leads > c.leadsReceivedCount ? (
          <span
            className="ml-1 text-xs text-amber-700"
            title={t("campaigns.row.meta_leads_extra_tooltip", { count: metrics.leads })}
          >
            {t("campaigns.row.meta_leads_extra", { count: metrics.leads })}
          </span>
        ) : null}
      </td>

      <td className="px-3 py-3 align-top text-slate-700 dark:text-slate-300">
        {metrics.cplCents != null
          ? `$${(metrics.cplCents / 100).toFixed(2)}`
          : t("campaigns.row.empty_value")}
      </td>

      <td className="px-3 py-3 align-top text-xs text-slate-500">
        {c.metricsRefreshedAt
          ? friendlyAgo(c.metricsRefreshedAt, t)
          : t("campaigns.row.never")}
      </td>

      <td className="px-3 py-3 align-top text-right">
        <RowActions
          campaign={c}
          onStatusChange={onStatusChange}
          onRefresh={onRefresh}
          adsManagerUrl={adsManagerUrl}
          busy={busy}
          t={t}
        />
      </td>
    </tr>
  );
}

// ── Actions ──────────────────────────────────────────────────────────

function RowActions({
  campaign: c,
  onStatusChange,
  onRefresh,
  adsManagerUrl,
  busy,
  t,
}: {
  campaign: CampaignRow;
  onStatusChange: (id: string, action: "pause" | "resume" | "archive") => void;
  onRefresh: (id: string) => void;
  adsManagerUrl: string | null;
  busy: boolean;
  t: CampaignsT;
}) {
  // Per-state action affordances:
  //   - paused / draft  → Resume (when Meta-side exists), Archive
  //   - active          → Pause, Archive
  //   - creating        → no actions (mid-orchestration)
  //   - failed          → Archive only
  //   - completed       → no actions (terminal)
  const canResume = c.status === "paused" && c.metaCampaignId !== null;
  const canPause = c.status === "active";
  const canArchive = c.status !== "completed" && c.status !== "creating" && c.metaCampaignId !== null;
  const canRefresh = c.metaCampaignId !== null && c.status !== "creating" && c.status !== "draft";

  return (
    <div className="flex shrink-0 items-center justify-end gap-1.5">
      {canRefresh && (
        <button
          type="button"
          onClick={() => onRefresh(c.id)}
          disabled={busy}
          className="rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          title={t("campaigns.actions.refresh_tooltip")}
        >
          {busy ? t("campaigns.actions.busy") : t("campaigns.actions.refresh")}
        </button>
      )}
      {canResume && (
        <button
          type="button"
          onClick={() => onStatusChange(c.id, "resume")}
          disabled={busy}
          className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
        >
          {t("campaigns.actions.resume")}
        </button>
      )}
      {canPause && (
        <button
          type="button"
          onClick={() => onStatusChange(c.id, "pause")}
          disabled={busy}
          className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          {t("campaigns.actions.pause")}
        </button>
      )}
      {canArchive && (
        <button
          type="button"
          onClick={() => onStatusChange(c.id, "archive")}
          disabled={busy}
          className="rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          title={t("campaigns.actions.archive_tooltip")}
        >
          {t("campaigns.actions.archive")}
        </button>
      )}
      {adsManagerUrl && (
        <a
          href={adsManagerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          title={t("campaigns.actions.ads_manager_tooltip")}
        >
          {t("campaigns.actions.ads_manager")}
        </a>
      )}
    </div>
  );
}

// ── Display helpers ──────────────────────────────────────────────────

function StatusBadge({ status, t }: { status: string; t: CampaignsT }) {
  const tones: Record<string, { bg: string; fg: string }> = {
    draft: { bg: "bg-slate-100", fg: "text-slate-700" },
    creating: { bg: "bg-blue-100", fg: "text-blue-700" },
    active: { bg: "bg-emerald-100", fg: "text-emerald-800" },
    paused: { bg: "bg-amber-100", fg: "text-amber-900" },
    completed: { bg: "bg-slate-100", fg: "text-slate-600" },
    failed: { bg: "bg-red-100", fg: "text-red-700" },
  };
  const tone = tones[status] ?? { bg: "bg-slate-100", fg: "text-slate-700" };
  const label = t(`campaigns.status.${status}`, { defaultValue: status });
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${tone.bg} ${tone.fg}`}
    >
      {label}
    </span>
  );
}

function compactDateRange(
  start: string | null,
  end: string | null,
  t: CampaignsT,
  locale: string,
): string {
  if (!start && !end) return "";
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
    });
  if (start && end) return t("campaigns.row.date_range_both", { from: fmt(start), to: fmt(end) });
  if (start) return t("campaigns.row.date_range_from", { from: fmt(start) });
  if (end) return t("campaigns.row.date_range_until", { to: fmt(end) });
  return "";
}

function friendlyAgo(iso: string, t: CampaignsT): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return t("campaigns.ago.just_now");
  if (min < 60) return t("campaigns.ago.minutes", { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("campaigns.ago.hours", { count: hr });
  const day = Math.floor(hr / 24);
  return t("campaigns.ago.days", { count: day });
}

// ── Empty state ──────────────────────────────────────────────────────

function EmptyState({ t }: { t: CampaignsT }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/60 p-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
        <svg
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312"
          />
        </svg>
      </div>
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        {t("campaigns.empty.title")}
      </h2>
      <p className="mt-1 text-sm text-slate-500">{t("campaigns.empty.body")}</p>
      <Link
        href="/dashboard/leads/generate/ads/new"
        className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
      >
        {t("campaigns.empty.cta")}
      </Link>
    </div>
  );
}
