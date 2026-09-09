import { Phone, PhoneMissed, MessageSquare, CheckCircle2, Settings } from "lucide-react";
import { intlLocale } from "@leadsmart/i18n";
import { getServerLocale, getServerT } from "@/lib/i18n/server";

type CallRow = {
  id: string;
  from_number: string | null;
  status: string | null;
  auto_replied: boolean | null;
  called_at: string;
  clients:
    | { first_name: string | null; last_name: string | null }
    | { first_name: string | null; last_name: string | null }[]
    | null;
};

type Translate = (key: string, opts?: Record<string, unknown>) => string;

function timeAgo(iso: string, t: Translate, locale: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("missedCall.time.justNow");
  if (m < 60) return t("missedCall.time.minutesAgo", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("missedCall.time.hoursAgo", { count: h });
  return new Date(iso).toLocaleDateString(intlLocale(locale), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Missed-call text-back — the inbound safety-net: when a call goes unanswered, the AI
 * Receptionist auto-texts the caller back. Shown as a section inside the AI Receptionist
 * (inbound) page. Display-only; settings live under /settings#operations.
 */
export async function MissedCallTextBack({
  org,
  calls,
}: {
  org: { twilio_number: string | null; auto_reply: boolean | null } | null;
  calls: CallRow[];
}) {
  const t = await getServerT("voice");
  const locale = await getServerLocale();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const missedToday = calls.filter((c) => c.status === "missed" && new Date(c.called_at) >= today).length;
  const repliesThisWeek = (() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return calls.filter((c) => c.auto_replied && new Date(c.called_at) >= weekAgo).length;
  })();

  return (
    <section>
      <div className="flex items-center justify-between mb-3 gap-4">
        <h2 className="text-sm font-semibold text-slate-700">{t("missedCall.title")}</h2>
        <a
          href="/settings#operations"
          className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 transition-colors shrink-0"
        >
          <Settings className="w-3.5 h-3.5" />
          {t("missedCall.settingsLink")}
        </a>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("missedCall.autoReply")}</span>
            <div className={`w-2 h-2 rounded-full ${org?.auto_reply ? "bg-emerald-500" : "bg-slate-300"}`} />
          </div>
          <p className="text-sm font-medium text-slate-700">{org?.auto_reply ? t("missedCall.active") : t("missedCall.off")}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {org?.twilio_number ? org.twilio_number : t("missedCall.noNumber")}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("missedCall.missedToday")}</span>
            <PhoneMissed className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-semibold text-slate-800 font-mono">{missedToday}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {missedToday === 0 ? t("missedCall.noneToday") : t("missedCall.unanswered", { count: missedToday })}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("missedCall.repliesSent")}</span>
            <MessageSquare className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-semibold text-slate-800 font-mono">{repliesThisWeek}</p>
          <p className="text-xs text-slate-400 mt-0.5">{t("missedCall.thisWeek")}</p>
        </div>
      </div>

      {/* Call log */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">{t("missedCall.recentCalls")}</h3>
        </div>

        {!calls.length ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <PhoneMissed className="w-8 h-8 text-slate-300 mb-2" />
            <p className="text-xs font-medium text-slate-500 mb-1">{t("missedCall.emptyTitle")}</p>
            <p className="text-xs text-slate-400">
              {t("missedCall.emptyBody")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {calls.map((call) => {
              const clientsRaw = call.clients;
              const clientRaw = (Array.isArray(clientsRaw) ? clientsRaw[0] : clientsRaw) as { first_name: string | null; last_name: string | null } | null;
              const clientName = clientRaw
                ? [clientRaw.first_name, clientRaw.last_name].filter(Boolean).join(" ")
                : null;

              return (
                <div key={call.id} className="flex items-center gap-4 px-6 py-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    call.status === "missed" ? "bg-rose-100" : "bg-emerald-100"
                  }`}>
                    {call.status === "missed"
                      ? <PhoneMissed className="w-4 h-4 text-rose-500" />
                      : <Phone className="w-4 h-4 text-emerald-500" />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">
                      {clientName ?? call.from_number}
                    </p>
                    {clientName && (
                      <p className="text-xs text-slate-400">{call.from_number}</p>
                    )}
                  </div>

                  {call.auto_replied && (
                    <div className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" />
                      {t("missedCall.autoReplied")}
                    </div>
                  )}

                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-medium ${
                      call.status === "missed" ? "text-rose-600" : "text-emerald-600"
                    }`}>
                      {call.status
                        ? t(`missedCall.status.${call.status}`, { defaultValue: call.status })
                        : t("missedCall.unknownStatus")}
                    </p>
                    <p className="text-xs text-slate-400">{timeAgo(call.called_at, t, locale)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
