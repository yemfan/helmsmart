"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, PhoneOutgoing } from "lucide-react";
import { LoadingText } from "@/components/ui/LoadingText";

type Appt = {
  id: string;
  name: string | null;
  phone: string | null;
  startAt: string;
  title: string | null;
  callable: boolean;
};

/**
 * Upcoming appointments (next 48h) + a one-click "Remind all" that has Lucy call
 * each client to remind/confirm (AI reminder call). Mirrors the bulk-call flow.
 */
export default function AppointmentRemindersPanel() {
  const { t } = useTranslation("dashboard");
  const [appts, setAppts] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"idle" | "calling" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/voice/appointment-reminders");
      const data = (await res.json()) as { appointments?: Appt[] };
      setAppts(Array.isArray(data.appointments) ? data.appointments : []);
    } catch {
      setAppts([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function remindAll() {
    if (status === "calling") return;
    setStatus("calling");
    setMessage(null);
    try {
      const res = await fetch("/api/dashboard/voice/appointment-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; placed?: number; failed?: number; total?: number };
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not place reminders.");
      setStatus("done");
      setMessage(`Calling ${data.placed ?? 0} of ${data.total ?? 0} to remind${data.failed ? ` · ${data.failed} skipped` : ""}.`);
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Could not place reminders.");
    }
  }

  const callable = appts.filter((a) => a.callable).length;
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return Number.isFinite(d.getTime())
      ? d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : iso;
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-slate-500" strokeWidth={2} />
          <h2 className="text-sm font-semibold text-slate-900">{t("pages.appointmentReminders.title")}</h2>
        </div>
        <button
          type="button"
          onClick={() => void remindAll()}
          disabled={status === "calling" || callable === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <PhoneOutgoing className="h-3.5 w-3.5" strokeWidth={2} />
          {status === "calling" ? t("common:status.calling") : `Remind all (${callable})`}
        </button>
      </div>
      <p className="mt-0.5 mb-3 text-xs text-slate-500">{t("pages.appointmentReminders.sub")}</p>

      {message && (
        <p className={`mb-2 text-xs font-medium ${status === "error" ? "text-rose-600" : "text-emerald-600"}`}>{message}</p>
      )}

      {loading ? (
        <p className="py-3 text-center text-sm text-slate-400"><LoadingText /></p>
      ) : appts.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">{t("pages.appointmentReminders.empty")}</p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
          {appts.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-slate-800">{a.name || a.phone || "—"}</span>
              <span className="shrink-0 text-xs text-slate-500">{fmt(a.startAt)}</span>
              {!a.callable && <span className="shrink-0 text-[10px] font-medium text-amber-600">{t("pages.appointmentReminders.noPhone")}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
