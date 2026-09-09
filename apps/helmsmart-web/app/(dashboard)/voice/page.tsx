import { ResponsibleEmployee } from "@/components/responsible-employee";
import { PageTitle } from "@/components/page-title";
import { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { Phone, MessageSquare, Calendar, Bot, Clock, DollarSign, Settings } from "lucide-react";
import { intlLocale } from "@leadsmart/i18n";
import { MissedCallTextBack } from "@/components/missed-call-text-back";
import { RecordingLink } from "@/components/recording-link";
import { RoiCounter } from "@/components/roi-counter";
import { getServerLocale, getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("voice");
  return { title: t("meta.receptionist") };
}

const RETELL_COST_PER_MINUTE = 0.10; // USD — billed to customers at $0.10/min (Retell cost ~$0.07)

type Translate = (key: string, opts?: Record<string, unknown>) => string;

function formatDuration(seconds: number | null | undefined, t: Translate): string {
  if (!seconds) return t("receptionist.duration.none");
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0
    ? t("receptionist.duration.minutesSeconds", { minutes: m, seconds: s })
    : t("receptionist.duration.seconds", { seconds: s });
}

function timeAgo(iso: string, t: Translate, locale: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("receptionist.time.justNow");
  if (m < 60) return t("receptionist.time.minutesAgo", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("receptionist.time.hoursAgo", { count: h });
  return new Date(iso).toLocaleDateString(intlLocale(locale), { month: "short", day: "numeric" });
}

/**
 * AI Receptionist — the INBOUND half of the front desk: Claude answers calls 24/7
 * (books appointments, takes messages, handles FAQs) and texts back missed calls.
 * Outbound calling lives on its own page (AI Client Assistant).
 */
export default async function AiReceptionistPage() {
  const t = await getServerT("voice");
  const locale = await getServerLocale();
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

  const [{ data: org }, { data: sessions }, { data: calls }, { count: autoTexted }, { count: bookedViaSms }] = await Promise.all([
    supabase.from("organizations").select("twilio_number, auto_reply, auto_reply_msg").eq("id", orgId).single(),
    supabase
      .from("voice_sessions")
      .select("id, from_number, messages, status, booked_event_id, summary, duration_seconds, recording_url, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("calls")
      .select(`
        id, from_number, to_number, status, auto_replied, reply_body, called_at, duration_seconds,
        clients(first_name, last_name)
      `)
      .eq("organization_id", orgId)
      .order("called_at", { ascending: false })
      .limit(50),
    // Missed calls that were auto-texted in the last 7 days.
    supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("auto_replied", true)
      .gte("called_at", sevenDaysAgo),
    // SMS conversations that Emma booked in the last 7 days (from real run accounting).
    supabase
      .from("ai_employee_runs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("channel", "sms")
      .filter("outcome->>booked", "eq", "true")
      .gte("started_at", sevenDaysAgo),
  ]);

  const totalSessions = sessions?.length ?? 0;
  const booked  = (sessions ?? []).filter((s) => s.booked_event_id).length;
  const msgLeft = (sessions ?? []).filter(
    (s) =>
      (Array.isArray(s.messages) ? (s.messages as { role: string }[]) : []).some(
        (m) => m?.role === "user",
      ) && !s.booked_event_id,
  ).length;
  const totalSeconds = (sessions ?? []).reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
  const totalMinutes = totalSeconds / 60;
  const estCost = totalMinutes * RETELL_COST_PER_MINUTE;

  const oneDecimal = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const money = new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "USD" });

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <ResponsibleEmployee slug="emma" className="mb-3" />
          <PageTitle base="AI Receptionist" />
          <p className="text-sm text-slate-500 mt-0.5">
            {t("receptionist.subtitle")}
          </p>
        </div>
        <a
          href="/settings#voice-agent"
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 transition-colors shrink-0"
        >
          <Settings className="w-4 h-4" />
          {t("receptionist.settings")}
        </a>
      </div>

      {/* Inbound call stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("receptionist.stats.callsHandled")}</span>
            <Phone className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-semibold text-slate-800 font-mono">{totalSessions}</p>
          <p className="text-xs text-slate-400 mt-0.5">{t("receptionist.stats.allTime")}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("receptionist.stats.appointmentsBooked")}</span>
            <Calendar className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-semibold text-slate-800 font-mono">{booked}</p>
          <p className="text-xs text-slate-400 mt-0.5">{t("receptionist.stats.viaVoiceAgent")}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("receptionist.stats.messagesTaken")}</span>
            <MessageSquare className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-semibold text-slate-800 font-mono">{msgLeft}</p>
          <p className="text-xs text-slate-400 mt-0.5">{t("receptionist.stats.savedToInbox")}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("receptionist.stats.minutesUsed")}</span>
            <Clock className="w-4 h-4 text-violet-400" />
          </div>
          <p className="text-2xl font-semibold text-slate-800 font-mono">
            {totalMinutes >= 60
              ? t("receptionist.stats.hours", { value: oneDecimal.format(totalMinutes / 60) })
              : t("receptionist.stats.minutes", { value: oneDecimal.format(totalMinutes) })}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">{t("receptionist.stats.talkTime")}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("receptionist.stats.estCost")}</span>
            <DollarSign className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-semibold text-slate-800 font-mono">
            {money.format(estCost)}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {t("receptionist.stats.costRate", { rate: money.format(RETELL_COST_PER_MINUTE) })}
          </p>
        </div>
      </div>

      {/* Missed-call recovery ROI */}
      <div className="mb-8">
        <RoiCounter autoTexted={autoTexted ?? 0} bookedViaSms={bookedViaSms ?? 0} />
      </div>

      {/* Missed-call text-back (inbound safety-net) */}
      <div className="mb-8">
        <MissedCallTextBack org={org} calls={calls ?? []} />
      </div>

      {/* Call transcript log */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <Bot className="w-4 h-4 text-indigo-500" />
          <h2 className="text-sm font-semibold text-slate-700">{t("receptionist.transcripts.title")}</h2>
        </div>

        {!sessions?.length ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Phone className="w-8 h-8 text-slate-300 mb-2" />
            <p className="text-xs font-medium text-slate-500 mb-1">{t("receptionist.transcripts.emptyTitle")}</p>
            <p className="text-xs text-slate-400">
              {t("receptionist.transcripts.emptyBody")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {sessions.map((session) => {
              const msgs = Array.isArray(session.messages)
                ? (session.messages as { role: string; content: string }[])
                : [];
              const turns = Math.ceil(msgs.length / 2);
              return (
                <details key={session.id} className="group">
                  <summary className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-slate-50 list-none">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${session.status === "completed" ? "bg-slate-300" : "bg-emerald-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{session.from_number}</p>
                      {session.summary ? (
                        <p className="text-xs text-slate-500 truncate">{session.summary}</p>
                      ) : (
                        <p className="text-xs text-slate-400">{t("receptionist.transcripts.turns", { count: turns })}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {session.booked_event_id && (
                        <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">{t("receptionist.transcripts.appointmentBooked")}</span>
                      )}
                      {session.duration_seconds ? (
                        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-mono">
                          {formatDuration(session.duration_seconds, t)}
                        </span>
                      ) : null}
                      {session.recording_url ? (
                        <RecordingLink href={session.recording_url} />
                      ) : null}
                      <span className="text-xs text-slate-400">{timeAgo(session.created_at, t, locale)}</span>
                      <span className="text-slate-300 group-open:rotate-90 transition-transform">›</span>
                    </div>
                  </summary>
                  <div className="px-6 pb-4 space-y-2 bg-slate-50/50">
                    {msgs.map((msg, i) => (
                      <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-sm rounded-xl px-3 py-2 text-sm ${
                          msg.role === "user"
                            ? "bg-white border border-slate-200 text-slate-700"
                            : "bg-indigo-600 text-white"
                        }`}>
                          <p className="text-xs font-semibold mb-0.5 opacity-60">
                            {msg.role === "user" ? t("receptionist.transcripts.caller") : t("receptionist.transcripts.agent")}
                          </p>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
