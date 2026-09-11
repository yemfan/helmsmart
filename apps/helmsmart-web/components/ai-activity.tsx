import Link from "next/link";
import { Clock, Plane } from "lucide-react";
import { Avatar, defaultAvatarForSeed } from "@helm/ui";
import { getBlueprint, listEmployees } from "@helm/ai-workforce";
import { intlLocale } from "@leadsmart/i18n";
import { safeTimezone } from "@repo/voice/datetime";
import { createClient } from "@/lib/supabase/server";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import {
  ACTIVITY_WINDOW_DAYS,
  FEED_TEXT_SENDERS,
  buildActivityFeed,
  clientDisplayName,
  type ActivityRow,
  type ActivityWho,
  type ApprovalFeedRow,
  type CallRow,
  type QueueRow,
  type RunRow,
  type SocialPostRow,
  type TextRow,
  type VoiceSessionRow,
} from "@/lib/ai-activity";
import { listExecutedApprovals } from "@/lib/ai-team/approvals";
import { pickDetails } from "@/lib/ai-team/approval-view";

/**
 * "What did my AI do?" — the last week of work the AI team did on the owner's
 * behalf, on the dashboard under the briefing: calls the receptionist answered
 * and booked, calls placed, missed-call and reminder texts, Auto Pilot
 * replies, posts the schedule published, and drafts waiting for approval.
 *
 * Status is text: plain rows in the page's own type, no coloured card. The one
 * exception is a line for something that should have happened and didn't.
 * Self-fetching server component; renders nothing if the feed can't load, so
 * a failure here never takes the dashboard with it.
 */

