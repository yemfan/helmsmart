import "server-only";

import { getAnthropicClient } from "@/lib/anthropic";
import { BOSS_AGENT_MODEL } from "@/lib/ai/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/siteUrl";
import { logAssistantActivity } from "@/lib/realtyboss/activities";
import { insertAgentInboxNotification } from "@/lib/notifications/agentNotifications";
import { getAutopilotMatrix, getGlobalAutopilot } from "@/lib/realtyboss/autopilot";
import { executeTool, defaultExecuteDeps } from "../tools/execute";
import { getBossTool } from "../tools/registry";
import { newRunState, type ToolContext } from "../tools/types";
import { driveRun, type EngineDeps, type ModelClient, type ModelResponse } from "./engine";
import { SupabaseRunStore, type BossRunRow, type BossRunStatus } from "./store";

/**
 * Boss v2 run lifecycle glue: feature flag, run creation, chunked
 * continuation, approval decisions, and terminal report-back
 * (HANDOFF_BOSS_V2 PR-3).
 */

// ── feature flag ─────────────────────────────────────────────────────

/**
 * Global env kill switch + per-agent opt-in:
 *   BOSS_V2_ENABLED=false  → off for everyone (kill switch)
 *   BOSS_V2_ENABLED=all    → on for everyone (post-rollout flip)
 *   otherwise              → agent_ai_settings.boss_v2_enabled decides
 */
export async function isBossV2Enabled(agentId: string): Promise<boolean> {
  const env = (process.env.BOSS_V2_ENABLED ?? "").toLowerCase();
  if (env === "false" || env === "0" || env === "off") return false;
  if (env === "all" || env === "true") return true;
  try {
    const { data } = await supabaseAdmin
      .from("agent_ai_settings")
      .select("boss_v2_enabled")
      .eq("agent_id", agentId)
      .maybeSingle();
    return Boolean((data as { boss_v2_enabled?: boolean } | null)?.boss_v2_enabled);
  } catch {
    return false;
  }
}

// ── model client ─────────────────────────────────────────────────────

function realModelClient(): ModelClient {
  return {
    async createMessage(args): Promise<ModelResponse> {
      const client = getAnthropicClient();
      const res = await client.messages.create({
        model: BOSS_AGENT_MODEL,
        max_tokens: args.maxTokens,
        system: args.system,
        // Transcript is persisted as raw Anthropic blocks.
        messages: args.messages as never,
        tools: args.tools as never,
      });
      const text = res.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("\n");
      const toolUses = res.content
        .filter((b) => b.type === "tool_use")
        .map((b) => {
          const t = b as { id: string; name: string; input: unknown };
          return { id: t.id, name: t.name, input: t.input };
        });
      return {
        text,
        toolUses,
        stopReason: res.stop_reason,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        rawContent: res.content as unknown[],
      };
    },
  };
}

// ── system prompt ────────────────────────────────────────────────────

async function buildSystemPrompt(run: BossRunRow): Promise<string> {
  const [{ data: agentRow }, matrix, globalAuto] = await Promise.all([
    supabaseAdmin
      .from("agents")
      .select("brand_name, city, state")
      .eq("id", run.agent_id)
      .maybeSingle(),
    getAutopilotMatrix(run.agent_id).catch(() => []),
    getGlobalAutopilot(run.agent_id).catch(() => false),
  ]);
  const agent = agentRow as { brand_name?: string | null; city?: string | null; state?: string | null } | null;

  const matrixLines =
    matrix.length > 0
      ? matrix.map((c) => `  - ${c.assignee}/${c.channel}: ${c.mode}`).join("\n")
      : "  (no per-channel overrides)";

  return `You are the Boss Assistant of an AI real estate team (RealtyBoss), acting for ${agent?.brand_name ?? "the realtor"}${agent?.city ? ` in ${agent.city}${agent?.state ? `, ${agent.state}` : ""}` : ""}.
Today is ${new Date().toISOString().slice(0, 10)}.

You execute the realtor's command by calling tools. Rules:
- Start your FIRST reply with a short numbered plan (2-6 steps), then begin calling tools.
- Prefer one tool call at a time; use a tool result before deciding the next step.
- Use ONLY facts from tool results. Never invent contacts, prices, dates, or addresses. Look up contacts with query_crm find_contact before messaging them.
- Outbound sends (SMS/email/calls/social) may return pending_approval — that is SUCCESS: the item is parked for the realtor. Do not retry it; move on.
- Rejected tools (consent, budget, caps) are final — do not retry them.
- You have a budget of ${run.max_tool_calls} tool calls. Be economical.
- When the work is done you'll be asked to verify; your final reply is the report the realtor reads: DONE (with links) / DRAFTED, AWAITING APPROVAL / NEEDS YOU.

Autopilot (global auto-send: ${globalAuto ? "ON" : "OFF"}; per-channel overrides):
${matrixLines}

The realtor's command follows as the first user message.`;
}

