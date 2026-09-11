import { TrendingUp, PhoneMissed, MessageSquare, CalendarCheck } from "lucide-react";
import { intlLocale } from "@leadsmart/i18n";
import { getServerLocale, getServerT } from "@/lib/i18n/server";

type Props = {
  /** Missed, voicemail, or hung up before speaking — lib/voice-stats classifyCall. */
  missed: number | null;
  /** Of those, the ones the auto-reply texted (calls.auto_replied). */
  autoTexted: number | null;
  /** SMS conversations Emma booked (ai_employee_runs.outcome.booked). */
  bookedViaSms: number | null;
  periodDays: number;
};

/**
 * The missed-call → text → booked funnel, over the same window and the same
 * definition of "missed" as the stat cards above it on /voice. A null is a
 * count that failed to load, shown as a dash rather than a zero that would
 * read as real.
 */
export async function RoiCounter({ missed, autoTexted, bookedViaSms, periodDays }: Props) {
  const t = await getServerT("voice");
  const locale = await getServerLocale();
  const num = new Intl.NumberFormat(intlLocale(locale));
  const dash = t("receptionist.duration.none");
  const show = (n: number | null) => (n === null ? dash : num.format(n));
  const texted = autoTexted ?? 0;
  const booked = bookedViaSms ?? 0;
  const pct = texted > 0 ? Math.round((booked / texted) * 100) : 0;

  const cards = [
    { label: t("roi.missed"), icon: <PhoneMissed className="w-4 h-4 text-rose-400" />, value: show(missed), sub: t("roi.missedSub") },
    { label: t("roi.autoTexted"), icon: <MessageSquare className="w-4 h-4 text-indigo-400" />, value: show(autoTexted), sub: t("roi.autoTextedSub") },
    { label: t("roi.booked"), icon: <CalendarCheck className="w-4 h-4 text-emerald-400" />, value: show(bookedViaSms), sub: t("roi.bookedSub") },
    {
      label: t("roi.conversion"),
      icon: <TrendingUp className="w-4 h-4 text-indigo-400" />,
      value: autoTexted === null || bookedViaSms === null || texted === 0 ? dash : `${pct}%`,
      sub:
        texted === 0
          ? t("roi.noTextsYet")
          : t("roi.conversionSub", { booked: num.format(booked), total: num.format(texted), count: texted }),
    },
  ];

  return (
    <div>
      <p className="text-xs text-slate-500 mb-3">{t("receptionist.period", { count: periodDays })}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{c.label}</span>
              {c.icon}
            </div>
            <p className="text-2xl font-semibold text-slate-800 font-mono">{c.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
