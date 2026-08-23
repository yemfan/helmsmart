"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoadingText } from "@/components/ui/LoadingText";

/**
 * Activity-first view for the missed-call dashboard. Shows the full
 * call log with the actual SMS body that was auto-sent, filterable
 * by status. Designed as the primary surface — settings live behind
 * a button on the parent page so they don't dominate the layout.
 *
 * Renders the same /api/dashboard/missed-call/events endpoint the
 * legacy MissedCallSettingsPanel used; we just lift the limit and
 * wire in filters. The endpoint already returns `textback_message`
 * and `textback_status` (added in the same PR as this component).
 */

type CallEvent = {
  id: string;
  contact_id: string | null;
  contact_name: string | null;
  direction: "inbound" | "outbound";
  status: string;
  from_phone: string | null;
  to_phone: string | null;
  duration_seconds: number | null;
  textback_sent: boolean;
  textback_message: string | null;
  textback_status: string | null;
  textback_sent_at: string | null;
  notes: string | null;
  created_at: string;
};

type FilterMode = "all" | "missed" | "with_textback" | "no_textback";

const PAGE_SIZE = 100;

export default function MissedCallActivityLog() {
  const { t } = useTranslation("dashboard");
  const [events, setEvents] = useState<CallEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/missed-call/events?limit=${PAGE_SIZE}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        events?: CallEvent[];
        error?: string;
      } | null;
      if (json?.ok && Array.isArray(json.events)) {
        setEvents(json.events);
      } else {
        setError(json?.error ?? "Couldn't load call log.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = events.filter((ev) => {
    if (filter === "missed") return ev.status === "missed";
    if (filter === "with_textback") return ev.textback_sent;
    if (filter === "no_textback") return ev.status === "missed" && !ev.textback_sent;
    return true;
  });

  // Summary counters — computed off the unfiltered list so the chip
  // numbers reflect the agent's actual activity, not the current view.
  const stats = {
    total: events.length,
    missed: events.filter((e) => e.status === "missed").length,
    textbacks: events.filter((e) => e.textback_sent).length,
    missedNoTextback: events.filter(
      (e) => e.status === "missed" && !e.textback_sent,
    ).length,
  };

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("pages.labels.calls")} value={stats.total} tone="slate" />
        <Stat label={t("pages.labels.missed")} value={stats.missed} tone="amber" />
        <Stat label={t("pages.missedCallLog.autoTextsSent")} value={stats.textbacks} tone="emerald" />
        <Stat label={t("pages.missedCallLog.missedNoText")} value={stats.missedNoTextback} tone="red" />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <FilterChip value="all" current={filter} onClick={setFilter} label={t("pages.labels.all")} />
        <FilterChip value="missed" current={filter} onClick={setFilter} label={t("pages.missedCallLog.missedOnly")} />
        <FilterChip
          value="with_textback"
          current={filter}
          onClick={setFilter}
          label={t("pages.missedCallLog.withAutoText")}
        />
        <FilterChip
          value="no_textback"
          current={filter}
          onClick={setFilter}
          label={t("pages.missedCallLog.missedNoText")}
        />
        <button
          type="button"
          onClick={() => void refresh()}
          className="ml-auto rounded-full border border-slate-200 px-3 py-1 font-medium text-slate-600 hover:bg-slate-50"
          disabled={loading}
        >
          {loading ? t("common:status.refreshing") : t("common:actions.refresh")}
        </button>
      </div>

      {/* List */}
      {error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : loading && events.length === 0 ? (
        <p className="text-sm text-slate-500"><LoadingText /></p>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">
            {events.length === 0
              ? t("pages.missedCallActivityLog.noCallActivityYet")
              : t("pages.missedCallActivityLog.noCallsMatchThis")}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {visible.map((ev) => (
            <li key={ev.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <CallStatusBadge status={ev.status} direction={ev.direction} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {ev.contact_name ?? ev.from_phone ?? ev.to_phone ?? t("pages.missedCallActivityLog.unknown")}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {ev.contact_name && (ev.from_phone || ev.to_phone)
                      ? `${ev.from_phone ?? ev.to_phone} · `
                      : ""}
                    {formatDate(ev.created_at)}
                    {ev.duration_seconds != null
                      ? ` · ${ev.duration_seconds}s call`
                      : ""}
                  </p>
                  {ev.notes && (
                    <p className="mt-1 truncate text-xs text-slate-500">{ev.notes}</p>
                  )}
                </div>
                {ev.textback_sent ? (
                  <span
                    className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-200"
                    title={
                      ev.textback_status ? `SMS status: ${ev.textback_status}` : undefined
                    }
                  >{t("pages.missedCallLog.textSent")}</span>
                ) : ev.status === "missed" ? (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-200">{t("pages.missedCallLog.noAutoText")}</span>
                ) : null}
              </div>

              {/* Auto-text body — collapsed under a disclosure so the
                  feed scans cleanly even on busy days, but the agent
                  can expand to see the actual SMS that went out. */}
              {ev.textback_sent && ev.textback_message && (
                <details className="ml-9 mt-2">
                  <summary className="cursor-pointer select-none text-xs font-medium text-slate-600 hover:text-slate-900">{t("pages.missedCallLog.showBody")}</summary>
                  <blockquote className="mt-2 rounded-lg border-l-2 border-emerald-300 bg-emerald-50/50 px-3 py-2 text-xs leading-relaxed text-slate-700">
                    {ev.textback_message}
                    {ev.textback_sent_at && (
                      <span className="mt-1 block text-[10px] uppercase tracking-wider text-slate-400">
                        sent {formatDate(ev.textback_sent_at)}
                      </span>
                    )}
                  </blockquote>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "slate" | "amber" | "emerald" | "red";
}) {
  const palette: Record<string, string> = {
    slate: "bg-slate-50 text-slate-900",
    amber: "bg-amber-50 text-amber-900",
    emerald: "bg-emerald-50 text-emerald-900",
    red: "bg-rose-50 text-rose-900",
  };
  return (
    <div className={`rounded-xl px-3 py-2.5 ${palette[tone]}`}>
      <div className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-0.5 text-xl font-semibold">{value}</div>
    </div>
  );
}

function FilterChip({
  value,
  current,
  onClick,
  label,
}: {
  value: FilterMode;
  current: FilterMode;
  onClick: (v: FilterMode) => void;
  label: string;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`rounded-full px-3 py-1 font-medium ${
        active
          ? "bg-blue-600 text-white"
          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

function CallStatusBadge({
  status,
  direction,
}: {
  status: string;
  direction: "inbound" | "outbound";
}) {
  const tone =
    status === "missed"
      ? "amber"
      : status === "completed"
        ? "emerald"
        : status === "failed" || status === "busy"
          ? "red"
          : "slate";
  const palette: Record<string, string> = {
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    emerald: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    red: "bg-red-50 text-red-800 ring-red-200",
    slate: "bg-slate-50 text-slate-800 ring-slate-200",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${palette[tone]}`}
    >
      <span aria-hidden>{direction === "inbound" ? "↓" : "↑"}</span>
      {status}
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
