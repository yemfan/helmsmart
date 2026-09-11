"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@leadsmart/i18n";
import { ChevronLeft, Check, Calendar, Clock, User } from "lucide-react";
import { createEvent } from "@/lib/actions/events";
import { addDays, calendarDate } from "@/lib/org-date";
import type { BusinessHours, AppointmentType } from "@/lib/receptionist";
import { rich } from "../../_rich";

type DayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

const JS_DAY_TO_KEY: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

interface TimeSlot {
  date: string;
  startAt: string;
  endAt: string;
}

interface Client {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
}

interface ExistingEvent {
  start_at: string;
  end_at: string | null;
}

function computeSlots(
  timeZone: string,
  hours: BusinessHours,
  events: ExistingEvent[],
  durationMinutes: number
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  // The next 14 days of the business's calendar. Each date and its weekday come
  // from the same string: a local Date run through toISOString() gave, every US
  // evening, tomorrow's date under today's opening hours.
  const today = calendarDate(timeZone);

  for (let i = 1; i <= 14; i++) {
    const dateStr = addDays(today, i);
    const dayKey = JS_DAY_TO_KEY[new Date(`${dateStr}T12:00:00Z`).getUTCDay()];
    const bh = hours[dayKey];
    if (!bh) continue;

    const [oH, oM] = bh.open.split(":").map(Number);
    const [cH, cM] = bh.close.split(":").map(Number);
    let cur = oH * 60 + oM;
    const close = cH * 60 + cM;

    while (cur + durationMinutes <= close) {
      const sH = String(Math.floor(cur / 60)).padStart(2, "0");
      const sM = String(cur % 60).padStart(2, "0");
      const eMin = cur + durationMinutes;
      const eH = String(Math.floor(eMin / 60)).padStart(2, "0");
      const eMStr = String(eMin % 60).padStart(2, "0");
      const startAt = `${dateStr}T${sH}:${sM}:00`;
      const endAt = `${dateStr}T${eH}:${eMStr}:00`;

      const conflict = events.some(
        (e) => startAt < (e.end_at ?? e.start_at) && endAt > e.start_at
      );
      if (!conflict) slots.push({ date: dateStr, startAt, endAt });
      cur += durationMinutes;
    }
  }
  return slots;
}

