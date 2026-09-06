"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import { Clock, Mail, MessageSquare, Phone, X } from "lucide-react";

type ScheduledAction = {
  id: string;
  channel: "call" | "sms" | "email";
  purpose: "follow_up" | "survey" | "promo";
  count: number;
  subject: string | null;
  scheduledFor: string;
  status: "scheduled" | "sending" | "sent" | "failed" | "cancelled";
  sentAt: string | null;
  result: {
    sent?: number;
    failed?: number;
    total?: number;
    /** Per-contact outcomes — where the drain records WHY one failed. */
    results?: Array<{ id?: string; ok?: boolean; error?: string }>;
  } | null;
};

const CHANNEL_ICON = { call: Phone, sms: MessageSquare, email: Mail } as const;
const CHANNEL_NOUN = { call: "pages.outreachStrip.channelCall", sms: "pages.outreachStrip.channelSms", email: "pages.outreachStrip.channelEmail" } as const;
const PURPOSE_LABEL = { follow_up: "pages.outreachStrip.purposeFollowUp", survey: "pages.outreachStrip.purposeSurvey", promo: "pages.outreachStrip.purposePromo" } as const;
const STATUS_BADGE: Record<ScheduledAction["status"], { label: string; cls: string }> = {
  scheduled: { label: "pages.outreachStrip.statusScheduled", cls: "bg-blue-50 text-blue-700" },
  sending: { label: "pages.outreachStrip.statusSending", cls: "bg-sky-50 text-sky-700" },
  sent: { label: "pages.outreachStrip.statusSent", cls: "bg-emerald-50 text-emerald-700" },
  failed: { label: "pages.outreachStrip.statusFailed", cls: "bg-red-50 text-red-700" },
  cancelled: { label: "pages.outreachStrip.statusCancelled", cls: "bg-slate-100 text-slate-500" },
};

function fmtWhen(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * "Scheduled & recent actions" strip for the Sales Assistant page — upcoming
 * queued outreach (with cancel) plus recently-run actions. Refetches whenever
 * `refreshSignal` changes (e.g. after the composer schedules something).
 */
export default function OutreachScheduledStrip({ refreshSignal }: { refreshSignal?: number }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [actions, setActions] = useState<ScheduledAction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/outreach/scheduled");
      const data = (await res.json()) as { actions?: ScheduledAction[] };
      setActions(Array.isArray(data.actions) ? data.actions : []);
    } catch {
      setActions([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  const cancel = useCallback(
    async (id: string) => {
      setCancelling(id);
      try {
        await fetch(`/api/dashboard/outreach/scheduled/${id}`, { method: "DELETE" });
        await load();
      } finally {
        setCancelling(null);
      }
    },
    [load],
  );

  // Hide entirely until there's something to show — keeps the page clean.
  if (!loaded || actions.length === 0) return null;

  const upcoming = actions
    .filter((a) => a.status === "scheduled" || a.status === "sending")
    .sort((a, b) => +new Date(a.scheduledFor) - +new Date(b.scheduledFor));
  const recent = actions.filter((a) => !["scheduled", "sending"].includes(a.status)).slice(0, 6);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Clock className="h-4 w-4 text-slate-400" strokeWidth={2} />
        <h2 className="text-sm font-semibold text-slate-900">{t("pages.outreachStrip.title")}</h2>
      </div>

      <div className="space-y-1.5">
        {upcoming.map((a) => (
          <Row key={a.id} a={a} onCancel={cancel} cancelling={cancelling === a.id} />
        ))}
        {recent.map((a) => (
          <Row key={a.id} a={a} onCancel={cancel} cancelling={false} />
        ))}
      </div>
    </section>
  );
}

function Row({
  a,
  onCancel,
  cancelling,
}: {
  a: ScheduledAction;
  onCancel: (id: string) => void;
  cancelling: boolean;
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const Icon = CHANNEL_ICON[a.channel];
  const badge = STATUS_BADGE[a.status];
  // `t(...)`, like every sibling label. CHANNEL_NOUN holds translation KEYS, and
  // this one was interpolated raw — the row read "1 pages.outreachStrip.channelCall".
  const noun = t(CHANNEL_NOUN[a.channel], { count: a.count });
  const when = a.status === "sent" || a.status === "failed" ? a.sentAt ?? a.scheduledFor : a.scheduledFor;
  /**
   * Why it failed, not just that it did.
   *
   * A call to a contact with no phone number came back as a bare red "Failed"
   * while the actual reason — "Invalid phone number." — sat unread in the
   * result JSON. The first distinct error stands in for the batch; the count
   * carries the rest.
   */
  const failureNote =
    a.status === "failed" || (a.result?.failed ?? 0) > 0
      ? (a.result?.results ?? []).find((r) => !r.ok && r.error)?.error ?? null
      : null;
  const resultNote =
    a.status === "sent" && a.result
      ? a.result.failed
        ? ` · ${a.result.sent ?? 0} ok, ${a.result.failed} failed`
        : ` · ${a.result.sent ?? a.count} sent`
      : "";
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-50 px-3 py-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2} />
      <span className="min-w-0 flex-1 truncate text-xs text-slate-700">
        <span className="font-medium text-slate-900">
          {a.count} {noun}
        </span>{" "}
        · {t(PURPOSE_LABEL[a.purpose])}
        <span className="text-slate-400">{resultNote}</span>
        {failureNote ? <span className="text-red-600"> · {failureNote}</span> : null}
      </span>
      <span className="shrink-0 text-[11px] text-slate-400">{fmtWhen(when, locale)}</span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
        {t(badge.label)}
      </span>
      {a.status === "scheduled" && (
        <button
          type="button"
          onClick={() => onCancel(a.id)}
          disabled={cancelling}
          aria-label={t("pages.outreachStrip.cancelScheduled")}
          title={t("pages.outreachStrip.cancel")}
          className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