// ── lifecycle ────────────────────────────────────────────────────────

const store = new SupabaseRunStore();

export async function startBossRun(args: {
  agentId: string;
  objective: string;
  trigger?: "command" | "overnight" | "retry";
  instructionId?: string | null;
  maxToolCalls?: number;
}): Promise<{ runId: string } | { error: string }> {
  const { data, error } = await supabaseAdmin
    .from("boss_runs")
    .insert({
      agent_id: args.agentId,
      trigger: args.trigger ?? "command",
      instruction_id: args.instructionId ?? null,
      objective: args.objective.slice(0, 4000),
      status: "planning",
      ...(args.maxToolCalls ? { max_tool_calls: args.maxToolCalls } : {}),
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Couldn't create the run." };
  const runId = (data as { id: string }).id;
  if (args.instructionId) {
    await supabaseAdmin
      .from("boss_instructions")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", args.instructionId);
  }
  return { runId };
}

/** Advance the run in this invocation; re-kick another invocation if needed. */
export async function continueBossRun(runId: string): Promise<BossRunStatus> {
  const deps: EngineDeps = {
    store,
    model: realModelClient(),
    buildSystemPrompt,
  };
  const result = await driveRun(runId, deps);

  if (result.needsContinuation) {
    void kickContinuation(runId);
    return result.status;
  }
  if (
    result.status === "completed" ||
    result.status === "failed" ||
    result.status === "budget_exceeded" ||
    result.status === "cancelled"
  ) {
    await onTerminal(runId, result.status);
  }
  return result.status;
}

/** Fire-and-forget POST to the continuation route (fresh 300s budget). */
async function kickContinuation(runId: string): Promise<void> {
  try {
    // BOSS_CONTINUE_BASE_URL wins (dev runs on a non-default port); prod
    // falls back to the canonical site URL.
    const base = (process.env.BOSS_CONTINUE_BASE_URL?.trim() || getSiteUrl()).replace(/\/$/, "");
    await fetch(`${base}/api/boss/runs/continue`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
      },
      body: JSON.stringify({ runId }),
    });
  } catch (e) {
    console.error("[boss-run] continuation kick failed:", e);
  }
}

