"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  describeStatus,
  formatDuration,
  type StatusTone,
  type VoiceCallEntry,
} from "@/lib/voiceCallTimeline/format";

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "in-flight": "bg-blue-50 text-blue-700 ring-blue-200",
  failed: "bg-red-50 text-red-700 ring-red-200",
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
};

/**
 * Voice-call timeline for one contact. Shows one row per call with the
 * latest status, duration, and any error code. Collapsing the four
 * underlying status transitions into a single row keeps the agent-facing
 * surface clean — the raw transitions are still in `contact_events` for
 * audit / drill-down.
 *
 * No write actions yet; v1 is read-only. Future PRs will add "play
 * recording" (when recording is enabled) and "transcript" (when wired).
 */
export default function VoiceCallTimelinePanel({ contactId }: { contactId: string }) {
  const { t } = useTranslation("dashboard");
  const [calls, setCalls] = useState<VoiceCallEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/dashboard/contacts/${encodeURIComponent(contactId)}/voice-calls`,
          { cache: "no-store" },
        );
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          calls?: VoiceCallEntry[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || data.ok === false) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        setCalls(data.calls ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-gray-900">{t("pages.voiceCallTimeline.title")}</h2>
        <p className="mt-0.5 text-xs text-gray-600">{t("pages.voiceCallTimeline.sub")}</p>
      </header>

      {loading ? (
        <ul className="space-y-2" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </ul>
      ) : error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Couldn&apos;t load voice calls: {error}
        </div>
      ) : calls.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-600">{t("pages.voiceCallTimeline.empty")}</div>
      ) : (
        <ol className="divide-y divide-slate-100">
          {calls.map((c) => (
            <li key={c.callSid} className="py-2.5">
              <CallRow entry={c} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function CallRow({ entry }: { entry: VoiceCallEntry }) {
  const { t } = useTranslation("dashboard");
  const desc = describeStatus(entry.status);
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${TONE_CLASSES[desc.tone]}`}
          >
            {desc.label}
          </span>
          {entry.hasRecording ? (
            <span className="text-[10px] font-medium text-slate-500" title={t("pages.voiceCallTimeline.recording")}>
              ● Rec
            </span>
          ) : null}
        </div>
        <div className="mt-1 text-xs text-slate-700">
          {formatStartedAt(entry.startedAt)}
          {entry.durationSeconds != null ? (
            <span className="text-slate-400"> · {formatDuration(entry.durationSeconds)}</span>
          ) : null}
        </div>
        {entry.errorCode ? (
          <div className="mt-0.5 text-[11px] text-red-700">
            Twilio error code {entry.errorCode}
          </div>
        ) : null}
      </div>
      <div
        className="shrink-0 text-[10px] tabular-nums text-slate-400"
        title={`${entry.transitionCount} status transitions for this call`}
      >
        {entry.transitionCount} steps
      </div>
    </div>
  );
}

function formatStartedAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    // Keep the timeline compact: "Apr 27, 2:02 PM" style. Locale-respecting
    // so eastern + western agents see their local time.
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
