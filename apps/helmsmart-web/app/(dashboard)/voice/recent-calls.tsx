import { Fragment } from "react";
import {
  CalendarCheck,
  CheckCircle2,
  MessageSquare,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  Voicemail,
} from "lucide-react";
import { intlLocale } from "@leadsmart/i18n";
import { RecordingLink } from "@/components/recording-link";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import type { CallOutcome } from "@/lib/voice-stats";

/** One inbound call, already merged across voice_sessions and calls. */
export type RecentCallRow = {
  key: string;
  at: string;
  fromNumber: string;
  outcome: CallOutcome;
  autoReplied: boolean;
  durationSeconds: number | null;
  summary: string | null;
  recordingUrl: string | null;
  transcript: { role: string; content: string }[];
  /** The caller's client record, when the number belongs to one. */
  client: { id: string; name: string | null } | null;
  /** Inside the window the totals above count. */
  inPeriod: boolean;
};

type Translate = (key: string, opts?: Record<string, unknown>) => string;

const OUTCOME_STYLE: Record<CallOutcome, { icon: typeof Phone; circle: string; text: string }> = {
  booked: { icon: CalendarCheck, circle: "bg-emerald-50 text-emerald-600", text: "text-emerald-700" },
  message: { icon: MessageSquare, circle: "bg-indigo-50 text-indigo-500", text: "text-slate-600" },
  missed: { icon: PhoneMissed, circle: "bg-rose-50 text-rose-500", text: "text-rose-600" },
  voicemail: { icon: Voicemail, circle: "bg-amber-50 text-amber-600", text: "text-amber-700" },
  answered: { icon: Phone, circle: "bg-slate-100 text-slate-500", text: "text-slate-600" },
  inProgress: { icon: PhoneCall, circle: "bg-emerald-50 text-emerald-600", text: "text-emerald-700" },
};

function formatDuration(seconds: number, t: Translate): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0
    ? t("receptionist.duration.minutesSeconds", { minutes: m, seconds: s })
    : t("receptionist.duration.seconds", { seconds: s });
}

function timeAgo(iso: string, t: Translate, locale: string, timeZone: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("receptionist.time.justNow");
  if (m < 60) return t("receptionist.time.minutesAgo", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("receptionist.time.hoursAgo", { count: h });
  return new Date(iso).toLocaleDateString(intlLocale(locale), { month: "short", day: "numeric", timeZone });
}

function RowBody({
  row,
  expandable,
  t,
  locale,
  timeZone,
}: {
  row: RecentCallRow;
  expandable: boolean;
  t: Translate;
  locale: string;
  timeZone: string;
}) {
  const style = OUTCOME_STYLE[row.outcome];
  const Icon = style.icon;
  const name = row.client?.name ?? null;

  return (
    <div className="flex items-center gap-4 px-6 py-3">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${style.circle}`}>
        <Icon className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        {row.client ? (
          <a
            href={`/clients/${row.client.id}`}
            className="block truncate text-sm font-medium text-slate-800 hover:text-indigo-600 hover:underline"
          >
            {name ?? row.fromNumber}
          </a>
        ) : (
          <p className="truncate text-sm font-medium text-slate-800">{row.fromNumber}</p>
        )}
        {row.summary ? (
          <p className="text-xs text-slate-500 truncate">{row.summary}</p>
        ) : name ? (
          <p className="text-xs text-slate-400">{row.fromNumber}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {row.autoReplied && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            {t("receptionist.calls.textedBack")}
          </span>
        )}
        {row.durationSeconds ? (
          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-mono">
            {formatDuration(row.durationSeconds, t)}
          </span>
        ) : null}
        {row.recordingUrl ? <RecordingLink href={row.recordingUrl} /> : null}
        <div className="text-right">
          <p className={`text-xs font-medium ${style.text}`}>{t(`receptionist.calls.outcome.${row.outcome}`)}</p>
          <p className="text-xs text-slate-400">{timeAgo(row.at, t, locale, timeZone)}</p>
        </div>
        {expandable && <span className="text-slate-300 group-open:rotate-90 transition-transform">›</span>}
      </div>
    </div>
  );
}

/**
 * Every inbound call, once — whether the AI picked it up, it went to voicemail,
 * or the missed-call text-back caught it. Rows the totals above don't count
 * (older than the window) sit under a divider that says so.
 */
export async function RecentCalls({
  rows,
  periodDays,
  timeZone,
}: {
  rows: RecentCallRow[];
  periodDays: number;
  timeZone: string;
}) {
  const t = await getServerT("voice");
  const locale = await getServerLocale();
  const firstOlder = rows.findIndex((r) => !r.inPeriod);

  return (
    <section className="bg-white rounded-xl border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700">{t("receptionist.calls.title")}</h2>
        {rows.length > 0 && (
          <p className="text-xs text-slate-500 mt-0.5">
            {t("receptionist.calls.caption", { count: rows.length, days: periodDays })}
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <PhoneIncoming className="w-8 h-8 text-slate-300 mb-2" />
          <p className="text-xs font-medium text-slate-500 mb-1">{t("receptionist.calls.emptyTitle")}</p>
          <p className="text-xs text-slate-400 mb-3">{t("receptionist.calls.emptyBody")}</p>
          <a href="/settings#voice-agent" className="text-xs font-medium text-indigo-600 hover:underline">
            {t("receptionist.calls.setupLink")}
          </a>
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {rows.map((row, i) => {
            const expandable = row.transcript.length > 0;
            const body = <RowBody row={row} expandable={expandable} t={t} locale={locale} timeZone={timeZone} />;
            return (
              <Fragment key={row.key}>
                {i === firstOlder && (
                  <p className="px-6 py-2 bg-slate-50 text-xs text-slate-500">
                    {t("receptionist.calls.olderDivider", { days: periodDays })}
                  </p>
                )}
                {expandable ? (
                  <details className="group">
                    <summary className="cursor-pointer hover:bg-slate-50 list-none [&::-webkit-details-marker]:hidden">
                      {body}
                    </summary>
                    <div className="px-6 pb-4 space-y-2 bg-slate-50/50">
                      {row.transcript.map((msg, j) => (
                        <div key={j} className={`flex gap-2 ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
                          <div
                            className={`max-w-sm rounded-xl px-3 py-2 text-sm ${
                              msg.role === "user"
                                ? "bg-white border border-slate-200 text-slate-700"
                                : "bg-indigo-600 text-white"
                            }`}
                          >
                            <p className="text-xs font-semibold mb-0.5 opacity-60">
                              {msg.role === "user" ? t("receptionist.calls.caller") : t("receptionist.calls.agent")}
                            </p>
                            {msg.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : (
                  body
                )}
              </Fragment>
            );
          })}
        </div>
      )}
    </section>
  );
}
