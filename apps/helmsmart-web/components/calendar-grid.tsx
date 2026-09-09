"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Check, Trash2, ChevronDown, Grid3x3, List } from "lucide-react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@leadsmart/i18n";
import { createEvent, toggleEventComplete, deleteEvent } from "@/lib/actions/events";

type EventType = "appointment" | "task" | "meeting" | "reminder";
type EventColor = "indigo" | "emerald" | "rose" | "amber" | "slate";

interface CalEvent {
  id: string;
  title: string;
  type: EventType;
  color: EventColor;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  completed: boolean;
  client_id: string | null;
  clients: { first_name: string | null; last_name: string | null } | null;
}

interface Client {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

const COLOR_CLASSES: Record<EventColor, string> = {
  indigo:  "bg-indigo-100 text-indigo-800 border-l-2 border-indigo-500",
  emerald: "bg-emerald-100 text-emerald-800 border-l-2 border-emerald-500",
  rose:    "bg-rose-100 text-rose-800 border-l-2 border-rose-500",
  amber:   "bg-amber-100 text-amber-800 border-l-2 border-amber-500",
  slate:   "bg-slate-100 text-slate-700 border-l-2 border-slate-400",
};

const EVENT_TYPES: EventType[] = ["appointment", "task", "meeting", "reminder"];

// Dot color shown on the filter chips, one per event type.
const TYPE_DOT: Record<EventType, string> = {
  appointment: "bg-indigo-500",
  task:        "bg-emerald-500",
  meeting:     "bg-violet-500",
  reminder:    "bg-amber-500",
};

const TYPE_FILTERS: ("all" | EventType)[] = ["all", ...EVENT_TYPES];

// Local YYYY-MM-DD for a Date (avoids the UTC shift toISOString would cause).
function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CalendarGrid({ events, clients }: { events: CalEvent[]; clients: Client[] }) {
  const { t, i18n } = useTranslation("tasks");
  const locale = intlLocale(i18n.language);
  const now  = new Date();
  const [viewMode, setViewMode] = useState<"month" | "list">("month");
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", type: "appointment" as EventType, color: "indigo" as EventColor, date: isoDate(now), time: "09:00", duration: 60, allDay: false, clientId: "", description: "" });
  const [isPending, startTransition] = useTransition();
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | EventType>("all");

  // Weekday headers in the reader's language, Sunday first (2024-01-07 was a Sunday).
  const dayHeaders = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Date(Date.UTC(2024, 0, 7 + i)).toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" })
      ),
    [locale]
  );

  const visibleEvents = typeFilter === "all" ? events : events.filter((e) => e.type === typeFilter);

  // Grid helpers
  const firstDay  = new Date(year, month, 1);
  const lastDay   = new Date(year, month + 1, 0);
  const startPad  = firstDay.getDay(); // 0=Sun
  const totalCells = startPad + lastDay.getDate();
  const rows = Math.ceil(totalCells / 7);

  function navigate(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 0)  { m = 11; y--; }
    if (m > 11) { m = 0;  y++; }
    setMonth(m); setYear(y);
  }

  function eventsForDay(day: number) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return visibleEvents.filter((e) => e.start_at.startsWith(iso));
  }

  function openCreate(iso: string) {
    setForm({ title: "", type: "appointment", color: "indigo", date: iso, time: "09:00", duration: 60, allDay: false, clientId: "", description: "" });
    setCreating(true);
  }

  function handleCreate(day: number) {
    openCreate(`${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }

  function submitCreate() {
    if (!form.title.trim() || !form.date) return;
    const startAt = form.allDay
      ? `${form.date}T00:00:00`
      : `${form.date}T${form.time}:00`;
    const endAt = form.allDay
      ? null
      : (() => {
          const [h, m] = form.time.split(":").map(Number);
          const end = new Date(0);
          end.setHours(h, m + form.duration);
          return `${form.date}T${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}:00`;
        })();

    startTransition(async () => {
      await createEvent({
        title: form.title,
        type: form.type,
        color: form.color,
        startAt,
        endAt: endAt ?? undefined,
        allDay: form.allDay,
        clientId: form.clientId || null,
        description: form.description || undefined,
      });
      setCreating(false);
    });
  }

  const monthName = new Date(year, month, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });

  return (
    <div className="flex h-full flex-col">
      {/* Calendar header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">{monthName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openCreate(isoDate(new Date()))}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> {t("calendar.newEvent")}
          </button>
          <button
            onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {t("calendar.today")}
          </button>
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => navigate(1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* View toggle */}
          <div className="ml-2 flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode("month")}
              className={`p-1.5 rounded transition-colors ${
                viewMode === "month"
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
              title={t("calendar.monthView")}
            >
              <Grid3x3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded transition-colors ${
                viewMode === "list"
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
              title={t("calendar.listView")}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Type filter chips */}
      <div className="flex items-center gap-2 px-8 py-3 border-b border-slate-200 bg-white overflow-x-auto">
        {TYPE_FILTERS.map((f) => {
          const active = typeFilter === f;
          return (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                active
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f !== "all" && <span className={`w-2 h-2 rounded-full ${TYPE_DOT[f]}`} />}
              {t(`calendar.filters.${f}`)}
            </button>
          );
        })}
      </div>

      {viewMode === "month" ? (
        <>
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {dayHeaders.map((d) => (
              <div key={d} className="py-2.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">
                {d}
              </div>
            ))}
          </div>

          {/* Month Grid */}
          <div className="flex-1 grid grid-cols-7 overflow-auto bg-white"
               style={{ gridTemplateRows: `repeat(${rows}, minmax(120px, 1fr))` }}>
            {Array.from({ length: rows * 7 }, (_, i) => {
              const day = i - startPad + 1;
              const isValid = day >= 1 && day <= lastDay.getDate();
              const isToday = isValid && year === now.getFullYear() && month === now.getMonth() && day === now.getDate();
              const dayEvents = isValid ? eventsForDay(day) : [];

              return (
                <div
                  key={i}
                  className={`border-b border-r border-slate-100 p-2 min-h-0 flex flex-col group ${!isValid ? "bg-slate-50/50" : "hover:bg-slate-50/50"}`}
                >
                  {isValid && (
                    <>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                          isToday ? "bg-indigo-600 text-white" : "text-slate-500"
                        }`}>
                          {day}
                        </span>
                        <button
                          onClick={() => handleCreate(day)}
                          aria-label={t("calendar.newEvent")}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="space-y-0.5 flex-1 overflow-hidden">
                        {dayEvents.slice(0, 3).map((ev) => (
                          <button
                            key={ev.id}
                            onClick={() => setSelectedEvent(ev)}
                            className={`w-full text-left px-1.5 py-0.5 rounded text-xs truncate ${COLOR_CLASSES[ev.color]} ${ev.completed ? "opacity-50 line-through" : ""}`}
                          >
                            {!ev.all_day && (
                              <span className="opacity-70 mr-1">
                                {new Date(ev.start_at).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}
                              </span>
                            )}
                            {ev.title}
                          </button>
                        ))}
                        {dayEvents.length > 3 && (
                          <button
                            onClick={() => setSelectedEvent(dayEvents[3])}
                            className="w-full text-left text-xs text-slate-400 px-1.5 hover:text-slate-600"
                          >
                            {t("calendar.more", { count: dayEvents.length - 3 })}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        // List View
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {visibleEvents
              .filter((e) => {
                const eDate = new Date(e.start_at);
                return eDate.getFullYear() === year && eDate.getMonth() === month;
              })
              .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime())
              .map((ev) => {
                const startDate = new Date(ev.start_at);
                const endDate = ev.end_at ? new Date(ev.end_at) : null;
                const durationMs = endDate ? endDate.getTime() - startDate.getTime() : 0;
                const durationHours = Math.floor(durationMs / 3600000);
                const durationMins = Math.floor((durationMs % 3600000) / 60000);
                const durationStr = ev.all_day
                  ? t("calendar.allDay")
                  : durationHours > 0
                    ? t("calendar.durationHoursMinutes", { hours: durationHours, minutes: durationMins })
                    : t("calendar.durationMinutes", { minutes: durationMins });
                const timeStr = ev.all_day
                  ? t("calendar.allDay")
                  : startDate.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });

                return (
                  // A div (not button) so the nested "+" button below is valid
                  // HTML — a button inside a button trips a hydration error.
                  <div
                    key={ev.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedEvent(ev)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedEvent(ev); } }}
                    className="flex items-start gap-3 px-6 py-3.5 hover:bg-slate-50 transition-colors text-left w-full group cursor-pointer"
                  >
                    <div className="pt-0.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded inline-block ${COLOR_CLASSES[ev.color]}`}>
                        {t(`calendar.types.${ev.type}`)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium text-slate-900 ${ev.completed ? "line-through opacity-50" : ""}`}>
                        {ev.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {startDate.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })} · {timeStr}
                      </p>
                      {ev.clients && (
                        <p className="text-xs text-slate-400 mt-1">
                          {[ev.clients.first_name, ev.clients.last_name].filter(Boolean).join(" ")}
                        </p>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 flex-shrink-0 pt-0.5">
                      {durationStr}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCreate(startDate.getDate());
                      }}
                      aria-label={t("calendar.newEvent")}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            {visibleEvents.filter((e) => {
              const eDate = new Date(e.start_at);
              return eDate.getFullYear() === year && eDate.getMonth() === month;
            }).length === 0 && (
              <div className="flex-1 flex items-center justify-center text-slate-400">
                <p className="text-sm">{t(`calendar.empty.${typeFilter}`)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create event modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">{t("calendar.modal.title")}</h2>
              <button onClick={() => setCreating(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              <input
                type="text"
                autoFocus
                placeholder={t("calendar.modal.titlePlaceholder")}
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && submitCreate()}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">{t("calendar.modal.date")}</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{t("calendar.modal.type")}</label>
                  <div className="relative">
                    <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as EventType }))}
                      className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-8">
                      {EVENT_TYPES.map((v) => <option key={v} value={v}>{t(`calendar.types.${v}`)}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{t("calendar.modal.color")}</label>
                  <div className="flex gap-2 mt-1.5">
                    {(Object.keys(COLOR_CLASSES) as EventColor[]).map((c) => (
                      <button
                        key={c}
                        onClick={() => setForm((f) => ({ ...f, color: c }))}
                        className={`w-5 h-5 rounded-full border-2 transition-all ${
                          form.color === c ? "border-slate-800 scale-110" : "border-transparent"
                        } bg-${c}-400`}
                        style={{ backgroundColor: { indigo: "#818cf8", emerald: "#34d399", rose: "#fb7185", amber: "#fbbf24", slate: "#94a3b8" }[c] }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={form.allDay} onChange={(e) => setForm((f) => ({ ...f, allDay: e.target.checked }))}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  {t("calendar.modal.allDay")}
                </label>
                {!form.allDay && (
                  <>
                    <input type="time" value={form.time}
                      onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <select value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: Number(e.target.value) }))}
                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      {[15, 30, 45, 60, 90, 120].map((d) => (
                        <option key={d} value={d}>
                          {d < 60
                            ? t("calendar.modal.durationMinutes", { count: d })
                            : t("calendar.modal.durationHours", { count: d / 60 })}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>

              {clients.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{t("calendar.modal.client")}</label>
                  <div className="relative">
                    <select value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                      className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-8">
                      <option value="">{t("calendar.modal.noClient")}</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {[c.first_name, c.last_name].filter(Boolean).join(" ") || t("calendar.modal.unnamed")}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              <textarea rows={2} placeholder={t("calendar.modal.descriptionPlaceholder")} value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setCreating(false)} className="text-sm text-slate-500 hover:text-slate-700">{t("common:actions.cancel")}</button>
              <button onClick={submitCreate} disabled={isPending || !form.title.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                {isPending ? t("common:status.saving") : t("calendar.modal.submit")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event detail popover */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded mb-2 ${COLOR_CLASSES[selectedEvent.color]}`}>
                  {t(`calendar.types.${selectedEvent.type}`)}
                </span>
                <h3 className={`text-base font-semibold text-slate-800 ${selectedEvent.completed ? "line-through opacity-50" : ""}`}>
                  {selectedEvent.title}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedEvent.all_day ? t("calendar.allDay") : new Date(selectedEvent.start_at).toLocaleTimeString(locale, {
                    hour: "numeric", minute: "2-digit", weekday: "short", month: "short", day: "numeric",
                  })}
                </p>
                {selectedEvent.clients && (
                  <p className="text-xs text-slate-500 mt-1">
                    {[selectedEvent.clients.first_name, selectedEvent.clients.last_name].filter(Boolean).join(" ")}
                  </p>
                )}
              </div>
              <button onClick={() => setSelectedEvent(null)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  startTransition(async () => {
                    await toggleEventComplete(selectedEvent.id, !selectedEvent.completed);
                    setSelectedEvent(null);
                  });
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2 border border-slate-200 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-50"
              >
                <Check className="w-4 h-4" />
                {selectedEvent.completed ? t("calendar.detail.reopen") : t("calendar.detail.complete")}
              </button>
              <button
                onClick={() => {
                  if (!confirm(t("calendar.detail.confirmDelete"))) return;
                  startTransition(async () => {
                    await deleteEvent(selectedEvent.id);
                    setSelectedEvent(null);
                  });
                }}
                aria-label={t("common:actions.delete")}
                className="p-2 border border-rose-200 text-rose-500 rounded-lg hover:bg-rose-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
