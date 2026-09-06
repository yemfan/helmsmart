"use client";

import Link from "next/link";
import { useConfirm } from "@/components/ui/useConfirm";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

type ScheduledT = (key: string, options?: Record<string, unknown>) => string;

/**
 * Scheduled posts list — client interactions:
 *   - Cancel a scheduled / posting row (POSTs /[id]/cancel)
 *   - View the published Meta post URL (when status='posted')
 *   - Surface failure reasons inline for status='failed' rows
 *
 * The list is server-rendered above; we router.refresh() after
 * cancel to re-fetch.
 *
 * Visual organization splits the rows into three buckets so the
 * agent's eye can land on the relevant section:
 *   1. Upcoming  (scheduled + posting status, scheduled_for >= now)
 *   2. Failed    (failed status only, surfaces errors)
 *   3. Recent    (posted + cancelled status — historical record)
 */

export type ScheduledRow = {
  id: string;
  platform: string;
  caption: string;
  hashtags: string[];
  mediaLibraryId: string | null;
  scheduledFor: string;
  status: string;
  attemptCount: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  publishedLeadPostId: string | null;
  publishedAt: string | null;
  publishedUrl: string | null;
  pageName: string | null;
  igBusinessUsername: string | null;
  createdAt: string;
};

export default function ScheduledListClient({
  scheduled,
}: {
  scheduled: ScheduledRow[];
}) {
  const router = useRouter();
  const { t, i18n } = useTranslation("web_generate_leads_clients");
  const confirmDialog = useConfirm();
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { upcoming, failed, recent } = useMemo(() => {
    const u: ScheduledRow[] = [];
    const f: ScheduledRow[] = [];
    const r: ScheduledRow[] = [];
    for (const row of scheduled) {
      if (row.status === "scheduled" || row.status === "posting") {
        u.push(row);
      } else if (row.status === "failed") {
        f.push(row);
      } else {
        r.push(row);
      }
    }
    return { upcoming: u, failed: f, recent: r };
  }, [scheduled]);

  const onCancel = useCallback(
    async (id: string) => {
      if (!await confirmDialog(t("scheduled.cancel_confirm"))) {
        return;
      }
      setActionError(null);
      setActingId(id);
      try {
        const res = await fetch(`/api/leads-gen/schedule/${id}/cancel`, {
          method: "POST",
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !body.ok) {
          throw new Error(body.error ?? t("scheduled.cancel_failed"));
        }
        router.refresh();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : t("scheduled.cancel_failed"));
      } finally {
        setActingId(null);
      }
    },
    [router, t],
  );

  if (scheduled.length === 0) {
    return <EmptyState t={t} />;
  }

  return (
    <div className="space-y-6">
      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {actionError}
        </div>
      )}

      {upcoming.length > 0 && (
        <Section title={t("scheduled.sections.upcoming")} count={upcoming.length}>
          <RowTable
            rows={upcoming}
            variant="upcoming"
            onCancel={onCancel}
            actingId={actingId}
            t={t}
            locale={i18n.language}
          />
        </Section>
      )}

      {failed.length > 0 && (
        <Section title={t("scheduled.sections.failed")} count={failed.length} accent="red">
          <RowTable
            rows={failed}
            variant="failed"
            onCancel={onCancel}
            actingId={actingId}
            t={t}
            locale={i18n.language}
          />
        </Section>
      )}

      {recent.length > 0 && (
        <Section title={t("scheduled.sections.recent")} count={recent.length}>
          <RowTable
            rows={recent}
            variant="recent"
            onCancel={onCancel}
            actingId={actingId}
            t={t}
            locale={i18n.language}
          />
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  accent,
  children,
}: {
  title: string;
  count: number;
  accent?: "red";
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2
        className={`mb-2 text-sm font-semibold ${
          accent === "red" ? "text-red-700" : "text-slate-900"
        }`}
      >
        {title} <span className="text-slate-400">({count})</span>
      </h2>
      {children}
    </section>
  );
}

