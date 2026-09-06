"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/ui/useConfirm";
import { useTranslation } from "react-i18next";

type RecurringT = (key: string, options?: Record<string, unknown>) => string;

/**
 * Client-side list + lifecycle controls for recurring post
 * schedules. Three sections by status:
 *   - Active (next firing time, pause/cancel actions)
 *   - Paused (resume/cancel actions)
 *   - Completed / Cancelled (read-only, last 90 days)
 *
 * No edit-in-place — to change the template / cadence the agent
 * cancels + creates a new recurrence. Keeps the lifecycle simple
 * (state transitions are bounded + auditable) and the wizard is
 * already the natural place to author one.
 */

type Recurrence = {
  id: string;
  platform: "facebook" | "instagram" | "linkedin";
  caption: string;
  cadence: "daily" | "weekly";
  weeklyDayOfWeek: number | null;
  timeOfDayHour: number;
  timeOfDayMinute: number;
  timezone: string;
  startsAt: string;
  endsAt: string | null;
  maxOccurrences: number | null;
  occurrenceCount: number;
  nextOccurrenceAt: string;
  lastMaterializedAt: string | null;
  status: "active" | "paused" | "completed" | "cancelled";
  lastError: string | null;
  socialAccountDisplay: string | null;
  createdAt: string;
};

const WEEKDAY_IDS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function describeCadence(r: Recurrence, t: RecurringT): string {
  const hh = String(r.timeOfDayHour).padStart(2, "0");
  const mm = String(r.timeOfDayMinute).padStart(2, "0");
  const time = `${hh}:${mm}`;
  if (r.cadence === "daily") {
    return t("recurring.cadence_daily", { time, tz: r.timezone });
  }
  const dayKey =
    r.weeklyDayOfWeek !== null && r.weeklyDayOfWeek >= 0 && r.weeklyDayOfWeek < 7
      ? WEEKDAY_IDS[r.weeklyDayOfWeek]
      : "unknown";
  const day = t(`recurring.weekday.${dayKey}`);
  return t("recurring.cadence_weekly", { day, time, tz: r.timezone });
}

