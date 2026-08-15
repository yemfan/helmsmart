"use client";

import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { getAssistant } from "@/lib/realtyboss/team";
import { AssistantHeader, AssistantKpiCard } from "@/components/realtyboss/AssistantPage";
import MissedCallSettingsForm from "@/components/dashboard/MissedCallSettingsForm";
import {
  AssistantCallSettings,
  ReceptionistVoiceForm,
} from "@/components/realtyboss/AssistantCallSettings";

/**
 * /dashboard/ai-receptionist — the ONE Receptionist page.
 *
 * Everything the Receptionist does lives here: the full call list
 * (answered, missed + text-back, call-backs), what action each call
 * produced, and — folded into collapsibles — call settings and the
 * manual outbound-call tools. Double-click a row for full details.
 */

type CallAction = {
  kind:
    | "contact_created"
    | "appointment_set"
    | "task_created"
    | "textback_sent"
    | "callback"
    | "personal_reminder";
  label: string;
  href?: string;
};

type CallbackState = {
  status: "scheduled" | "answered" | "exhausted" | "cancelled";
  attempts: number;
  next_attempt_at: string | null;
};

type ReceptionistCall = {
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
  reason: string;
  actions: CallAction[];
  callback: CallbackState | null;
};

const assistant = getAssistant("receptionist");

/** Keys, not labels — module scope has no hook; statusBadge resolves them. */
const STATUS_LABELS: Record<string, { key: string; cls: string }> = {
  completed: { key: "answered", cls: "bg-emerald-50 text-emerald-700" },
  in_progress: { key: "inProgress", cls: "bg-sky-50 text-sky-700" },
  missed: { key: "missed", cls: "bg-amber-50 text-amber-700" },
  no_answer: { key: "noAnswer", cls: "bg-amber-50 text-amber-700" },
  busy: { key: "busy", cls: "bg-amber-50 text-amber-700" },
  voicemail: { key: "voicemail", cls: "bg-slate-100 text-slate-600" },
  initiated: { key: "dialing", cls: "bg-sky-50 text-sky-700" },
  failed: { key: "failed", cls: "bg-red-50 text-red-700" },
};

function statusBadge(status: string, t: (k: string) => string) {
  const hit = STATUS_LABELS[status];
  return hit
    ? { label: t(`assistants.receptionist.status.${hit.key}`), cls: hit.cls }
    : { label: status.replace(/_/g, " "), cls: "bg-slate-100 text-slate-600" };
}

