import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadRescheduleTarget, getRescheduleAvailability } from "@/lib/voice-agent/booking";
import { RescheduleSlots } from "./reschedule-slots";

/**
 * Public, unauthenticated reschedule page — the token in the URL is the
 * authorization, and it moves exactly one appointment.
 *
 * CloseBoss's booking confirmation used to say "Call us back if you need to
 * change it" / "如需改期请回电", so the only way to move an appointment was to
 * ring during business hours — the friction the AI receptionist exists to
 * remove, reintroduced at the last step. HelmSmart has had this page since it
 * shipped; this is the same flow for CloseBoss.
 */

export const dynamic = "force-dynamic";

// Never indexed: the URL is a capability token. A search engine holding it
// would be a search engine able to move someone's appointment.
export const metadata: Metadata = {
  title: "Reschedule your appointment",
  robots: { index: false, follow: false },
};

export default async function ReschedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { token } = await params;
  const { date: dateParam } = await searchParams;

  const target = await loadRescheduleTarget(token);
  if (!target) notFound();

  const tz = target.timezone;
  const startMs = new Date(target.startISO).getTime();
  const past = startMs < Date.now();

  const fmtFull = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const currentLabel = fmtFull.format(new Date(target.startISO));

  // Day chips: today + the next 9 days, as dates in the BUSINESS's timezone —
  // a caller in another zone must still pick the day the business is open.
  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const chipFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
  const todayStr = dayFmt.format(new Date());
  const days = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(Date.now() + i * 86_400_000);
    return { value: dayFmt.format(d), label: i === 0 ? "Today" : chipFmt.format(d) };
  });
  const selectedDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayStr;

  const avail = past
    ? { closed: true, durationMinutes: 30, slots: [] as { startISO: string; label: string }[] }
    : await getRescheduleAvailability(target, selectedDate);

  const slotFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const slots = avail.slots.map((s) => ({ startISO: s.startISO, label: slotFmt.format(new Date(s.startISO)) }));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-blue-600 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6">
          <span className="text-base font-bold text-white">{target.brandName}</span>
          <span className="text-sm text-blue-100">Reschedule</span>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-xl font-bold text-slate-800">Reschedule your appointment</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">
          Currently booked for <strong>{currentLabel}</strong>. Pick a new time below.
        </p>

        {past ? (
          // An expired link says so rather than offering times for an
          // appointment that has already happened.
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">
            This appointment has already passed. Call us to book a new one.
          </div>
        ) : (
          <>
            <div className="mb-5 flex gap-2 overflow-x-auto pb-2">
              {days.map((d) => {
                const active = d.value === selectedDate;
                return (
                  <a
                    key={d.value}
                    href={`?date=${d.value}`}
                    className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold no-underline ${
                      active
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    {d.label}
                  </a>
                );
              })}
            </div>

            <RescheduleSlots token={token} slots={slots} />
          </>
        )}

        <p className="mt-10 text-center text-xs text-slate-300">
          Powered by CloseBoss · {target.brandName}
        </p>
      </div>
    </div>
  );
}
