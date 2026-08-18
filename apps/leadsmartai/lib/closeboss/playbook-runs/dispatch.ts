import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { effectiveAutopilot } from "@/lib/closeboss/autopilot";
import { updateSavedHouseSearch } from "@/lib/house-search/savedHouseSearches";
import type { BossAssignee, BossChannel } from "@/lib/closeboss/actions/registry";
import type { PlaybookExec, PlaybookTaskMeta } from "./types";

/**
 * Autonomous execution of playbook EXECUTE tasks by the AI assistants.
 *
 * A run's execute tasks that map to a real capability carry an `exec` binding
 * (see types). This module runs them:
 *   - `autoDispatchRunTasks` — right after a run starts, fires every pending
 *     executable task whose owning (assistant, channel) is on autopilot.
 *   - `dispatchPlaybookTask` — the agent's "Approve & run" for one task.
 *
 * Dispatching a `boss_action` calls the registry action with autoExecute=true so
 * the assistant actually sends/queues (the every-15-min cron drains calls,
 * scheduled_posts publishes). `enable_autorun` turns on a saved search's
 * recurring delivery.
 *
 * The registry import is DYNAMIC to avoid a static cycle (registry → service →
 * … ; dispatch → registry).
 */

type RunTaskRow = {
  id: string;
  agent_id: string;
  title: string;
  description: string | null;
  status: string;
  metadata_json: PlaybookTaskMeta | null;
};

export type DispatchResult = { ok: true; note: string; artifactUrl: string | null } | { ok: false; error: string };

/** The (assistant, channel) that owns an exec — for the autopilot decision. */
async function execOwner(exec: PlaybookExec): Promise<{ assignee: BossAssignee; channel?: BossChannel }> {
  if (exec.kind === "enable_autorun") return { assignee: exec.assignee, channel: exec.channel };
  const { BOSS_ACTIONS } = await import("@/lib/closeboss/actions/registry");
  const def = BOSS_ACTIONS[exec.type];
  return { assignee: def.assignee, channel: def.channel };
}

async function runExec(agentId: string, exec: PlaybookExec): Promise<DispatchResult> {
  if (exec.kind === "enable_autorun") {
    try {
      await updateSavedHouseSearch(agentId, exec.savedSearchId, {
        autoRun: true,
        autoRunFrequency: exec.frequency,
      });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Couldn't turn on the recurring search." };
    }
    return {
      ok: true,
      note: `Sales Assistant is now delivering matches ${exec.frequency}.`,
      artifactUrl: "/dashboard/house-search",
    };
  }
  // boss_action — run the registry capability, autoExecute=true so it actually acts.
  const { BOSS_ACTIONS } = await import("@/lib/closeboss/actions/registry");
  const def = BOSS_ACTIONS[exec.type];
  try {
    const result = await def.run({ agentId, params: exec.params, autoExecute: true });
    return { ok: true, note: result.note, artifactUrl: result.status === "completed" ? result.artifactUrl : null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The assistant couldn't run this." };
  }
}

async function markTask(taskId: string, meta: PlaybookTaskMeta, res: DispatchResult): Promise<void> {
  const next: PlaybookTaskMeta = {
    ...meta,
    dispatch_status: res.ok ? "done" : "failed",
    dispatched_at: new Date().toISOString(),
    artifact_url: res.ok ? res.artifactUrl : meta.artifact_url ?? null,
  };
  await supabaseAdmin
    .from("crm_tasks")
    .update({
      status: res.ok ? "done" : "open",
      metadata_json: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);
}

async function loadTask(agentId: string, taskId: string): Promise<RunTaskRow | null> {
  const { data } = await supabaseAdmin
    .from("crm_tasks")
    .select("id, agent_id, title, description, status, metadata_json")
    .eq("id", taskId)
    .eq("agent_id", agentId)
    .eq("task_type", "boss_playbook")
    .maybeSingle();
  return (data as RunTaskRow | null) ?? null;
}

/** Agent's "Approve & run" — run one executable task now, via its assistant. */
export async function dispatchPlaybookTask(agentId: string, taskId: string): Promise<DispatchResult> {
  const task = await loadTask(agentId, taskId);
  if (!task) return { ok: false, error: "Task not found." };
  const meta = task.metadata_json ?? {};
  const exec = meta.exec;
  if (!exec) return { ok: false, error: "This task isn't AI-executable." };
  if (meta.dispatch_status === "done") return { ok: false, error: "This task already ran." };

  const res = await runExec(agentId, exec);
  await markTask(taskId, meta, res);
  return res;
}

/**
 * Fire every pending executable task for a run whose owning (assistant, channel)
 * is on autopilot. Called right after the run starts, so autopilot-on agents
 * run hands-free while approval-gated ones wait for the agent's click.
 * Returns how many were auto-run.
 */
export async function autoDispatchRunTasks(agentId: string, runId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("crm_tasks")
    .select("id, agent_id, title, description, status, metadata_json")
    .eq("agent_id", agentId)
    .eq("task_type", "boss_playbook")
    .contains("metadata_json", { run_id: runId });
  const rows = (data ?? []) as RunTaskRow[];

  let ran = 0;
  for (const row of rows) {
    const meta = row.metadata_json ?? {};
    const exec = meta.exec;
    if (!exec || meta.dispatch_status !== "pending") continue;
    const owner = await execOwner(exec);
    const auto = await effectiveAutopilot(agentId, owner.assignee, owner.channel);
    if (!auto) continue;
    const res = await runExec(agentId, exec);
    await markTask(row.id, meta, res);
    if (res.ok) ran += 1;
  }
  return ran;
}