export default function RecurringListClient() {
  const { t, i18n } = useTranslation("web_generate_leads_clients");
  const confirmDialog = useConfirm();
  const [recurrences, setRecurrences] = useState<Recurrence[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/leads-gen/recurring/list");
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        recurrences?: Recurrence[];
        error?: string;
      };
      if (!res.ok || !body.ok)
        throw new Error(body.error ?? t("recurring.errors.load_failed"));
      setRecurrences(body.recurrences ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("recurring.errors.load_failed"));
      setRecurrences([]);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (id: string, action: "pause" | "resume" | "cancel") => {
      if (action === "cancel" && !await confirmDialog(t("recurring.cancel_confirm"))) {
        return;
      }
      setActionError(null);
      setActionId(id);
      try {
        const res = await fetch(`/api/leads-gen/recurring/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        const failKey =
          action === "pause"
            ? "recurring.errors.pause_failed"
            : action === "resume"
              ? "recurring.errors.resume_failed"
              : "recurring.errors.cancel_failed";
        if (!res.ok || !body.ok) throw new Error(body.error ?? t(failKey));
        await load();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : t(`recurring.errors.${action}_failed`));
      } finally {
        setActionId(null);
      }
    },
    [load, t],
  );

  if (recurrences === null) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        {t("recurring.loading")}
      </div>
    );
  }

  if (recurrences.length === 0) {
    return (
      <div className="space-y-3">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-10 text-center">
          <p className="text-sm text-slate-600">{t("recurring.empty.title")}</p>
          <p className="mt-1 text-xs text-slate-500">
            {t("recurring.empty.body_prefix")}
            <span className="font-medium">{t("recurring.empty.body_highlight")}</span>
            {t("recurring.empty.body_suffix")}
          </p>
          <a
            href="/dashboard/leads/generate/post/new"
            className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {t("recurring.empty.cta")}
          </a>
        </div>
      </div>
    );
  }

  const active = recurrences.filter((r) => r.status === "active");
  const paused = recurrences.filter((r) => r.status === "paused");
  const completedOrCancelled = recurrences.filter(
    (r) => r.status === "completed" || r.status === "cancelled",
  );

  return (
    <div className="space-y-6">
      {(error || actionError) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error || actionError}
        </div>
      )}

      {active.length > 0 && (
        <Section
          title={t("recurring.sections.active_title")}
          subtitle={t("recurring.sections.active_subtitle")}
        >
          {active.map((r) => (
            <Card
              key={r.id}
              recurrence={r}
              busy={actionId === r.id}
              actions={[
                { label: t("recurring.actions.pause"), onClick: () => act(r.id, "pause") },
                {
                  label: t("recurring.actions.cancel"),
                  onClick: () => act(r.id, "cancel"),
                  variant: "danger",
                },
              ]}
              t={t}
              locale={i18n.language}
            />
          ))}
        </Section>
      )}

      {paused.length > 0 && (
        <Section
          title={t("recurring.sections.paused_title")}
          subtitle={t("recurring.sections.paused_subtitle")}
        >
          {paused.map((r) => (
            <Card
              key={r.id}
              recurrence={r}
              busy={actionId === r.id}
              actions={[
                { label: t("recurring.actions.resume"), onClick: () => act(r.id, "resume") },
                {
                  label: t("recurring.actions.cancel"),
                  onClick: () => act(r.id, "cancel"),
                  variant: "danger",
                },
              ]}
              t={t}
              locale={i18n.language}
            />
          ))}
        </Section>
      )}

      {completedOrCancelled.length > 0 && (
        <Section
          title={t("recurring.sections.done_title")}
          subtitle={t("recurring.sections.done_subtitle")}
        >
          {completedOrCancelled.slice(0, 20).map((r) => (
            <Card
              key={r.id}
              recurrence={r}
              busy={false}
              actions={[]}
              t={t}
              locale={i18n.language}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Card({
  recurrence,
  busy,
  actions,
  t,
  locale,
}: {
  recurrence: Recurrence;
  busy: boolean;
  actions: Array<{ label: string; onClick: () => void; variant?: "danger" }>;
  t: RecurringT;
  locale: string;
}) {
  const r = recurrence;
  const next = new Date(r.nextOccurrenceAt);
  const ends = r.endsAt ? new Date(r.endsAt) : null;
  // i18next pluralization: pass count and the chosen key auto-resolves
  // _one or _other based on locale rules. We branch on maxOccurrences
  // to pick the with-max variant.
  const postedLine = r.maxOccurrences
    ? t("recurring.card.posted_with_max", {
        count: r.occurrenceCount,
        max: r.maxOccurrences,
      })
    : t("recurring.card.posted", { count: r.occurrenceCount });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
              {t(`recurring.platform.${r.platform}`, { defaultValue: r.platform })}
            </span>
            {r.socialAccountDisplay && (
              <span className="truncate text-slate-500">
                {r.socialAccountDisplay}
              </span>
            )}
            <StatusBadge status={r.status} t={t} />
          </div>
          <p className="text-sm font-semibold text-slate-900">
            {describeCadence(r, t)}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">
            {r.caption}
          </p>
          <p className="mt-2 text-[11px] text-slate-500">
            {r.status === "active" && t("recurring.card.next_active", { date: next.toLocaleString(locale) })}
            {r.status === "paused" && t("recurring.card.next_paused", { date: next.toLocaleString(locale) })}
            {postedLine}
            {ends && t("recurring.card.ends_suffix", { date: ends.toLocaleDateString(locale) })}
          </p>
          {r.lastError && (
            <p className="mt-1 line-clamp-2 text-[11px] text-red-700">
              {t("recurring.card.last_error", { message: r.lastError })}
            </p>
          )}
        </div>
        {actions.length > 0 && (
          <div className="flex shrink-0 gap-2">
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick}
                disabled={busy}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
                  a.variant === "danger"
                    ? "border-red-300 bg-white text-red-700 hover:bg-red-50"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {busy ? t("recurring.actions.busy") : a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status, t }: { status: Recurrence["status"]; t: RecurringT }) {
  const cls =
    status === "active"
      ? "bg-emerald-100 text-emerald-800"
      : status === "paused"
        ? "bg-amber-100 text-amber-900"
        : status === "completed"
          ? "bg-slate-100 text-slate-700"
          : "bg-red-100 text-red-800";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {t(`recurring.status.${status}`, { defaultValue: status })}
    </span>
  );
}
