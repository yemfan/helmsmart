"use client";

import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { getAssistant } from "@/lib/closeboss/team";
import { AssistantHeader, AssistantKpiCard } from "@/components/closeboss/AssistantPage";
import MissedCallSettingsForm from "@/components/dashboard/MissedCallSettingsForm";
import {
  AssistantCallSettings,
  ReceptionistVoiceForm,
} from "@/components/closeboss/AssistantCallSettings";

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
    const res = await fetch("/api/dashboard/closeboss/receptionist-calls?limit=100")
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
      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("assistants.receptionist.allCalls")}</h2>
          <p className="text-[11px] text-slate-500">{t("assistants.receptionist.doubleClickHint")}</p>
        </div>
        {calls.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            {loading
              ? t("pages.receptionist.loadingCalls")
              : t("pages.receptionist.noCallsYetOnce")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700 text-[11px] uppercase tracking-wide text-slate-500">
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
                      className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800"
                      title={t("tips.callDoubleClick")}
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">
                        {fmtWhen(c.created_at, locale)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                        {callerPhone(c)}
                      </td>
                      <td className="max-w-[10rem] truncate px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                        {c.contact_name ?? t("assistants.unknownCaller")}
                      </td>
                      <td className="max-w-[18rem] truncate px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                        {c.reason}
                      </td>
                      <td className="max-w-[16rem] px-4 py-2.5">
                        {c.actions.length === 0 ? (
                          <span className="text-xs text-slate-500">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {c.actions.map((a, i) => (
                              <span
                                key={`${a.kind}-${i}`}
                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  a.kind === "callback"
                                    ? "bg-[#D4A017]/10 text-[#8a6a0e]"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
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

const VOICE_TABS: { key: VoiceTab; labelKey: string }[] = [
  { key: "inbound", labelKey: "pages.receptionist.inbound" },
  { key: "outbound", labelKey: "pages.receptionist.outbound" },
  { key: "missed", labelKey: "pages.receptionist.missedCall" },
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
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("assistants.receptionist.voicePanel")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600"
            aria-label={t("assistants.common.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1" role="tablist">
          {VOICE_TABS.map((voiceTab) => (
            <button
              key={voiceTab.key}
              type="button"
              role="tab"
              aria-selected={tab === voiceTab.key}
              onClick={() => setTab(voiceTab.key)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                tab === voiceTab.key
                  ? "bg-white dark:bg-slate-900 text-[#0B1F44] shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t(voiceTab.labelKey)}
            </button>
          ))}
        </div>

        {tab === "inbound" && (
          <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.receptionist.inboundTitle")}</h3>
            <p className="mb-4 text-xs text-slate-500">{t("pages.receptionist.inboundSub")}</p>
            <ReceptionistVoiceForm />
          </section>
        )}

        {tab === "outbound" && (
          <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.receptionist.outboundTitle")}</h3>
            <p className="mb-4 text-xs text-slate-500">{t("pages.receptionist.outboundSub")}</p>
            <AssistantCallSettings
              type="receptionist"
              knowledgePlaceholder="What to mention on outbound calls — current listings, your specialties, financing partners, what makes you different…"
              knowledgeHint="What your Receptionist may state as fact on the calls it places. Leave blank to share the inbound knowledge base."
            />
          </section>
        )}

        {tab === "missed" && (
          <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{t("assistants.receptionist.missedCallSettings")}</h3>
            <p className="mb-4 text-xs text-slate-500">{t("pages.receptionist.automationSub")}</p>
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
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
              {call.contact_name ?? t("assistants.unknownCaller")}
            </h3>
            <p className="text-xs text-slate-500">
              {callerPhone(call)} · {call.direction === "inbound" ? t("pages.receptionist.inbound") : t("pages.receptionist.outbound")} ·{" "}
              {fmtWhen(call.created_at, locale)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600"
            aria-label={t("assistants.common.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
            {badge.label}
          </span>
          {duration && <span className="text-xs text-slate-500">{duration}</span>}
        </div>

        <div className="mt-4 space-y-4 text-sm">
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("pages.receptionist.callReason")}</h4>
            <p className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-300">{call.reason}</p>
          </section>

          {call.actions.length > 0 && (
            <section>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("pages.receptionist.whatItDid")}</h4>
              <ul className="mt-1 space-y-1">
                {call.actions.map((a, i) => (
                  <li key={`${a.kind}-${i}`} className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
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
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("pages.dashFragments.textBackSent")}{call.textback_status ? ` · ${call.textback_status}` : ""}
              </h4>
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 dark:bg-slate-900/60 p-3 text-xs text-slate-700 dark:text-slate-300">
                {call.textback_message ?? t("pages.receptionist.messageBodyUnavailable")}
              </p>
            </section>
          )}

          {call.callback && (
            <section>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("pages.receptionist.callbackSchedule")}</h4>
              <p className="mt-1 text-slate-700 dark:text-slate-300">
                {call.callback.status === "scheduled" &&
                  `${call.callback.attempts} of 3 attempts placed — next one ${
                    call.callback.next_attempt_at ? `at ${fmtWhen(call.callback.next_attempt_at, locale)}` : "soon"
                  }. Your Receptionist keeps calling at 5, 10, and 30 minutes until they answer.`}
                {call.callback.status === "answered" &&
                  `Reached after ${Math.max(call.callback.attempts, 1)} call-back${call.callback.attempts === 1 ? "" : "s"}.`}
                {call.callback.status === "exhausted" &&
                  t("pages.receptionist.all3CallBacks")}
                {call.callback.status === "cancelled" && t("pages.receptionist.callBacksWereCancelled")}
              </p>
            </section>
          )}

          {call.contact_id && (
            <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
              <Link
                href={`/dashboard/leads/${call.contact_id}`}
                className="text-xs font-medium text-[#0B1F44] underline-offset-2 hover:underline"
              >
                {t("pages.receptionist.openContactProfile")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
