"use client";

import { useCallback, useEffect, useState } from "react";
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
  result: { sent?: number; failed?: number; total?: number } | null;
};

const CHANNEL_ICON = { call: Phone, sms: MessageSquare, email: Mail } as const;
const CHANNEL_NOUN = { call: "call", sms: "text", email: "email" } as const;
const PURPOSE_LABEL = { follow_up: "Follow-up", survey: "Survey", promo: "Promo" } as const;
const STATUS_BADGE: Record<ScheduledAction["status"], { label: string; cls: string }> = {
  scheduled: { label: "Scheduled", cls: "bg-blue-50 text-blue-700" },
  sending: { label: "Sending", cls: "bg-sky-50 text-sky-700" },
  sent: { label: "Sent", cls: "bg-emerald-50 text-emerald-700" },
  failed: { label: "Failed", cls: "bg-red-50 text-red-700" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-500" },
};

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
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
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Clock className="h-4 w-4 text-gray-400" strokeWidth={2} />
        <h2 className="text-sm font-semibold text-gray-900">Scheduled &amp; recent actions</h2>
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
  const Icon = CHANNEL_ICON[a.channel];
  const badge = STATUS_BADGE[a.status];
  const noun = CHANNEL_NOUN[a.channel];
  const when = a.status === "sent" || a.status === "failed" ? a.sentAt ?? a.scheduledFor : a.scheduledFor;
  const resultNote =
    a.status === "sent" && a.result
      ? a.result.failed
        ? ` · ${a.result.sent ?? 0} ok, ${a.result.failed} failed`
        : ` · ${a.result.sent ?? a.count} sent`
      : "";
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-50 px-3 py-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-gray-400" strokeWidth={2} />
      <span className="min-w-0 flex-1 truncate text-xs text-gray-700">
        <span className="font-medium text-gray-900">
          {a.count} {noun}
          {a.count === 1 ? "" : "s"}
        </span>{" "}
        · {PURPOSE_LABEL[a.purpose]}
        <span className="text-gray-400">{resultNote}</span>
      </span>
      <span className="shrink-0 text-[11px] text-gray-400">{fmtWhen(when)}</span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
        {badge.label}
      </span>
      {a.status === "scheduled" && (
        <button
          type="button"
          onClick={() => onCancel(a.id)}
          disabled={cancelling}
          aria-label="Cancel scheduled action"
          title="Cancel"
          className="shrink-0 rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