function fmtWhen(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDuration(s: number | null) {
  if (s == null) return null;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

function callerPhone(c: ReceptionistCall) {
  return (c.direction === "inbound" ? c.from_phone : c.to_phone) ?? "—";
}

export default function ReceptionistClient() {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [calls, setCalls] = useState<ReceptionistCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ReceptionistCall | null>(null);
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/dashboard/realtyboss/receptionist-calls?limit=100")
      .then((r) => r.json())
      .catch(() => ({}));
    setCalls((res?.calls ?? []) as ReceptionistCall[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const todayMidnight = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  }, []);

  const answeredToday = calls.filter(
    (c) =>
      c.direction === "inbound" &&
      c.status === "completed" &&
      new Date(c.created_at).getTime() >= todayMidnight,
  );
  const recovered = calls.filter(
    (c) =>
      c.direction === "inbound" &&
      c.status === "missed" &&
      (c.textback_sent || c.callback?.status === "answered"),
  );
  const callingBack = calls.filter((c) => c.status === "missed" && c.callback?.status === "scheduled");
  const needsYou = calls.filter(
    (c) =>
      c.direction === "inbound" &&
      c.status === "missed" &&
      (c.callback?.status === "exhausted" || (!c.textback_sent && !c.callback)),
  );

  return (
    <div className="space-y-4">
      <AssistantHeader
        assistant={assistant}
        actions={[{ label: t("assistants.common.voiceSettings"), onClick: () => setVoiceSettingsOpen(true) }]}
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <AssistantKpiCard label={t("assistants.receptionist.stats.answered")} value={loading ? undefined : answeredToday.length} />
        <AssistantKpiCard
          label={t("assistants.receptionist.stats.recovered")}
          value={loading ? undefined : recovered.length}
          hint={t("assistants.hints.textback")}
        />
        <AssistantKpiCard
          label={t("assistants.receptionist.stats.callingBack")}
          value={loading ? undefined : callingBack.length}
          hint={t("assistants.hints.autoCallbacks")}
        />
        <AssistantKpiCard
          label={t("assistants.receptionist.stats.needingYou")}
          value={loading ? undefined : needsYou.length}
          tone={needsYou.length > 0 ? "warn" : undefined}
        />
      </div>

      {/* The call list */}
      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">{t("assistants.receptionist.allCalls")}</h2>
          <p className="text-[11px] text-gray-400">{t("assistants.receptionist.doubleClickHint")}</p>
        </div>
        {calls.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">
            {loading
              ? "Loading calls…"
              : "No calls yet. Once your AI Receptionist starts answering, every call shows up here."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-2 font-medium">{t("assistants.receptionist.columns.when")}</th>
                  <th className="px-4 py-2 font-medium">{t("assistants.receptionist.columns.phone")}</th>
                  <th className="px-4 py-2 font-medium">{t("assistants.receptionist.columns.name")}</th>
                  <th className="px-4 py-2 font-medium">{t("assistants.receptionist.columns.reason")}</th>
                  <th className="px-4 py-2 font-medium">{t("assistants.receptionist.columns.action")}</th>
                  <th className="px-4 py-2 font-medium">{t("assistants.receptionist.columns.status")}</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => {
                  const badge = statusBadge(c.status, t);
                  return (
                    <tr
                      key={c.id}
                      onDoubleClick={() => setSelected(c)}
                      className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-slate-50"
                      title="Double-click for full call details"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500">
                        {fmtWhen(c.created_at, locale)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-600">
                        {callerPhone(c)}
                      </td>
                      <td className="max-w-[10rem] truncate px-4 py-2.5 font-medium text-gray-900">
                        {c.contact_name ?? t("assistants.unknownCaller")}
                      </td>
                      <td className="max-w-[18rem] truncate px-4 py-2.5 text-xs text-gray-600">
                        {c.reason}
                      </td>
                      <td className="max-w-[16rem] px-4 py-2.5">
                        {c.actions.length === 0 ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {c.actions.map((a, i) => (
                              <span
                                key={`${a.kind}-${i}`}
                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  a.kind === "callback"
                                    ? "bg-[#D4A017]/10 text-[#8a6a0e]"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {a.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && <CallDetailModal call={selected} onClose={() => setSelected(null)} />}
      {voiceSettingsOpen && <VoiceSettingsModal onClose={() => setVoiceSettingsOpen(false)} />}
    </div>
  );
}

type VoiceTab = "inbound" | "outbound" | "missed";

const VOICE_TABS: { key: VoiceTab; label: string }[] = [
  { key: "inbound", label: "Inbound" },
  { key: "outbound", label: "Outbound" },
  { key: "missed", label: "Missed call" },
];

function VoiceSettingsModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [tab, setTab] = useState<VoiceTab>("inbound");
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("assistants.receptionist.voicePanel")}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">{t("assistants.receptionist.voicePanel")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label={t("assistants.common.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1" role="tablist">
          {VOICE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                tab === t.key
                  ? "bg-white text-[#0B1F44] shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "inbound" && (
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-1 text-sm font-semibold text-gray-900">
              Your Receptionist&apos;s voice &amp; knowledge
            </h3>
            <p className="mb-4 text-xs text-gray-500">
              How your Receptionist greets callers and what it knows when it answers your
              phone. Each assistant on your team has its own knowledge base.
            </p>
            <ReceptionistVoiceForm />
          </section>
        )}

        {tab === "outbound" && (
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-1 text-sm font-semibold text-gray-900">
              Outbound voice &amp; knowledge
            </h3>
            <p className="mb-4 text-xs text-gray-500">
              How your Receptionist sounds when it places calls — call-backs and the calls
              you start from &ldquo;Place a call.&rdquo; Leave blank to reuse the inbound
              knowledge base above.
            </p>
            <AssistantCallSettings
              type="receptionist"
              knowledgePlaceholder="What to mention on outbound calls — current listings, your specialties, financing partners, what makes you different…"
              knowledgeHint="What your Receptionist may state as fact on the calls it places. Leave blank to share the inbound knowledge base."
            />
          </section>
        )}

        {tab === "missed" && (
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-1 text-sm font-semibold text-gray-900">{t("assistants.receptionist.missedCallSettings")}</h3>
            <p className="mb-4 text-xs text-gray-500">
              Forward number, missed-call text-back template, AI personalization, and the
              auto call-back ladder for callers you don&apos;t reach by text.
            </p>
            <MissedCallSettingsForm />
          </section>
        )}
      </div>
    </div>
  );
}

function CallDetailModal({ call, onClose }: { call: ReceptionistCall; onClose: () => void }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const badge = statusBadge(call.status, t);
  const duration = fmtDuration(call.duration_seconds);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("assistants.receptionist.callDetails")}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-gray-900">
              {call.contact_name ?? t("assistants.unknownCaller")}
            </h3>
            <p className="text-xs text-gray-500">
              {callerPhone(call)} · {call.direction === "inbound" ? "Inbound" : "Outbound"} ·{" "}
              {fmtWhen(call.created_at, locale)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label={t("assistants.common.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
            {badge.label}
          </span>
          {duration && <span className="text-xs text-gray-500">{duration}</span>}
        </div>

        <div className="mt-4 space-y-4 text-sm">
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Call reason
            </h4>
            <p className="mt-1 whitespace-pre-wrap text-gray-700">{call.reason}</p>
          </section>

          {call.actions.length > 0 && (
            <section>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                What your Receptionist did
              </h4>
              <ul className="mt-1 space-y-1">
                {call.actions.map((a, i) => (
                  <li key={`${a.kind}-${i}`} className="flex items-center gap-2 text-gray-700">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#D4A017]" />
                    {a.href ? (
                      <Link href={a.href} className="text-[#0B1F44] underline-offset-2 hover:underline">
                        {a.label}
                      </Link>
                    ) : (
                      a.label
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {call.textback_sent && (
            <section>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Text-back sent{call.textback_status ? ` · ${call.textback_status}` : ""}
              </h4>
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-gray-700">
                {call.textback_message ?? "Message body unavailable."}
              </p>
            </section>
          )}

          {call.callback && (
            <section>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Call-back schedule
              </h4>
              <p className="mt-1 text-gray-700">
                {call.callback.status === "scheduled" &&
                  `${call.callback.attempts} of 3 attempts placed — next one ${
                    call.callback.next_attempt_at ? `at ${fmtWhen(call.callback.next_attempt_at, locale)}` : "soon"
                  }. Your Receptionist keeps calling at 5, 10, and 30 minutes until they answer.`}
                {call.callback.status === "answered" &&
                  `Reached after ${Math.max(call.callback.attempts, 1)} call-back${call.callback.attempts === 1 ? "" : "s"}.`}
                {call.callback.status === "exhausted" &&
                  "All 3 call-backs placed without an answer — this one needs your personal touch."}
                {call.callback.status === "cancelled" && "Call-backs were cancelled."}
              </p>
            </section>
          )}

          {call.contact_id && (
            <div className="border-t border-gray-100 pt-3">
              <Link
                href={`/dashboard/leads/${call.contact_id}`}
                className="text-xs font-medium text-[#0B1F44] underline-offset-2 hover:underline"
              >
                Open contact profile →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
