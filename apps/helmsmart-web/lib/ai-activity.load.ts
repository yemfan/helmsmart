/**
 * Fetching the AI activity feed — the half of it that talks to the database.
 *
 * `lib/ai-activity.ts` is pure (rows in, sentences out); this reads the rows.
 * It was inline in `components/ai-activity.tsx` until the AI Team page needed
 * the same work split per teammate: two screens showing "what the AI did" from
 * two different queries would drift apart within a release, and one of them
 * would be wrong.
 *
 * Never throws — a failed read is `null`, and the caller renders nothing
 * rather than taking its page down with it.
 */
import { defaultAvatarForSeed } from "@helm/ui";
import { getBlueprint, listEmployees } from "@helm/ai-workforce";
import { intlLocale } from "@leadsmart/i18n";
import { safeTimezone } from "@repo/voice/datetime";
import { createClient } from "@/lib/supabase/server";
import {
  ACTIVITY_WINDOW_DAYS,
  FEED_TEXT_SENDERS,
  buildActivityFeed,
  clientDisplayName,
  type ActivityRow,
  type ApprovalFeedRow,
  type CallRow,
  type QueueRow,
  type RunRow,
  type SocialPostRow,
  type TextRow,
  type Translate,
  type VoiceSessionRow,
} from "@/lib/ai-activity";
import { listExecutedApprovals } from "@/lib/ai-team/approvals";
import { pickDetails } from "@/lib/ai-team/approval-view";
import { TEAM_SLUGS } from "@/lib/ai-team/faces";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LoadedActivity = {
  rows: ActivityRow[];
  /** The org has a number for the receptionist to answer on. */
  receptionistConnected: boolean;
  /** The business's timezone, already made safe. */
  timeZone: string;
};

export async function loadActivityFeed(opts: {
  orgId: string;
  /** The reader's `home` translator — every sentence comes through it. */
  t: Translate;
  locale: string;
  now?: Date;
  /** How far back to look. Defaults to the dashboard's week. */
  windowDays?: number;
  limit?: number;
}): Promise<LoadedActivity | null> {
  const { orgId, t, locale } = opts;
  if (!orgId) return null;
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? ACTIVITY_WINDOW_DAYS;

  try {
    const supabase = await createClient();
    const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString();
    // Rows in, lines out: the mapper folds and drops plenty, so each query asks
    // for more than the feed will show.
    const fetchLimit = Math.max(40, (opts.limit ?? 0) * 4);

    const [voiceRes, callsRes, postsRes, runsRes, queueRes, textsRes, orgRes, employees, approvalRows, viewer] =
      await Promise.all([
        supabase
          .from("voice_sessions")
          .select("id, call_sid, direction, purpose, status, from_number, to_number, client_id, booked_event_id, created_at")
          .eq("organization_id", orgId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(fetchLimit),
        supabase
          .from("calls")
          .select("id, twilio_call_sid, from_number, client_id, status, auto_replied, called_at")
          .eq("organization_id", orgId)
          .gte("called_at", since)
          .order("called_at", { ascending: false })
          .limit(fetchLimit),
        supabase
          .from("social_posts")
          .select("id, platform, published_at, scheduled_at, generated_by_ai")
          .eq("organization_id", orgId)
          .eq("status", "published")
          .eq("generated_by_ai", true)
          .gte("published_at", since)
          .order("published_at", { ascending: false })
          .limit(Math.max(20, fetchLimit / 2)),
        supabase
          .from("ai_employee_runs")
          .select("id, employee_id, channel, subject_type, subject_id, status, outcome, started_at")
          .eq("organization_id", orgId)
          .in("status", ["escalated", "succeeded"])
          .gte("started_at", since)
          .order("started_at", { ascending: false })
          .limit(fetchLimit),
        supabase
          .from("outbound_call_queue")
          .select("id, purpose, status, client_id, updated_at")
          .eq("organization_id", orgId)
          .in("status", ["done", "failed"])
          .gte("updated_at", since)
          .order("updated_at", { ascending: false })
          .limit(fetchLimit),
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
        listExecutedApprovals(supabase, orgId, since, fetchLimit),
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
    for (const slug of TEAM_SLUGS) {
      const e = employees.find((x) => x.slug === slug);
      const bp = getBlueprint(slug);
      employeeInfo[slug] = {
        name: e?.name ?? bp?.name ?? slug,
        avatar: e?.avatar ?? bp?.avatar ?? defaultAvatarForSeed(slug),
      };
    }

    const timeZone = safeTimezone((orgRes.data?.timezone as string | null) ?? null);
    const whenFmt = new Intl.DateTimeFormat(intlLocale(locale), {
      timeZone,
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });

    const rows = buildActivityFeed(
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
      { now, windowDays, ...(opts.limit ? { limit: opts.limit } : {}) },
    );

    return { rows, receptionistConnected: !!orgRes.data?.twilio_number, timeZone };
  } catch (e) {
    console.error("[ai-activity] could not load the feed", e);
    return null;
  }
}