const SLUGS = ["emma", "sarah", "emily", "alex", "mark", "tim"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function AiActivity({ orgId }: { orgId: string }) {
  if (!orgId) return null;
  const t = await getServerT("home");
  const locale = await getServerLocale();

  let rows: ActivityRow[];
  let receptionistConnected: boolean;
  let timeZone: string;
  const now = new Date();

  try {
    const supabase = await createClient();
    const since = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * 86_400_000).toISOString();

    const [voiceRes, callsRes, postsRes, runsRes, queueRes, textsRes, orgRes, employees, approvalRows, viewer] = await Promise.all([
      supabase
        .from("voice_sessions")
        .select("id, call_sid, direction, purpose, status, from_number, to_number, client_id, booked_event_id, created_at")
        .eq("organization_id", orgId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("calls")
        .select("id, twilio_call_sid, from_number, client_id, status, auto_replied, called_at")
        .eq("organization_id", orgId)
        .gte("called_at", since)
        .order("called_at", { ascending: false })
        .limit(40),
      supabase
        .from("social_posts")
        .select("id, platform, published_at, scheduled_at, generated_by_ai")
        .eq("organization_id", orgId)
        .eq("status", "published")
        .eq("generated_by_ai", true)
        .gte("published_at", since)
        .order("published_at", { ascending: false })
        .limit(20),
      supabase
        .from("ai_employee_runs")
        .select("id, employee_id, channel, subject_type, subject_id, status, outcome, started_at")
        .eq("organization_id", orgId)
        .in("status", ["escalated", "succeeded"])
        .gte("started_at", since)
        .order("started_at", { ascending: false })
        .limit(40),
      supabase
        .from("outbound_call_queue")
        .select("id, purpose, status, client_id, updated_at")
        .eq("organization_id", orgId)
        .in("status", ["done", "failed"])
        .gte("updated_at", since)
        .order("updated_at", { ascending: false })
        .limit(40),
      // Texts the AI team sent, told apart from the owner's own by `sent_by`.
      // More rows than lines on purpose: the mapper folds a conversation's
      // texts into one line with a count.
      supabase
        .from("messages")
        .select("id, client_id, to_address, sent_by, intent, sent_at")
        .eq("organization_id", orgId)
        .eq("direction", "outbound")
        .eq("channel", "sms")
        .in("sent_by", FEED_TEXT_SENDERS)
        .gte("sent_at", since)
        .order("sent_at", { ascending: false })
        .limit(200),
      supabase.from("organizations").select("timezone, twilio_number").eq("id", orgId).maybeSingle(),
      listEmployees(supabase, orgId).catch(() => []),
      // What the owner approved and the team then did (never throws).
      listExecutedApprovals(supabase, orgId, since),
      supabase.auth.getUser().then((r) => r.data.user?.id ?? null, () => null),
    ]);

    for (const [name, res] of Object.entries({ voiceRes, callsRes, postsRes, runsRes, queueRes, textsRes })) {
      if (res.error) console.error(`[ai-activity] ${name}:`, res.error.message);
    }

    const voiceSessions = (voiceRes.data ?? []) as unknown as VoiceSessionRow[];
    const calls = (callsRes.data ?? []) as unknown as CallRow[];
    const socialPosts = (postsRes.data ?? []) as unknown as SocialPostRow[];
    const queue = (queueRes.data ?? []) as unknown as QueueRow[];
    const texts = (textsRes.data ?? []) as unknown as TextRow[];

    const slugById = new Map(employees.map((e) => [e.id, e.slug]));
    const runs = ((runsRes.data ?? []) as unknown as (Omit<RunRow, "employee_slug"> & { employee_id: string })[])
      .map(({ employee_id, ...r }) => ({ ...r, employee_slug: slugById.get(employee_id) ?? "" }))
      .filter((r) => r.employee_slug);

    const approvals: ApprovalFeedRow[] = approvalRows
      .filter((a) => a.executed_at)
      .map((a) => ({
        id: a.id,
        employee_slug: a.employee_slug,
        action_key: a.action_key,
        client_name: pickDetails(a.details).clientName ?? null,
        decided_by: a.decided_by,
        executed_at: a.executed_at as string,
      }));

    const clientIds = new Set<string>();
    for (const s of voiceSessions) if (s.client_id) clientIds.add(s.client_id);
    for (const c of calls) if (c.client_id) clientIds.add(c.client_id);
    for (const q of queue) clientIds.add(q.client_id);
    for (const m of texts) if (m.client_id) clientIds.add(m.client_id);
    for (const r of runs) if (r.subject_type === "contact" && r.subject_id) clientIds.add(r.subject_id);
    const eventIds = new Set(voiceSessions.map((s) => s.booked_event_id).filter((id): id is string => !!id));

    const ids = [...clientIds].filter((id) => UUID.test(id));
    const evIds = [...eventIds].filter((id) => UUID.test(id));
    const [clientsRes, eventsRes] = await Promise.all([
      ids.length
        ? supabase.from("clients").select("id, first_name, last_name, company").in("id", ids)
        : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null; company: string | null }[] }),
      evIds.length
        ? supabase.from("events").select("id, start_at").in("id", evIds)
        : Promise.resolve({ data: [] as { id: string; start_at: string }[] }),
    ]);

    const clientNames: Record<string, string> = {};
    for (const c of clientsRes.data ?? []) {
      const name = clientDisplayName(c);
      if (name) clientNames[c.id] = name;
    }
    const eventStarts: Record<string, string> = {};
    for (const e of eventsRes.data ?? []) if (e.start_at) eventStarts[e.id] = e.start_at;

    // The name and face this business gave each employee — the same resolution
    // as the Command Center: chosen avatar, then the role's default, then a hash.
    const employeeInfo: Record<string, { name: string; avatar: string }> = {};
    for (const slug of SLUGS) {
      const e = employees.find((x) => x.slug === slug);
      const bp = getBlueprint(slug);
      employeeInfo[slug] = {
        name: e?.name ?? bp?.name ?? slug,
        avatar: e?.avatar ?? bp?.avatar ?? defaultAvatarForSeed(slug),
      };
    }

    timeZone = safeTimezone((orgRes.data?.timezone as string | null) ?? null);
    receptionistConnected = !!orgRes.data?.twilio_number;
    const whenFmt = new Intl.DateTimeFormat(intlLocale(locale), {
      timeZone,
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });

    rows = buildActivityFeed(
      {
        voiceSessions,
        calls,
        socialPosts,
        runs,
        queue,
        texts,
        approvals,
        viewerId: viewer,
        clientNames,
        eventStarts,
        employees: employeeInfo,
      },
      { t, when: (iso) => whenFmt.format(new Date(iso)) },
      { now },
    );
  } catch (e) {
    console.error("[ai-activity] could not load the feed", e);
    return null;
  }

  // Today's lines show the time; older ones the weekday — a week fits in either.
  const loc = intlLocale(locale);
  const dayFmt = new Intl.DateTimeFormat(loc, { timeZone, year: "numeric", month: "numeric", day: "numeric" });
  const timeFmt = new Intl.DateTimeFormat(loc, { timeZone, hour: "numeric", minute: "2-digit" });
  const weekdayFmt = new Intl.DateTimeFormat(loc, { timeZone, weekday: "short" });
  const today = dayFmt.format(now);
  const stamp = (iso: string) => {
    const d = new Date(iso);
    return dayFmt.format(d) === today ? timeFmt.format(d) : weekdayFmt.format(d);
  };

  return (
    <section aria-labelledby="ai-activity-heading" className="mt-5 max-w-2xl">
      <div className="flex items-baseline gap-2">
        <h2 id="ai-activity-heading" className="text-sm font-semibold text-slate-800">
          {t("aiActivity.title")}
        </h2>
        <span className="text-xs text-slate-400">{t("aiActivity.window")}</span>
      </div>

      {rows.length === 0 ? (
        <p className="mt-1.5 text-sm text-slate-600">
          {receptionistConnected ? t("aiActivity.emptyConnected") : t("aiActivity.empty")}{" "}
          <Link
            href={receptionistConnected ? "/voice" : "/settings#voice-agent"}
            className="font-medium text-indigo-600 hover:text-indigo-800"
          >
            {receptionistConnected ? t("aiActivity.openReceptionist") : t("aiActivity.setUpReceptionist")}
          </Link>
        </p>
      ) : (
        <ul className="mt-1.5 divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.key}>
              <Link
                href={r.href}
                className="flex items-center gap-2.5 py-1.5 text-sm text-slate-600 transition-colors hover:text-slate-900"
              >
                <WhoMark who={r.who} />
                <span className={`min-w-0 flex-1 ${r.tone === "warning" ? "text-amber-700" : ""}`}>
                  {r.text}
                  {r.detail ? <span className="text-slate-400">{" · "}{r.detail}</span> : null}
                </span>
                <time dateTime={r.at} className="shrink-0 text-xs tabular-nums text-slate-400">
                  {stamp(r.at)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The WHO of a line: the employee's face, or a quiet mark for Auto Pilot and automatic sends. The name is in the sentence. */
function WhoMark({ who }: { who: ActivityWho }) {
  if (who.kind === "employee" && who.avatar) {
    return <Avatar id={who.avatar} size={20} alt="" className="shrink-0 rounded-full" />;
  }
  const Icon = who.kind === "autoPilot" ? Plane : Clock;
  return (
    <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
      <Icon className="h-3 w-3" />
    </span>
  );
}