function RowTable({
  rows,
  variant,
  onCancel,
  actingId,
  t,
  locale,
}: {
  rows: ScheduledRow[];
  variant: "upcoming" | "failed" | "recent";
  onCancel: (id: string) => void;
  actingId: string | null;
  t: ScheduledT;
  locale: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">{t("scheduled.columns.caption")}</th>
            <th className="px-3 py-3">{t("scheduled.columns.platform_page")}</th>
            <th className="px-3 py-3">
              {variant === "recent" ? t("scheduled.columns.published") : t("scheduled.columns.scheduled_for")}
            </th>
            <th className="px-3 py-3">{t("scheduled.columns.status")}</th>
            <th className="px-3 py-3 w-1" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id} className="text-slate-800 align-top">
              <td className="px-4 py-3 max-w-md">
                <div className="line-clamp-2 text-sm text-slate-800">
                  {r.caption}
                </div>
                {r.hashtags.length > 0 && (
                  <div className="mt-1 truncate text-xs text-slate-500">
                    {r.hashtags.map((tag) => `#${tag}`).join(" ")}
                  </div>
                )}
                {r.lastError && variant === "failed" && (
                  <div className="mt-1 text-xs text-red-700">{r.lastError}</div>
                )}
              </td>
              <td className="px-3 py-3 text-slate-700">
                <PlatformBadge platform={r.platform} t={t} />
                <div className="mt-0.5 text-xs text-slate-500">
                  {r.platform === "instagram" && r.igBusinessUsername
                    ? `@${r.igBusinessUsername}`
                    : r.pageName ?? t("scheduled.row.empty_value")}
                </div>
              </td>
              <td className="px-3 py-3 text-slate-700">
                {variant === "recent" && r.publishedAt
                  ? new Date(r.publishedAt).toLocaleString(locale)
                  : new Date(r.scheduledFor).toLocaleString(locale)}
                {variant === "upcoming" && r.attemptCount > 0 && (
                  <div className="text-xs text-amber-700">
                    {t("scheduled.row.retry", { count: r.attemptCount })}
                  </div>
                )}
              </td>
              <td className="px-3 py-3">
                <StatusBadge status={r.status} t={t} />
              </td>
              <td className="px-3 py-3 text-right">
                <RowActions
                  row={r}
                  variant={variant}
                  onCancel={onCancel}
                  busy={actingId === r.id}
                  t={t}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowActions({
  row,
  variant,
  onCancel,
  busy,
  t,
}: {
  row: ScheduledRow;
  variant: "upcoming" | "failed" | "recent";
  onCancel: (id: string) => void;
  busy: boolean;
  t: ScheduledT;
}) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-1.5">
      {variant === "recent" && row.publishedUrl && (
        <a
          href={row.publishedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          title={t("scheduled.row.view_tooltip")}
        >
          {t("scheduled.row.view")}
        </a>
      )}
      {(variant === "upcoming" || variant === "failed") && (
        <button
          type="button"
          onClick={() => onCancel(row.id)}
          disabled={busy}
          className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? t("scheduled.row.busy") : t("scheduled.row.cancel")}
        </button>
      )}
    </div>
  );
}

function PlatformBadge({ platform, t }: { platform: string; t: ScheduledT }) {
  const tones: Record<string, { bg: string; fg: string }> = {
    facebook: { bg: "bg-blue-100", fg: "text-blue-700" },
    instagram: { bg: "bg-pink-100", fg: "text-pink-700" },
  };
  const tone = tones[platform] ?? { bg: "bg-slate-100", fg: "text-slate-700" };
  const label = t(`scheduled.platform.${platform}`, { defaultValue: platform });
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${tone.bg} ${tone.fg}`}
    >
      {label}
    </span>
  );
}

function StatusBadge({ status, t }: { status: string; t: ScheduledT }) {
  const tones: Record<string, { bg: string; fg: string }> = {
    scheduled: { bg: "bg-indigo-100", fg: "text-indigo-700" },
    posting: { bg: "bg-amber-100", fg: "text-amber-900" },
    posted: { bg: "bg-emerald-100", fg: "text-emerald-800" },
    failed: { bg: "bg-red-100", fg: "text-red-700" },
    cancelled: { bg: "bg-slate-100", fg: "text-slate-600" },
  };
  const tone = tones[status] ?? { bg: "bg-slate-100", fg: "text-slate-700" };
  const label = t(`scheduled.status.${status}`, { defaultValue: status });
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${tone.bg} ${tone.fg}`}
    >
      {label}
    </span>
  );
}

function EmptyState({ t }: { t: ScheduledT }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/40 p-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
        <svg
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.75}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <h2 className="text-base font-semibold text-slate-900">
        {t("scheduled.empty.title")}
      </h2>
      <p className="mt-1 text-sm text-slate-500">{t("scheduled.empty.body")}</p>
      <Link
        href="/dashboard/leads/generate/post/new"
        className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
      >
        {t("scheduled.empty.cta")}
      </Link>
    </div>
  );
}
