"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

type CalendarEventRow = {
  id: string;
  title: string;
  starts_at: string;
  status: string;
  calendar_provider: string | null;
};

type BookingLinkRow = {
  id: string;
  booking_url: string;
  label: string | null;
  created_at: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function defaultTomorrowMorningLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Appointments + booking links for the lead drawer (same `lead_calendar_events` / `lead_booking_links` as mobile).
 */
export default function LeadCalendarBookingPanel({ leadId }: { leadId: string }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [links, setLinks] = useState<BookingLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [startsLocal, setStartsLocal] = useState("");
  const [desc, setDesc] = useState("");
  const [bookingUrl, setBookingUrl] = useState("");
  const [bookingLabel, setBookingLabel] = useState("");
  const [savingAppt, setSavingAppt] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setStartsLocal(defaultTomorrowMorningLocal());
  }, []);

  const reload = useCallback(async () => {
    setErr(null);
    try {
      const [eRes, lRes] = await Promise.all([
        fetch(`/api/dashboard/calendar/events?leadId=${encodeURIComponent(leadId)}`, {
          credentials: "include",
        }),
        fetch(`/api/dashboard/calendar/booking-links?leadId=${encodeURIComponent(leadId)}`, {
          credentials: "include",
        }),
      ]);
      const eJson = (await eRes.json().catch(() => ({}))) as { ok?: boolean; error?: string; events?: CalendarEventRow[] };
      const lJson = (await lRes.json().catch(() => ({}))) as { ok?: boolean; error?: string; links?: BookingLinkRow[] };
      if (!eRes.ok || !eJson.ok) throw new Error(eJson.error ?? "Could not load appointments.");
      if (!lRes.ok || !lJson.ok) throw new Error(lJson.error ?? "Could not load booking links.");
      setEvents(eJson.events ?? []);
      setLinks(lJson.links ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Load failed.");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  async function addAppointment() {
    const t = title.trim();
    if (!t || !startsLocal) return;
    setSavingAppt(true);
    setErr(null);
    try {
      const startsAt = new Date(startsLocal).toISOString();
      const res = await fetch("/api/dashboard/calendar/events", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          title: t,
          description: desc.trim() || null,
          startsAt,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not save appointment.");
      setTitle("");
      setDesc("");
      await reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSavingAppt(false);
    }
  }

  async function cancelEvent(eventId: string) {
    setBusyId(eventId);
    setErr(null);
    try {
      const res = await fetch(`/api/dashboard/calendar/events/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not cancel.");
      await reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Cancel failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveBookingLink() {
    const u = bookingUrl.trim();
    if (!u) return;
    setSavingLink(true);
    setErr(null);
    try {
      const res = await fetch("/api/dashboard/calendar/booking-link", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          bookingUrl: u,
          label: bookingLabel.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not save link.");
      setBookingUrl("");
      setBookingLabel("");
      await reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSavingLink(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <div className="text-sm font-semibold text-slate-900">{t("pages.calendarBooking.heading")}</div>
      <p className="text-xs text-slate-600">{t("pages.calendarBooking.storedNote")}</p>

      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{err}</div>
      ) : null}

      {loading ? (
        <div className="text-xs text-slate-500">{t("pages.calendarBooking.loading")}</div>
      ) : (
        <>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{t("pages.calendarBooking.upcoming")}</div>
            {events.length === 0 ? (
              <div className="text-xs text-slate-500">{t("pages.calendarBooking.noneScheduled")}</div>
            ) : (
              <ul className="space-y-2">
                {events.map((ev) => (
                  <li
                    key={ev.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">{ev.title}</div>
                      <div className="text-xs text-slate-600">
                        {new Date(ev.starts_at).toLocaleString(locale)}
                        {ev.calendar_provider ? ` · ${ev.calendar_provider}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === ev.id}
                      onClick={() => void cancelEvent(ev.id)}
                      className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      {busyId === ev.id ? "…" : t("pages.calendarBooking.cancel")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-2">
            <div className="text-xs font-semibold text-slate-700">{t("pages.calendarBooking.newAppointment")}</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("pages.calendarBooking.title")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="datetime-local"
              value={startsLocal}
              onChange={(e) => setStartsLocal(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder={t("pages.calendarBooking.notes")}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={savingAppt || !title.trim()}
              onClick={() => void addAppointment()}
              className="w-full rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-white hover:bg-[#005ca8] disabled:opacity-50"
            >
              {savingAppt ? t("pages.calendarBooking.saving") : t("pages.calendarBooking.add")}
            </button>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{t("pages.calendarBooking.bookingLinks")}</div>
            {links.length === 0 ? (
              <div className="text-xs text-slate-500">{t("pages.calendarBooking.noneSaved")}</div>
            ) : (
              <ul className="space-y-2">
                {links.map((lk) => (
                  <li key={lk.id} className="rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2">
                    <div className="text-xs font-semibold text-emerald-900">{lk.label ?? t("pages.leadCalendarBooking.schedulingLink")}</div>
                    <a
                      href={lk.booking_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-emerald-800 underline break-all"
                    >
                      {lk.booking_url}
                    </a>
                    <div className="text-[11px] text-emerald-700/80 mt-1">
                      {t("pages.calendarBooking.savedAt", { date: new Date(lk.created_at).toLocaleString(locale) })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-2">
            <div className="text-xs font-semibold text-slate-700">{t("pages.calendarBooking.saveBookingLink")}</div>
            <input
              value={bookingUrl}
              onChange={(e) => setBookingUrl(e.target.value)}
              placeholder={t("pages.calendarBooking.urlPlaceholder")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={bookingLabel}
              onChange={(e) => setBookingLabel(e.target.value)}
              placeholder={t("pages.calendarBooking.labelOptional")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={savingLink || !bookingUrl.trim()}
              onClick={() => void saveBookingLink()}
              className="w-full rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {savingLink ? t("pages.calendarBooking.saving") : t("pages.calendarBooking.saveLink")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
