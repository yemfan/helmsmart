import { supabaseServer } from "@/lib/supabaseServer";
import {
  generateDailyBriefing,
  type BriefingKind,
  type BriefingOutput,
} from "@/lib/dailyBriefingAI";
import { dispatchMobileBriefingPush } from "@/lib/mobile/pushDispatch";

/**
 * Last night's Boss v2 overnight run (finished within 14h), shaped for the
 * morning briefing. Returns null when the agent isn't in overnight mode or
 * the run produced nothing.
 */
async function latestOvernightRun(
  agentId: string,
): Promise<{ headline: string; block: string } | null> {
  try {
    const since = new Date(Date.now() - 14 * 3600_000).toISOString();
    const { data } = await supabaseServer
      .from("boss_runs")
      .select("id, status, report, tool_calls")
      .eq("agent_id", agentId)
      .eq("trigger", "overnight")
      .in("status", ["completed", "budget_exceeded"])
      .gte("finished_at", since)
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const run = data as { id: string; report: string | null; tool_calls: number } | null;
    if (!run?.report?.trim()) return null;

    const { count: pendingCount } = await supabaseServer
      .from("boss_run_steps")
      .select("id", { count: "exact", head: true })
      .eq("run_id", run.id)
      .eq("approval_state", "pending");

    const headline =
      pendingCount && pendingCount > 0
        ? `Overnight: work done + ${pendingCount} draft${pendingCount === 1 ? "" : "s"} awaiting your approval`
        : "Overnight: your Boss already worked the pipeline";
    return { headline, block: `While you slept:\n${run.report.trim()}` };
  } catch {
    return null;
  }
}

type LeadRow = {
  id: number;
  name: string | null;
  email: string | null;
  property_address: string | null;
  rating: string | null;
  engagement_score: number | null;
  last_activity_at: string | null;
};

type TaskRow = {
  id: string;
  title: string | null;
  task_type: string | null;
  status: string | null;
  due_at: string | null;
  completed_at: string | null;
  created_at: string | null;
};

function startOfTodayUtcIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfTodayUtcIso(): string {
  const d = new Date();
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

function todayDate(): string {
  return startOfTodayUtcIso().slice(0, 10);
}

function daysSince(iso: string | null): number {
  if (!iso) return 999;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

/**
 * Generates a briefing of the given kind for an agent. Idempotent
 * per agent + kind + UTC day — if a row already exists for today
 * we return the existing row with `skipped: true`.
 *
 * The morning path also writes derived tasks to `tasks` (call-this-
 * lead, follow-up-this-stale-lead). The evening path is read-only
 * — it summarizes the day, doesn't create new work.
 */
export async function createDailyBriefingForAgent(
  agentId: string,
  kind: BriefingKind = "morning",
) {
  const todayIso = startOfTodayUtcIso();

  const { data: existing } = await supabaseServer
    .from("daily_briefings")
    .select("id,agent_id,kind,headline,summary,insights,created_at")
    .eq("agent_id", agentId)
    .eq("kind", kind)
    .gte("created_at", todayIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { skipped: true, briefing: existing };
  }

  const ai =
    kind === "morning"
      ? await generateMorning(agentId)
      : await generateEvening(agentId);

  // Boss v2 (HANDOFF PR-5): when an overnight run finished in the small
  // hours, the morning briefing LEADS with its results — "Done / Drafted,
  // approve / Needs you" — and the deterministic briefing rides below as
  // the floor.
  if (kind === "morning") {
    const overnight = await latestOvernightRun(agentId);
    if (overnight) {
      ai.headline = overnight.headline;
      ai.summary = `${overnight.block}\n\n—\n\n${ai.summary}`;
    }
  }

  const { data: inserted, error: insertErr } = await supabaseServer
    .from("daily_briefings")
    .insert({
      agent_id: agentId,
      kind,
      headline: ai.headline,
      summary: ai.summary,
      insights: ai.insights,
    })
    .select("id,agent_id,kind,headline,summary,insights,created_at")
    .single();
  if (insertErr) throw insertErr;

  if (kind === "morning") {
    await writeMorningTasks(agentId, ai);
  }

  // Fire-and-forget mobile push so the agent's phone gets a
  // notification when their briefing is ready. Wrapped in a
  // try/catch so a push failure (no tokens, Expo outage, etc)
  // never bubbles up and breaks the briefing insert.
  try {
    await dispatchMobileBriefingPush({
      agentId,
      kind,
      headline: ai.headline,
      summary: ai.summary,
    });
  } catch (e) {
    console.warn("[briefings] mobile push dispatch failed", {
      agentId,
      kind,
      err: e instanceof Error ? e.message : e,
    });
  }

  return { skipped: false, briefing: inserted };
}

async function generateMorning(agentId: string): Promise<BriefingOutput> {
  const { data: leads, error: leadsErr } = await supabaseServer
    .from("contacts")
    .select("id,name,email,property_address,rating,engagement_score,last_activity_at")
    .eq("agent_id", agentId)
    .limit(500);
  if (leadsErr) throw leadsErr;

  const rows = (leads as LeadRow[] | null) ?? [];

  const hotLeads = rows
    .filter((l) => String(l.rating ?? "").toLowerCase() === "hot")
    .sort((a, b) => Number(b.engagement_score ?? 0) - Number(a.engagement_score ?? 0))
    .slice(0, 5)
    .map((l) => ({
      name: l.name || l.email || `Lead #${l.id}`,
      score: Number(l.engagement_score ?? 0),
      address: l.property_address || "",
    }));

  const highEngagementLeads = rows
    .filter((l) => Number(l.engagement_score ?? 0) >= 70)
    .sort((a, b) => Number(b.engagement_score ?? 0) - Number(a.engagement_score ?? 0))
    .slice(0, 5)
    .map((l) => ({
      name: l.name || l.email || `Lead #${l.id}`,
      score: Number(l.engagement_score ?? 0),
      address: l.property_address || "",
    }));

  const inactiveLeads = rows
    .filter((l) => daysSince(l.last_activity_at) >= 7)
    .sort((a, b) => daysSince(b.last_activity_at) - daysSince(a.last_activity_at))
    .slice(0, 5)
    .map((l) => ({
      name: l.name || l.email || `Lead #${l.id}`,
      daysInactive: daysSince(l.last_activity_at),
      address: l.property_address || "",
    }));

  return generateDailyBriefing({
    kind: "morning",
    totalLeads: rows.length,
    hotLeads,
    highEngagementLeads,
    inactiveLeads,
  });
}

async function generateEvening(agentId: string): Promise<BriefingOutput> {
  const startUtc = startOfTodayUtcIso();
  const endUtc = endOfTodayUtcIso();

  // Source: crm_tasks (Phase 2c — public.tasks is deprecated). Status
  // map: legacy 'completed' → 'done', and we use due_at (timestamptz)
  // bracketed by start/end-of-day UTC instead of date equality.
  const tomorrowStr = (() => {
    const d = new Date(startUtc);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const tomorrowStartUtc = `${tomorrowStr}T00:00:00.000Z`;
  const tomorrowEndUtc = `${tomorrowStr}T23:59:59.999Z`;

  const { data: completedRaw } = await supabaseServer
    .from("crm_tasks")
    .select("id,title,task_type,status,due_at,completed_at,created_at")
    .eq("agent_id", agentId)
    .eq("status", "done")
    .gte("completed_at", startUtc)
    .lte("completed_at", endUtc)
    .limit(50);
  const completed = ((completedRaw as TaskRow[] | null) ?? []).map((t) => ({
    title: t.title || "Task",
    type: t.task_type || "task",
  }));

  const { data: missedRaw } = await supabaseServer
    .from("crm_tasks")
    .select("id,title,task_type,status,due_at,completed_at,created_at")
    .eq("agent_id", agentId)
    .gte("due_at", startUtc)
    .lte("due_at", endUtc)
    .neq("status", "done")
    .limit(50);
  const missed = ((missedRaw as TaskRow[] | null) ?? []).map((t) => ({
    title: t.title || "Task",
    type: t.task_type || "task",
  }));

  const { data: tomorrowRaw } = await supabaseServer
    .from("crm_tasks")
    .select("id,title,task_type,status,due_at,completed_at,created_at")
    .eq("agent_id", agentId)
    .gte("due_at", tomorrowStartUtc)
    .lte("due_at", tomorrowEndUtc)
    .neq("status", "done")
    .limit(20);
  const tomorrow = ((tomorrowRaw as TaskRow[] | null) ?? []).map((t) => ({
    title: t.title || "Task",
    type: t.task_type || "task",
  }));

  // Conversation count today. `communications` may not exist on
  // every env; fall back to 0 silently.
  let conversationsCount = 0;
  try {
    const { count } = await supabaseServer
      .from("communications")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .gte("created_at", startUtc)
      .lte("created_at", endUtc);
    conversationsCount = count ?? 0;
  } catch {
    conversationsCount = 0;
  }

  const { count: newLeadsCount } = await supabaseServer
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .gte("created_at", startUtc)
    .lte("created_at", endUtc);

  return generateDailyBriefing({
    kind: "evening",
    completedTasks: completed,
    missedTasks: missed,
    conversationsCount,
    newLeadsCount: newLeadsCount ?? 0,
    tomorrowTasks: tomorrow,
  });
}

async function writeMorningTasks(
  agentId: string,
  ai: BriefingOutput,
): Promise<void> {
  // Phase 2c: write to crm_tasks with source='briefing' so the unified
  // /dashboard/tasks view picks them up via its source chip. Previous
  // implementation wrote to public.tasks, which the unified view never
  // read — so briefing tasks were invisible to the agent.
  //
  // due_at is end-of-day local-ish (17:00 UTC, ~9-10am→10pm across US
  // timezones) so a "due today" filter still matches when the cron
  // runs in the small hours of the morning.
  //
  // Two upgrades vs the earlier version:
  //   1. Carry contact_id through to each task. The AI returns lead
  //      shapes keyed on name; we re-resolve to a contact id here
  //      with a single bulk query over the agent's contacts so the
  //      task row is linkable (used by the unified-tasks UI's
  //      contact column + by markContactActivity's auto-complete).
  //   2. Dedup before insert. Query existing open briefing tasks
  //      for this agent and skip any (title, contact_id) combo
  //      that would otherwise be a duplicate. Solves the "same
  //      lead generates a new follow-up task every morning"
  //      pile-up the agent reported.

  const dueAt = `${todayDate()}T17:00:00.000Z`;

  // Pull all relevant lead names → contact ids in one round-trip.
  // Briefing rows reference names from BriefingOutput which were
  // themselves drawn from contacts.name (with email/id fallback in
  // generateMorning). The id fallback ("Lead #<id>") can't be
  // resolved here, so those rows get contact_id null and dedupe
  // falls back to title-based matching.
  const names = new Set<string>();
  for (const l of ai.insights.topHotLeads ?? []) {
    if (l.name) names.add(l.name);
  }
  for (const l of ai.insights.needsFollowUp ?? []) {
    if (l.name) names.add(l.name);
  }

  const nameToContactId = new Map<string, string>();
  if (names.size > 0) {
    const { data: contactRows } = await supabaseServer
      .from("contacts")
      .select("id, name, email")
      .eq("agent_id", agentId)
      .in("name", Array.from(names));
    for (const c of (contactRows as Array<{ id: string; name: string | null; email: string | null }> | null) ?? []) {
      if (c.name) nameToContactId.set(c.name, c.id);
      if (c.email) nameToContactId.set(c.email, c.id);
    }
  }

  type TaskInsert = {
    agent_id: string;
    contact_id: string | null;
    title: string;
    description: string;
    task_type: string;
    source: "briefing";
    priority: "high" | "normal";
    due_at: string;
  };
  const tasks: TaskInsert[] = [];

  for (const l of ai.insights.topHotLeads ?? []) {
    tasks.push({
      agent_id: agentId,
      contact_id: l.name ? nameToContactId.get(l.name) ?? null : null,
      title: `Call hot lead: ${l.name}`,
      description: `High-intent lead at ${l.address || "no address"}. Engagement score ${l.score}.`,
      task_type: "call",
      source: "briefing",
      priority: "high",
      due_at: dueAt,
    });
  }
  for (const l of ai.insights.needsFollowUp ?? []) {
    // daysInactive can be the 999 sentinel if last_activity_at was
    // somehow null at AI-input time (post-PR #385 this shouldn't
    // happen, but defensive). Show a friendlier message in that
    // case so the agent doesn't see "999 days inactive" leak.
    const inactiveDesc =
      l.daysInactive >= 999
        ? `Lead hasn't been contacted yet at ${l.address || "no address"}.`
        : `Lead has been inactive for ${l.daysInactive} days at ${l.address || "no address"}.`;
    tasks.push({
      agent_id: agentId,
      contact_id: l.name ? nameToContactId.get(l.name) ?? null : null,
      title: `Follow up with inactive lead: ${l.name}`,
      description: inactiveDesc,
      task_type: "follow_up",
      source: "briefing",
      priority: "normal",
      due_at: dueAt,
    });
  }

  if (!tasks.length) return;

  // Dedup: skip tasks where an open briefing row already exists
  // for the same (contact_id, title-prefix). Title-prefix match
  // covers legacy rows where contact_id was null.
  const { data: existingOpen } = await supabaseServer
    .from("crm_tasks")
    .select("id, contact_id, title")
    .eq("agent_id", agentId)
    .eq("source", "briefing")
    .eq("status", "open");
  const openByContactId = new Set<string>();
  const openByTitle = new Set<string>();
  for (const row of (existingOpen as Array<{ id: string; contact_id: string | null; title: string }> | null) ?? []) {
    if (row.contact_id) {
      openByContactId.add(`${row.contact_id}:${prefixOf(row.title)}`);
    } else {
      openByTitle.add(row.title);
    }
  }
  const fresh = tasks.filter((t) => {
    if (t.contact_id && openByContactId.has(`${t.contact_id}:${prefixOf(t.title)}`)) return false;
    if (openByTitle.has(t.title)) return false;
    return true;
  });

  if (!fresh.length) return;
  try {
    await supabaseServer.from("crm_tasks").insert(fresh);
  } catch {
    // Ignore duplicate-constraint errors — defensive belt-and-suspenders.
  }
}

/**
 * Extract the briefing task-title prefix used for dedupe. Both
 * "Call hot lead: <name>" and "Follow up with inactive lead: <name>"
 * dedup on prefix + contact, so two morning briefings on the same
 * agent + lead only ever produce one open task.
 */
function prefixOf(title: string): string {
  if (title.startsWith("Call hot lead:")) return "Call hot lead";
  if (title.startsWith("Follow up with inactive lead:")) return "Follow up with inactive lead";
  return title;
}