function fmtTime(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(intlLocale(locale), {
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDate(dateStr: string, locale: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(intlLocale(locale), {
    weekday: "short", month: "short", day: "numeric",
  });
}

export function BookClient({
  clients,
  appointmentTypes,
  businessHours,
  existingEvents,
  timeZone,
}: {
  clients: Client[];
  appointmentTypes: AppointmentType[];
  businessHours: BusinessHours;
  existingEvents: ExistingEvent[];
  /** `organizations.timezone` — which days count as the next two weeks. */
  timeZone: string;
}) {
  const { t, i18n } = useTranslation("site");
  const locale = i18n.language;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const defaultType = appointmentTypes[0] ?? null;
  const [selectedType, setSelectedType] = useState<AppointmentType | null>(defaultType);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [step, setStep] = useState<"type" | "client" | "time">(
    appointmentTypes.length > 1 ? "type" : "client"
  );
  const [done, setDone] = useState(false);

  const slots = useMemo(
    () => computeSlots(timeZone, businessHours, existingEvents, selectedType?.duration_minutes ?? 60),
    [timeZone, businessHours, existingEvents, selectedType]
  );

  const slotsByDate = useMemo(
    () =>
      slots.reduce<Record<string, TimeSlot[]>>((acc, s) => {
        if (!acc[s.date]) acc[s.date] = [];
        acc[s.date].push(s);
        return acc;
      }, {}),
    [slots]
  );

  function getClientName(id: string) {
    const c = clients.find((cl) => cl.id === id);
    if (!c) return "";
    return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || "—";
  }

  const duration = (minutes: number) => t("book.duration", { minutes });

  function handleBook() {
    if (!selectedSlot || !selectedClientId) return;
    const client = getClientName(selectedClientId);
    const title = selectedType
      ? t("book.eventTitle", { type: selectedType.name, client })
      : t("book.eventTitleDefault", { client });

    startTransition(async () => {
      await createEvent({
        title,
        type: "appointment",
        color: "indigo",
        startAt: selectedSlot.startAt,
        endAt: selectedSlot.endAt,
        allDay: false,
        clientId: selectedClientId,
      });
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center max-w-sm mx-auto px-6">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{t("book.done.title")}</h2>
          <p className="text-gray-600 text-sm mb-6">
            {t("book.done.summary", {
              date: selectedSlot ? fmtDate(selectedSlot.date, locale) : "",
              time: selectedSlot ? fmtTime(selectedSlot.startAt, locale) : "",
              client: getClientName(selectedClientId),
            })}
          </p>
          <button
            onClick={() => router.push("/calendar")}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
          >
            <Calendar className="w-4 h-4" />
            {t("book.done.viewCalendar")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      {/* Appointment type */}
      {step === "type" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">{t("book.type.title")}</h2>
            <p className="text-gray-600">{t("book.type.subtitle")}</p>
          </div>
          <div className="grid gap-3">
            {appointmentTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => {
                  setSelectedType(type);
                  setSelectedSlot(null);
                  setStep("client");
                }}
                className="p-4 rounded-xl border-2 text-left transition-all border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50"
              >
                <p className="font-semibold text-gray-900">{type.name}</p>
                {type.description && (
                  <p className="text-sm text-gray-500 mt-1">{type.description}</p>
                )}
                <p className="text-xs text-indigo-600 mt-1 font-medium">
                  {duration(type.duration_minutes)}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Client selection */}
      {step === "client" && (
        <div className="space-y-6">
          {appointmentTypes.length > 1 && (
            <button
              onClick={() => setStep("type")}
              className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 font-medium text-sm"
            >
              <ChevronLeft className="w-4 h-4" /> {t("common:actions.back")}
            </button>
          )}
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">{t("book.client.title")}</h2>
            <p className="text-gray-600">{t("book.client.subtitle")}</p>
          </div>
          {clients.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm rounded-xl border border-dashed border-gray-300">
              {rich(t("book.client.empty"), {
                links: [{ href: "/clients", className: "text-indigo-600 hover:underline" }],
              })}
            </div>
          ) : (
            <div className="grid gap-3">
              {clients.map((c) => {
                const name =
                  [c.first_name, c.last_name].filter(Boolean).join(" ") ||
                  c.company ||
                  "—";
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedClientId(c.id);
                      setStep("time");
                    }}
                    className="p-4 rounded-xl border-2 text-left transition-all border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 text-sm font-bold flex-shrink-0">
                        {(name[0] ?? "?").toUpperCase()}
                      </div>
                      <p className="font-semibold text-gray-900">{name}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Time slot selection */}
      {step === "time" && (
        <div className="space-y-6">
          <button
            onClick={() => {
              setStep("client");
              setSelectedSlot(null);
            }}
            className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 font-medium text-sm"
          >
            <ChevronLeft className="w-4 h-4" /> {t("common:actions.back")}
          </button>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">{t("book.time.title")}</h2>
            <p className="text-gray-600">
              {selectedType
                ? rich(
                    t("book.time.subtitle", {
                      type: selectedType.name,
                      duration: duration(selectedType.duration_minutes),
                      client: getClientName(selectedClientId),
                    }),
                    { emClassName: "font-medium text-indigo-600" },
                  )
                : getClientName(selectedClientId)}
            </p>
          </div>

          {Object.keys(slotsByDate).length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm rounded-xl border border-dashed border-gray-300">
              {rich(t("book.time.empty"), {
                links: [{ href: "/voice", className: "text-indigo-600 hover:underline" }],
              })}
            </div>
          ) : (
            <div className="space-y-5">
              {Object.entries(slotsByDate).map(([date, dateSlots]) => (
                <div key={date}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    {fmtDate(date, locale)}
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {dateSlots.map((s) => (
                      <button
                        key={s.startAt}
                        onClick={() => setSelectedSlot(s)}
                        className={`px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                          selectedSlot?.startAt === s.startAt
                            ? "border-indigo-600 bg-indigo-50 text-indigo-900"
                            : "border-gray-200 bg-white text-gray-900 hover:border-indigo-300"
                        }`}
                      >
                        {fmtTime(s.startAt, locale)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedSlot && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-gray-900 mb-2">{t("book.summary.title")}</p>
              <div className="space-y-1 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  {getClientName(selectedClientId)}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  {selectedType
                    ? t("book.summary.whenWithDuration", {
                        date: fmtDate(selectedSlot.date, locale),
                        time: fmtTime(selectedSlot.startAt, locale),
                        duration: duration(selectedType.duration_minutes),
                      })
                    : t("book.summary.when", {
                        date: fmtDate(selectedSlot.date, locale),
                        time: fmtTime(selectedSlot.startAt, locale),
                      })}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => {
                setStep("client");
                setSelectedSlot(null);
              }}
              className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              {t("common:actions.cancel")}
            </button>
            <button
              onClick={handleBook}
              disabled={!selectedSlot || isPending}
              className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? t("book.booking") : t("book.confirm")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
