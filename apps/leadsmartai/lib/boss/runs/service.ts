import "server-only";

import { cachedSystem, readCacheUsage } from "@leadsmart/shared/utils/promptCache";
import { cacheHitRatio, totalContextTokens } from "./tokenAccounting";
import { getAnthropicClient } from "@/lib/anthropic";
import { BOSS_AGENT_MODEL } from "@/lib/ai/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/siteUrl";
import { logAssistantActivity } from "@/lib/closeboss/activities";
import { insertAgentInboxNotification } from "@/lib/notifications/agentNotifications";
import { getAutopilotMatrix, getGlobalAutopilot } from "@/lib/closeboss/autopilot";
import { executeTool, defaultExecuteDeps } from "../tools/execute";
import { getBossTool } from "../tools/registry";
import { newRunState, type ToolContext } from "../tools/types";
import { driveRun, type EngineDeps, type ModelClient, type ModelResponse } from "./engine";
import { SupabaseRunStore, type BossRunRow, type BossRunStatus } from "./store";
import { gateAndChargeRun, recordRunCost, alertOnFailureSpike } from "./observability";

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
        // One breakpoint here covers the tool definitions too: the cached
        // prefix runs tools -> system -> messages, so the 27 tool schemas and
        // the system prompt — the two things identical on every call of the
        // loop — are read from cache after the first round instead of being
        // re-billed at full input price on each tool round-trip.
        system: cachedSystem(args.system) as never,
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
      // Caching splits what used to be one number: `input_tokens` now counts
      // ONLY the uncached remainder, with the rest in cache_read/cache_creation.
      //
      // The engine spends `inputTokens` against run.token_budget, which is the
      // guard against a loop that never terminates. Reporting the uncached
      // figure alone would shrink every reading by ~80% and quietly let runs go
      // five times longer than their budget allows. Caching is meant to change
      // what a run COSTS, not how long it is permitted to think, so the budget
      // keeps counting the whole context — the same number it counted before
      // this change, and comparable to the boss_runs rows already stored.
      const cache = readCacheUsage(res.usage);
      const totalInput = totalContextTokens(res.usage);
      if (cache.read > 0 || cache.written > 0) {
        console.info(
          `[boss] cache read=${cache.read} written=${cache.written} ` +
            `uncached=${cache.uncached} hit=${(cacheHitRatio(res.usage) * 100).toFixed(0)}%`,
        );
      }
      return {
        text,
        toolUses,
        stopReason: res.stop_reason,
        inputTokens: totalInput,
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
      .select("brand_name, onboarding")
      .eq("id", run.agent_id)
      .maybeSingle(),
    getAutopilotMatrix(run.agent_id).catch(() => []),
    getGlobalAutopilot(run.agent_id).catch(() => false),
  ]);
  const agent = agentRow as { brand_name?: string | null; onboarding?: Record<string, unknown> | null } | null;
  const ob = (agent?.onboarding ?? {}) as { market?: string; focus?: string; goal?: string };
  const where = ob.market ? ` in ${ob.market}` : "";
  const profileLine =
    ob.focus || ob.goal
      ? `\nThe realtor works mostly with ${ob.focus ?? "buyers & sellers"} and their top goal right now is ${ob.goal ?? "growing the business"} — weight your plan toward that when it's relevant.`
      : "";

  const matrixLines =
    matrix.length > 0
      ? matrix.map((c) => `  - ${c.assignee}/${c.channel}: ${c.mode}`).join("\n")
      : "  (no per-channel overrides)";

  return `You are Max, captain of an AI real estate team (CloseBoss), acting for ${agent?.brand_name ?? "the realtor"}${where}.${profileLine}
Today is ${new Date().toISOString().slice(0, 10)}.

Voice — you are the calm, dependable captain of a high-performing team, never a chatbot. Be confident, proactive, professional, encouraging, and results-focused. Lead with what's done or what you'll do, report concrete numbers when you have them, and proactively flag what you notice with a clear next move. No hedging, no "as an AI", no filler, no emoji spam.

You are the MANAGER, not the worker. You direct the team; you don't do the tasks yourself. Speak that way: "I'll have the Marketing team put a campaign together," then report back "The Marketing team finished — want to review it?" — never "I'm writing your Facebook post." The realtor has hired an entire AI workforce (Receptionist, Sales, Marketing, Transaction, Accountant); your language should always reinforce that. Meet the realtor at their goal ("I need more listings," "answer my phone," "follow up"), not at a feature name.

A handoff still has an owner. When you call hand_off_to_agent, set its owner to the teammate whose domain it is — an escrow wire, a contract or a closing date is Grace and the Transaction team even though only the realtor can execute it; money and books are Oliver; a lead is Chris; a listing is Ruby. Leave it to the receptionist only for the account itself or a general message. "This one needs you" is about who presses the button, not about the team walking away.

Name the RIGHT teammate. Every tool description ends with who owns it — "[Owned by Ruby, the Marketing team.]" — and the realtor sees that same name stamped on the step underneath your sentence. Use the owner of the tool you are actually calling. Never guess a team from the topic: an open house sounds like transaction work but setup_open_house belongs to Ruby and Marketing, and saying "the Transaction team" over Ruby's name makes the whole report look wrong. If a mission spans several tools, name each owner for their own part.

You execute the realtor's command by calling tools. Rules:
- Open your FIRST reply in your own voice — a warm one-line acknowledgement of the mission and which teammate(s) you're putting on it ("Got it. I'll have Ruby and the Marketing team publish this to Facebook, Instagram and LinkedIn — I'll report back once it's live."), then a short plan, then begin calling tools. Never open with a robotic "Here's my plan"; talk like the captain briefing the principal.
- Prefer one tool call at a time; use a tool result before deciding the next step.
- Use ONLY facts from tool results. Never invent contacts, prices, dates, or addresses. Look up contacts with query_crm find_contact before messaging them.
- Attachments: the objective may reference a file the realtor attached — an image as a public URL, or a document as a storage path. When they ask to post or share that photo, pass the image URL as image_url to publish_social_post (once per connected platform to cover "all socials"). Do NOT ask the realtor for a caption or hashtags — if they didn't dictate the words, omit caption/hashtags and the Marketing team drafts them from the image and the brand; the draft is parked for the realtor to approve or edit (unless social autopilot is on, in which case it posts). When they ask to import contacts from an attached file, pass its storage path to import_contacts_from_file.
- Outbound sends (SMS/email/calls/social) may return pending_approval — that is SUCCESS: the item is parked for the realtor. Do not retry it; move on.
- Rejected tools (consent, budget, caps) are final — do not retry them.
- You have a budget of ${run.max_tool_calls} tool calls. Be economical.
- When the work is done, your final reply is the report the realtor reads. Lead with a short Max headline ("Mission accomplished." / "Everything's live." / "You're all set."), then the concrete results as a checklist — one ✓ per item with its link, naming the teammate who did it. Then take the sensible next step rather than offering to. When it is something the team can prepare safely — a message to a contact, a post, a report — CALL THE TOOL so it comes back parked for approval, and close by handing over what already exists: "Here's the draft to Jordan letting them know their search is live — send it, or want to change anything?" Not "Want me to draft an intro message to Jordan?" — that makes the realtor ask for work you could already have on the table. Only ask permission first when the step would actually go out the door unreviewed, costs real money, or you genuinely can't tell which of two things they want. Announcing a new listing is part of listing it — draft the announcement post and hand it over, never ask "want me to post the listing announcement?". If something is DRAFTED/AWAITING APPROVAL or NEEDS YOU, say so plainly at the top instead.

Link DELIVERABLES, not plumbing. Every link you give is something the realtor opens and looks at — the ad, the video, the CMA, the report, the presentation — written as what it is: "Marketing plan + 3 property ads →". Never paste a bare internal path or a run id as if it were the deliverable ("View the playbook: /dashboard/playbook-runs/1e863118-a4a2-…"): a uuid tells the realtor nothing about what they'd be opening, and the playbook is how the work is tracked, not the work. If a step produced nothing to look at, say what it set up and skip the link.

Handling ANY request — including ones that don't match a tool name (you're a smart captain, not a keyword matcher):
- Map the realtor's intent to your capabilities even when phrased in their own words ("blast my sphere", "chase the ones going cold"). Prefer to just DO it when you can.
- If the request is AMBIGUOUS or missing a key detail, do NOT guess — ask ONE short clarifying question in your reply and stop there ("Happy to — which listing is this for?"). Read-only lookups you can just run.
- If it's clearly a VARIANT of something you can do but you're not fully sure it's what they meant, propose the specific action in one line and ask them to confirm before running it.
- If it's really a QUESTION or asking for advice ("how should I counter a lowball?"), answer it directly and well from what you know; offer to turn it into an action if useful.
- If they report a PROBLEM WITH CLOSEBOSS ITSELF — the app is broken, erroring, showing wrong data, or a feature isn't working (a product defect, NOT a real-estate task) — call report_bug to file it for engineering + open a support ticket, then reassure them it's logged and being looked at.
- If it needs the realtor personally (moving money, signing, account/billing/security), is out of scope, stayed unclear after you asked, or the team simply has no tool for it yet — call hand_off_to_agent with the right category. Use "capability_gap" when it's something the team should be able to do but can't yet, so we learn what to build. NEVER invent a result or claim a tool exists — honest handoff beats bluffing.

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
}): Promise<{ runId: string } | { error: string; code?: string }> {
  // Monthly quota: each run consumes one ai_action (bonus wallet first),
  // same rails as every other AI feature (HANDOFF PR-6).
  const gate = await gateAndChargeRun(args.agentId);
  if (!gate.allowed) {
    return {
      error:
        gate.code === "ai_usage_limit_reached"
          ? "Monthly AI-action quota reached — upgrade for more Boss runs."
          : "No active plan covers Boss runs.",
      code: gate.code,
    };
  }
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
  // Approvals normally arrive while the run is paused; overnight runs finish
  // `completed` with parked steps, decided from the inbox afterwards.
  const runIsLiveForDecision = run.status === "awaiting_approval";
  if (!runIsLiveForDecision && run.status !== "completed") {
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

  if (!runIsLiveForDecision) {
    // Run already finished (overnight inbox decision): record the outcome,
    // don't reopen the loop.
    return { ok: true, status: run.status };
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

    // Cost + failure telemetry (HANDOFF PR-6).
    await recordRunCost(run);
    if (status === "failed") await alertOnFailureSpike(run.agent_id);

    // Overnight runs feed Top Priorities: one card per parked approval,
    // additive over the deterministic CRM-signal sync (HANDOFF PR-5).
    if (run.trigger === "overnight" && (status === "completed" || status === "budget_exceeded")) {
      try {
        const { syncOvernightRecommendations } = await import("./overnight");
        await syncOvernightRecommendations({ id: runId, agent_id: run.agent_id });
      } catch (e) {
        console.error("[boss-run] overnight recommendation sync failed:", e);
      }
    }

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

// ── stall reaper (safety net) ────────────────────────────────────────

const TERMINAL_STATUSES: readonly BossRunStatus[] = [
  "completed",
  "failed",
  "budget_exceeded",
  "cancelled",
];

/** A run untouched this long is treated as stalled and re-driven. */
const REAP_RESUME_AFTER_MS = 3 * 60_000;
/** A run that has made no progress for this long is failed rather than retried forever. */
const REAP_GIVEUP_AFTER_MS = 20 * 60_000;

export type ReapAction = "skip" | "reconcile" | "resume" | "giveup";

/**
 * Pure decision for what to do with a `processing` instruction, given its most
 * recent run. Extracted so the thresholds and status handling are unit-testable
 * without mocking Supabase or the engine.
 *
 *  - no run, long orphaned            → giveup (fail the instruction)
 *  - run terminal                     → reconcile (match instruction to it)
 *  - run awaiting_approval            → skip (waiting on the realtor, not stalled)
 *  - run idle < resume window         → skip (fast path still owns it)
 *  - run idle > give-up window        → giveup (fail; retried too long)
 *  - otherwise                        → resume (re-drive it)
 */
export function classifyStalledRun(args: {
  runStatus: BossRunStatus | null;
  runUpdatedAt: string | null;
  instructionCreatedAt: string;
  nowMs: number;
}): ReapAction {
  const { runStatus, runUpdatedAt, instructionCreatedAt, nowMs } = args;
  if (runStatus == null) {
    return nowMs - Date.parse(instructionCreatedAt) > REAP_GIVEUP_AFTER_MS ? "giveup" : "skip";
  }
  if (TERMINAL_STATUSES.includes(runStatus)) return "reconcile";
  if (runStatus === "awaiting_approval") return "skip";
  const idleMs = nowMs - Date.parse(runUpdatedAt ?? instructionCreatedAt);
  if (idleMs < REAP_RESUME_AFTER_MS) return "skip";
  if (idleMs > REAP_GIVEUP_AFTER_MS) return "giveup";
  return "resume";
}

export type ReapResult = {
  checked: number;
  reconciled: number;
  resumed: number;
  failed: number;
};

/**
 * Safety net for Boss v2 runs (fixes instructions stranded in `processing`).
 *
 * The happy path continues a chunked run via a fire-and-forget HTTP hop
 * ({@link continueBossRun} → `/api/boss/runs/continue`). If that hop is dropped
 * (the serverless function freezes before the fetch flushes) or a run reaches a
 * terminal state through a path that skipped {@link onTerminal}, the linked
 * `boss_instructions` row is left in `processing` forever. This cron-driven pass
 * reconciles and re-drives those runs. `awaiting_approval` runs are left alone —
 * they are legitimately waiting on the realtor, not stalled.
 *
 * Idempotent by design: the engine resumes any run from its persisted transcript
 * and tool execution is idempotency-keyed, so re-driving is safe.
 */
export async function reapStalledBossRuns(opts?: {
  now?: () => number;
  limit?: number;
}): Promise<ReapResult> {
  const nowMs = (opts?.now ?? Date.now)();
  const limit = opts?.limit ?? 50;
  const nowIso = () => new Date(nowMs).toISOString();

  // Instructions sitting in `processing` past the fast-path window (give the
  // immediate continuation a minute before the reaper takes an interest).
  const { data: instrs, error } = await supabaseAdmin
    .from("boss_instructions")
    .select("id, created_at")
    .eq("status", "processing")
    .lt("created_at", new Date(nowMs - 60_000).toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  if (!instrs?.length) return { checked: 0, reconciled: 0, resumed: 0, failed: 0 };

  const instrIds = instrs.map((i) => (i as { id: string }).id);
  const { data: runs, error: runErr } = await supabaseAdmin
    .from("boss_runs")
    .select("id, instruction_id, status, updated_at")
    .in("instruction_id", instrIds);
  if (runErr) throw new Error(runErr.message);

  // Most recent run per instruction.
  const runByInstr = new Map<
    string,
    { id: string; status: BossRunStatus; updated_at: string | null }
  >();
  for (const r of (runs ?? []) as Array<{
    id: string;
    instruction_id: string;
    status: BossRunStatus;
    updated_at: string | null;
  }>) {
    const prev = runByInstr.get(r.instruction_id);
    if (!prev || (r.updated_at ?? "") > (prev.updated_at ?? "")) {
      runByInstr.set(r.instruction_id, { id: r.id, status: r.status, updated_at: r.updated_at });
    }
  }

  const result: ReapResult = { checked: instrs.length, reconciled: 0, resumed: 0, failed: 0 };

  for (const instr of instrs as Array<{ id: string; created_at: string }>) {
    const run = runByInstr.get(instr.id);
    const action = classifyStalledRun({
      runStatus: run?.status ?? null,
      runUpdatedAt: run?.updated_at ?? null,
      instructionCreatedAt: instr.created_at,
      nowMs,
    });

    if (action === "skip") continue;

    if (action === "reconcile" && run) {
      // Run already terminal but the instruction never caught up → match it.
      await supabaseAdmin
        .from("boss_instructions")
        .update({
          status: run.status === "completed" ? "done" : "failed",
          error: run.status === "completed" ? null : run.status,
          processed_at: nowIso(),
          updated_at: nowIso(),
        })
        .eq("id", instr.id)
        .eq("status", "processing");
      result.reconciled += 1;
      continue;
    }

    if (action === "giveup") {
      if (run) {
        // No progress for a long time despite prior resume attempts → give up.
        await store.updateRun(run.id, { status: "failed", finished_at: nowIso(), error: "stalled" });
        await onTerminal(run.id, "failed");
      } else {
        // No run backing the instruction at all → just resolve the card.
        await supabaseAdmin
          .from("boss_instructions")
          .update({ status: "failed", error: "orphaned", processed_at: nowIso(), updated_at: nowIso() })
          .eq("id", instr.id)
          .eq("status", "processing");
      }
      result.failed += 1;
      continue;
    }

    if (action === "resume" && run) {
      try {
        await continueBossRun(run.id);
        result.resumed += 1;
      } catch (e) {
        console.error("[boss-reap] resume failed for run", run.id, e);
      }
    }
  }

  return result;
}
