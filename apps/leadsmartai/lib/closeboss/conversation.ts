import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBossTool } from "@/lib/boss/tools/registry";

/**
 * The Ask Max conversation as the page and the API both read it.
 *
 * Shared so the page can put the thread in the first HTML. Loaded only from
 * the browser (`/api/dashboard/closeboss/instructions` + `/runs`) the thread
 * appeared ~7.5 s after navigation on production: document 2.4 s, hydration
 * ~5 s, ten dashboard fetches, then the two thread fetches, then paint
 * (Lighthouse 2026-09-08: LCP 7.9 s, CLS 0.6 on this page alone).
 */

export type ConversationInstruction = {
  id: string;
  content: string;
  status: "pending" | "processing" | "done" | "failed";
  error: string | null;
  clarification: string | null;
  processed_at: string | null;
  created_at: string;
};

export type ConversationTask = {
  id: string;
  instruction_id: string;
  title: string;
  details: string | null;
  assigned_to: string;
  status: string;
  draft_channel: "sms" | "email" | null;
  draft_subject: string | null;
  draft_body: string | null;
  execution_note: string | null;
  action_type: string | null;
  follow_up_question: string | null;
  artifact_type: string | null;
  artifact_url: string | null;
  created_at: string;
};

export type ConversationRun = {
  id: string;
  trigger: "command" | "overnight" | "retry";
  instruction_id: string | null;
  status: "planning" | "running" | "awaiting_approval" | "completed" | "failed" | "budget_exceeded" | "cancelled";
  objective: string;
  plan_json: unknown;
  report: string | null;
  error: string | null;
  tool_calls: number;
  max_tool_calls: number;
  input_tokens: number;
  output_tokens: number;
  token_budget: number;
  started_at: string;
  finished_at: string | null;
};

/** One step of a run's timeline, as `/api/dashboard/closeboss/runs/[id]` returns it. */
export type ConversationRunStep = {
  run_id: string;
  step_index: number;
  tool_name: string;
  risk_class: string;
  input_json: Record<string, unknown> | null;
  output_json: Record<string, unknown> | null;
  status: string;
  approval_state: string;
  error: string | null;
  created_at: string | null;
  finished_at: string | null;
  /** The teammate who ran it — the tool's assignee, or the runtime owner it reported. */
  assignee: string | null;
};

export type MorningBriefing = {
  id: string;
  kind: "morning" | "evening";
  headline: string | null;
  summary: string;
  insights: { topOpportunity?: string } | null;
  created_at: string;
  read_at: string | null;
};

const INSTRUCTION_COLUMNS = "id, content, status, error, clarification, processed_at, created_at";
const TASK_COLUMNS =
  "id, instruction_id, title, details, assigned_to, status, draft_channel, draft_subject, draft_body, execution_note, action_type, follow_up_question, artifact_type, artifact_url, created_at";
const RUN_COLUMNS =
  "id, trigger, instruction_id, status, objective, plan_json, report, error, tool_calls, max_tool_calls, input_tokens, output_tokens, token_budget, started_at, finished_at";
const STEP_COLUMNS =
  "run_id, step_index, tool_name, risk_class, input_json, output_json, status, approval_state, error, created_at, finished_at";

/**
 * Newest instructions (newest first) with their routed tasks. `before` is a
 * keyset cursor: the page of instructions created strictly before that ISO
 * timestamp — the "Load earlier conversations" pager. `hasMore` is "the page
 * was full", so another older page may exist.
 */
export async function listRecentInstructions(
  agentId: string,
  opts: { limit?: number; before?: string | null } = {},
): Promise<{ instructions: ConversationInstruction[]; tasks: ConversationTask[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(Number.isFinite(opts.limit) ? Number(opts.limit) : 5, 1), 20);
  let query = supabaseAdmin
    .from("boss_instructions")
    .select(INSTRUCTION_COLUMNS)
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (opts.before && !Number.isNaN(Date.parse(opts.before))) {
    query = query.lt("created_at", opts.before);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const instructions = (data ?? []) as unknown as ConversationInstruction[];

  let tasks: ConversationTask[] = [];
  if (instructions.length > 0) {
    const { data: taskRows, error: taskErr } = await supabaseAdmin
      .from("boss_instruction_tasks")
      .select(TASK_COLUMNS)
      .in("instruction_id", instructions.map((i) => i.id))
      .order("created_at", { ascending: true });
    if (taskErr) throw new Error(taskErr.message);
    tasks = (taskRows ?? []) as unknown as ConversationTask[];
  }
  return { instructions, tasks, hasMore: instructions.length >= limit };
}

/** The agent's most recent Boss v2 runs, newest first. */
export async function listRecentRuns(agentId: string, limit = 10): Promise<ConversationRun[]> {
  const take = Math.min(Math.max(Number.isFinite(limit) ? limit : 10, 1), 50);
  const { data, error } = await supabaseAdmin
    .from("boss_runs")
    .select(RUN_COLUMNS)
    .eq("agent_id", agentId)
    .order("started_at", { ascending: false })
    .limit(take);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ConversationRun[];
}

/** Today's opener: the newest morning briefing, or null when it has been read. */
export async function unreadMorningBriefing(agentId: string): Promise<MorningBriefing | null> {
  const { data, error } = await supabaseAdmin
    .from("daily_briefings")
    .select("id,kind,headline,summary,insights,created_at,read_at")
    .eq("agent_id", agentId)
    .eq("kind", "morning")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[conversation] morning briefing", error);
    return null;
  }
  const row = data as unknown as MorningBriefing | null;
  return row && !row.read_at ? row : null;
}

/**
 * The step timelines of many runs in one query, keyed by run id.
 *
 * Each RunCard on the page fetched its own `/runs/[id]` after mount — five
 * or six requests of 0.6–1.5 s each on production — and rendered one line
 * ("Starting run…") until then, so every bubble grew when its steps landed.
 * With the steps in the first HTML the cards render complete.
 */
export async function listRunSteps(runIds: string[]): Promise<Record<string, ConversationRunStep[]>> {
  const byRun: Record<string, ConversationRunStep[]> = {};
  if (runIds.length === 0) return byRun;
  const { data, error } = await supabaseAdmin
    .from("boss_run_steps")
    .select(STEP_COLUMNS)
    .in("run_id", runIds)
    .order("step_index", { ascending: true });
  if (error) throw new Error(error.message);
  for (const raw of (data ?? []) as unknown as Omit<ConversationRunStep, "assignee">[]) {
    const runtimeOwner = (raw.output_json as { data?: { owner?: unknown } } | null)?.data?.owner;
    const step: ConversationRunStep = {
      ...raw,
      assignee:
        (typeof runtimeOwner === "string" && runtimeOwner) || getBossTool(raw.tool_name)?.assignee || null,
    };
    (byRun[raw.run_id] ??= []).push(step);
  }
  return byRun;
}
