import { ResponsibleEmployee } from "@/components/responsible-employee";
import { PageTitle } from "@/components/page-title";
import { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { Phone, MessageSquare, Calendar, Clock, DollarSign, Settings } from "lucide-react";
import { intlLocale } from "@leadsmart/i18n";
import { safeTimezone } from "@repo/voice/datetime";
import { MissedCallTextBack } from "@/components/missed-call-text-back";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { phoneLast10, phoneMatchVariants } from "@/lib/phone";
import {
  VOICE_PERIOD_DAYS,
  VOICE_RATE_CENTS_PER_MINUTE,
  classifyCall,
  mergeCallLog,
  talkMinutes,
  voicePeriodStart,
  type CallLike,
  type SessionLike,
} from "@/lib/voice-stats";
import { loadWindowStats } from "@/lib/voice-window";
import { RecentCalls, type RecentCallRow } from "./recent-calls";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("voice");
  return { title: t("meta.receptionist") };
}

/** How many calls the list shows. No total on the page is computed from it. */
const RECENT_LIMIT = 25;
/** Phone variants per client lookup — keeps the request URL well inside limits. */
const VARIANTS_PER_QUERY = 90;

type Db = Awaited<ReturnType<typeof createClient>>;
type ClientEmbed = { id: string; first_name: string | null; last_name: string | null };
type Transcript = { role: string; content: string }[];

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/** A client's display name — null for the "Caller" placeholder matchOrCreateClient gives a stranger. */
function displayName(c: ClientEmbed): string | null {
  const fn = (c.first_name ?? "").trim();
  const ln = (c.last_name ?? "").trim();
  if (!ln && (!fn || fn.toLowerCase() === "caller")) return null;
  return [fn, ln].filter(Boolean).join(" ");
}

/** Clients whose phone is one of these numbers in any common shape, keyed by last ten digits. */
async function clientsByNumber(db: Db, orgId: string, numbers: string[]): Promise<Map<string, ClientEmbed>> {
  const found = new Map<string, ClientEmbed>();
  const variants = Array.from(new Set(numbers.flatMap(phoneMatchVariants)));
  const chunks: string[][] = [];
  for (let i = 0; i < variants.length; i += VARIANTS_PER_QUERY) chunks.push(variants.slice(i, i + VARIANTS_PER_QUERY));

  const results = await Promise.all(
    chunks.map((chunk) =>
      db.from("clients").select("id, first_name, last_name, phone").eq("organization_id", orgId).in("phone", chunk),
    ),
  );
  for (const result of results) {
    for (const c of (result.data ?? []) as (ClientEmbed & { phone: string | null })[]) {
      const key = phoneLast10(c.phone);
      if (key && !found.has(key)) found.set(key, c);
    }
  }
  return found;
}

function StatCard({ label, icon, value, sub }: { label: string; icon: ReactNode; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-semibold text-slate-800 font-mono">{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
    </div>
  );
}

/**
 * AI Receptionist — the INBOUND half of the front desk: the AI receptionist
 * answers calls 24/7 (books appointments, takes messages, handles FAQs) and
 * texts back missed calls. Outbound calling lives on its own page (AI Client
 * Assistant), and its calls are excluded here.
 *
 * Every number on this page covers the same labelled window (VOICE_PERIOD_DAYS,
 * in the business's timezone) and comes from lib/voice-stats — see that file
 * for which table is authoritative for what.
 */