/** Realtor decision on a pending outbound step → execute/reject → resume. */
export async function decideRunStep(args: {
  agentId: string;
  runId: string;
  stepIndex: number;
  decision: "approved" | "rejected";
  note?: string;
}): Promise<{ ok: true; status: BossRunStatus } | { ok: false; error: string }> {
  const run = await store.loadRun(args.runId);
  if (!run || run.agent_id !== String(args.agentId)) {
    return { ok: false, error: "Run not found." };
  }
  if (run.status !== "awaiting_approval") {
    return { ok: false, error: `Run is ${run.status}, not awaiting approval.` };
  }
  const steps = await store.loadSteps(args.runId);
  const step = steps.find((s) => s.step_index === args.stepIndex);
  if (!step || step.approval_state !== "pending") {
    return { ok: false, error: "No pending approval at that step." };
  }

  const messages = [...run.messages_json];

  if (args.decision === "rejected") {
    await store.finishStep(args.runId, args.stepIndex, {
      approval_state: "rejected",
      status: "rejected",
    });
    messages.push({
      role: "user",
      content: `The realtor REJECTED step ${args.stepIndex} (${step.tool_name}).${args.note ? ` Note: ${args.note}` : ""} Do not retry it. Adjust the plan or wrap up with your report.`,
    });
  } else {
    // Execute the parked action for real, as an explicit human approval.
    const tool = getBossTool(step.tool_name);
    if (!tool) return { ok: false, error: `Tool ${step.tool_name} no longer exists.` };
    const runState = newRunState(run.max_tool_calls);
    runState.toolCalls = 0; // approval execution doesn't consume plan budget
    const ctx: ToolContext = {
      agentId: run.agent_id,
      runId: args.runId,
      stepIndex: args.stepIndex,
      assignee: tool.assignee,
      runState,
      approvedByRealtor: true,
    };
    const outcome = await executeTool(ctx, step.tool_name, step.input_json, {
      ...defaultExecuteDeps(),
      idempotency: { get: async () => null, set: async () => undefined },
    });
    await store.finishStep(args.runId, args.stepIndex, {
      approval_state: "approved",
      status: outcome.status === "completed" ? "completed" : "failed",
      output_json: outcome,
    });
    messages.push({
      role: "user",
      content: `The realtor APPROVED step ${args.stepIndex} (${step.tool_name}). Execution result: ${JSON.stringify(outcome)}. Continue the plan or wrap up with your report.`,
    });
  }

  await store.updateRun(args.runId, { messages_json: messages, status: "running" });
  // The caller (decision route) resumes the loop in-process via after() —
  // an HTTP self-kick here would depend on getSiteUrl matching the running
  // origin, which isn't true in dev.
  return { ok: true, status: "running" };
}

export async function cancelBossRun(agentId: string, runId: string): Promise<boolean> {
  const run = await store.loadRun(runId);
  if (!run || run.agent_id !== String(agentId)) return false;
  if (["completed", "failed", "cancelled", "budget_exceeded"].includes(run.status)) return false;
  await store.updateRun(runId, {
    status: "cancelled",
    finished_at: new Date().toISOString(),
  });
  await onTerminal(runId, "cancelled");
  return true;
}

// ── report-back ──────────────────────────────────────────────────────

async function onTerminal(runId: string, status: BossRunStatus): Promise<void> {
  try {
    const run = await store.loadRun(runId);
    if (!run) return;

    if (run.instruction_id) {
      await supabaseAdmin
        .from("boss_instructions")
        .update({
          status: status === "completed" ? "done" : "failed",
          error: status === "completed" ? null : (run.error ?? status),
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", run.instruction_id);
    }

    const headline =
      status === "completed"
        ? "Boss run completed"
        : status === "budget_exceeded"
          ? "Boss run stopped at its budget"
          : status === "cancelled"
            ? "Boss run cancelled"
            : "Boss run failed";
    await logAssistantActivity({
      agentId: run.agent_id,
      assistantType: "boss_assistant",
      activityType: `boss_run_${status}`,
      summary: `${headline}: ${run.objective.slice(0, 140)}`,
      outcome: run.report?.slice(0, 500) ?? run.error ?? null,
      requiresAttention: status !== "completed",
      relatedEntityType: "boss_run",
      relatedEntityId: runId,
    });
    if (status !== "cancelled") {
      await insertAgentInboxNotification({
        agentId: run.agent_id,
        type: "reminder",
        priority: status === "completed" ? "medium" : "high",
        title: headline,
        body: (run.report ?? run.error ?? run.objective).slice(0, 1500),
        deepLink: { screen: "home" },
      });
    }
  } catch (e) {
    console.error("[boss-run] report-back failed:", e);
  }
}