export default async function AiReceptionistPage() {
  const t = await getServerT("voice");
  const locale = await getServerLocale();
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("twilio_number, auto_reply, timezone, voice_agent_enabled")
    .eq("id", orgId)
    .maybeSingle();
  const timeZone = safeTimezone(org?.timezone);
  const since = voicePeriodStart(timeZone);
  const sinceIso = since.toISOString();

  const [stats, smsBooked, recentSessions, recentCalls] = await Promise.all([
    // The same loader the Marketing overview reads, so the two cannot disagree.
    loadWindowStats(supabase, orgId, since),
    // SMS conversations Emma booked in the window (from real run accounting).
    supabase
      .from("ai_employee_runs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("channel", "sms")
      .filter("outcome->>booked", "eq", "true")
      .gte("started_at", sinceIso),
    supabase
      .from("voice_sessions")
      .select(
        "id, call_sid, from_number, messages, status, booked_event_id, summary, duration_seconds, recording_url, created_at, clients(id, first_name, last_name)",
      )
      .eq("organization_id", orgId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from("calls")
      .select("id, twilio_call_sid, from_number, status, auto_replied, called_at, duration_seconds, clients(id, first_name, last_name)")
      .eq("organization_id", orgId)
      .order("called_at", { ascending: false })
      .limit(RECENT_LIMIT),
  ]);
  const bookedViaSms = smsBooked.error ? null : (smsBooked.count ?? 0);

  // ── The list: the latest calls from both writers, one row per call ─────────
  type RecentSession = Omit<SessionLike, "spoke"> & {
    from_number: string | null;
    messages: unknown;
    summary: string | null;
    recording_url: string | null;
    clients: ClientEmbed | ClientEmbed[] | null;
  };
  type RecentCall = CallLike & {
    from_number: string | null;
    duration_seconds: number | null;
    clients: ClientEmbed | ClientEmbed[] | null;
  };
  const sessions = ((recentSessions.data ?? []) as RecentSession[]).map((s) => {
    const transcript: Transcript = Array.isArray(s.messages) ? (s.messages as Transcript) : [];
    // Same test as lib/voice-window's CALLER_SPOKE, so a row reads the way the totals counted it.
    return { ...s, transcript, spoke: transcript.some((m) => m?.role === "user") };
  });
  const merged = mergeCallLog(sessions, (recentCalls.data ?? []) as RecentCall[]).slice(0, RECENT_LIMIT);

  const numberOf = (r: (typeof merged)[number]) => {
    const n = (r.session?.from_number ?? r.call?.from_number ?? "").trim();
    return n && n !== "unknown" ? n : "";
  };
  const unlinked = merged.filter((r) => !one(r.session?.clients) && !one(r.call?.clients)).map(numberOf).filter(Boolean);
  const byNumber = unlinked.length ? await clientsByNumber(supabase, orgId, unlinked) : new Map<string, ClientEmbed>();

  const rows: RecentCallRow[] = merged.map((r) => {
    const from = numberOf(r);
    const client = one(r.session?.clients) ?? one(r.call?.clients) ?? (from ? byNumber.get(phoneLast10(from)) : undefined) ?? null;
    return {
      key: r.key,
      at: r.at,
      fromNumber: from || t("receptionist.calls.unknownNumber"),
      outcome: classifyCall(r),
      autoReplied: Boolean(r.call?.auto_replied),
      durationSeconds: r.session?.duration_seconds ?? r.call?.duration_seconds ?? null,
      summary: r.session?.summary ?? null,
      recordingUrl: r.session?.recording_url ?? null,
      transcript: r.session?.transcript ?? [],
      client: client ? { id: client.id, name: displayName(client) } : null,
      inPeriod: Date.parse(r.at) >= since.getTime(),
    };
  });

  // ── Formatting ─────────────────────────────────────────────────────────────
  const num = new Intl.NumberFormat(intlLocale(locale));
  const oneDecimal = new Intl.NumberFormat(intlLocale(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const money = new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "USD" });
  const dash = t("receptionist.duration.none");
  const minutes = stats ? talkMinutes(stats.talkSeconds) : 0;

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

      {org && !org.voice_agent_enabled && (
        <p className="mb-6 text-sm text-amber-700">
          {t("receptionist.agentOff")}{" "}
          <a href="/settings#voice-agent" className="font-medium underline">
            {t("receptionist.agentOffLink")}
          </a>
        </p>
      )}

      {/* Inbound call stats — one labelled window */}
      <section className="mb-8">
        <p className="text-xs text-slate-500 mb-3">{t("receptionist.period", { count: VOICE_PERIOD_DAYS })}</p>
        {!stats && (
          <p className="text-xs text-rose-600 mb-3" role="alert">
            {t("receptionist.statsError")}
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard
            label={t("receptionist.stats.answeredByAi")}
            icon={<Phone className="w-4 h-4 text-indigo-400" />}
            value={stats ? num.format(stats.answeredByAi) : dash}
            sub={stats ? t("receptionist.stats.answeredSub", { count: stats.totalCalls, total: num.format(stats.totalCalls) }) : dash}
          />
          <StatCard
            label={t("receptionist.stats.appointmentsBooked")}
            icon={<Calendar className="w-4 h-4 text-emerald-400" />}
            value={stats ? num.format(stats.booked) : dash}
            sub={t("receptionist.stats.bookedSub")}
          />
          <StatCard
            label={t("receptionist.stats.messagesTaken")}
            icon={<MessageSquare className="w-4 h-4 text-amber-400" />}
            value={stats ? num.format(stats.messagesTaken) : dash}
            sub={t("receptionist.stats.messagesSub")}
          />
          <StatCard
            label={t("receptionist.stats.talkTime")}
            icon={<Clock className="w-4 h-4 text-violet-400" />}
            value={
              !stats
                ? dash
                : minutes >= 60
                  ? t("receptionist.stats.hours", { value: oneDecimal.format(minutes / 60) })
                  : t("receptionist.stats.minutes", { value: oneDecimal.format(minutes) })
            }
            sub={t("receptionist.stats.talkSub")}
          />
          <StatCard
            label={t("receptionist.stats.estCost")}
            icon={<DollarSign className="w-4 h-4 text-rose-400" />}
            value={stats ? money.format(stats.estCostCents / 100) : dash}
            sub={t("receptionist.stats.costRate", { rate: money.format(VOICE_RATE_CENTS_PER_MINUTE / 100) })}
          />
        </div>
      </section>

      {/* Missed-call recovery, same window */}
      <div className="mb-8">
        <MissedCallTextBack
          org={org}
          missed={stats?.missed ?? null}
          autoTexted={stats?.autoTexted ?? null}
          bookedViaSms={bookedViaSms}
          periodDays={VOICE_PERIOD_DAYS}
        />
      </div>

      {/* Every inbound call, once */}
      <RecentCalls rows={rows} periodDays={VOICE_PERIOD_DAYS} timeZone={timeZone} />
    </div>
  );
}
