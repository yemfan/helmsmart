import "server-only";

import { getAnthropicClient } from "@/lib/anthropic";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAssistantActivity } from "@/lib/realtorboss/activities";
import {
  actionCatalogPrompt,
  isBossActionType,
  type BossActionType,
} from "@/lib/realtorboss/actions/registry";

/**
 * Boss Assistant instruction channel.
 *
 * The Realtor writes free-form instructions on the Boss dashboard.
 * Every 5 minutes the cron picks up pending rows and the Boss
 * Assistant turns each into a discrete task list, routing every task
 * to the AI assistant whose job it actually is — or, when no
 * assistant can do it (in-person work, negotiation, judgment calls),
 * leaves it for the Realtor to review (and mirrors it into their real
 * crm_tasks list).
 *
 * Routing is bookkeeping + visibility, not autonomous execution —
 * assigned tasks land in the owning assistant's activity feed so the
 * Boss dashboard shows who has the ball. (Architecture freeze: no
 * workforce engine.)
 */

const MODEL = "claude-sonnet-4-6";

export type ParsedTask = {
  title: string;
  details: string | null;
  assignee:
    | "receptionist"
    | "sales_assistant"
    | "marketing_assistant"
    | "transaction_assistant"
    | "accountant"
    | "realtor";
  /** Person/company the task is about (verbatim from the instruction)
   *  — lets execution match a CRM contact or invoice. */
  contact_name: string | null;
  /** Preferred channel when the task is a message ("sms" | "email"). */
  channel: "sms" | "email" | null;
  /** Registry action the team can run end-to-end (CMA, seller presentation,
   *  …), or null when the task has no executable action. */
  action: BossActionType | null;
  /** Parameters the planner extracted for `action` (e.g. { address }).
   *  Missing required params trigger a follow-up question at execution. */
  params: Record<string, string>;
};

const ASSISTANT_LABELS: Record<ParsedTask["assignee"], string> = {
  receptionist: "AI Receptionist",
  sales_assistant: "AI Sales Assistant",
  marketing_assistant: "AI Marketing Assistant",
  transaction_assistant: "AI Transaction Assistant",
  accountant: "AI Accountant",
  realtor: "you",
};

const SYSTEM_PROMPT = `You are the Boss Assistant, the AI Chief of Staff for a real estate professional. The Realtor has written you free-form instructions. Break them into discrete, actionable tasks and route each task to the team member who can actually do it.

Your AI team and what each member can ACTUALLY do today:
- receptionist: answer inbound calls, send missed-call text-backs, place automatic call-backs, book appointments, take messages.
- sales_assistant: text or call leads, follow up with leads, reactivate quiet leads, qualify buyers/sellers, draft messages for approval.
- marketing_assistant: create and schedule social posts, run multi-step SMS/email marketing plans, manage message templates, nurture the sphere with drips and digests, run lead-generation campaigns.
- transaction_assistant: track transaction deadlines (inspection, appraisal, loan, closing), document reminders, risk alerts on active deals.
- accountant: track the commission pipeline, categorize expenses, track invoices/receivables, recommend payment follow-ups.

Routing rules:
- Assign to an AI assistant ONLY when the task clearly falls inside its capability list above.
- Anything requiring in-person presence, negotiation, signing, legal/contractual judgment, personal relationships, or anything ambiguous → assignee "realtor".
- Split compound instructions into separate tasks. Keep titles short and imperative ("Text Jane Chen about Saturday's showing"). Put specifics (names, addresses, times, amounts) in details.
- Never invent specifics the Realtor didn't give you.
- 1 to 8 tasks. If the instruction is not actionable at all (a greeting, a question, venting), return one task assigned to "realtor" titled "Review note" with the content as details.

ACTIONS the team can run end-to-end. When a task is one of these, set "action" to its key and extract "params" from the instruction. Extract ONLY values the Realtor actually gave — NEVER invent an address, date, or amount. If a required param wasn't provided, still set the action and leave that param out; the Boss will ask the Realtor for it.
${actionCatalogPrompt()}
For any task that is NOT one of the actions above, set "action" to null and "params" to {}.

Output ONLY a JSON object, no commentary, no markdown fences:
{ "tasks": [ {
  "title": "string",
  "details": "string or null",
  "assignee": "receptionist|sales_assistant|marketing_assistant|transaction_assistant|accountant|realtor",
  "contact_name": "the person or company this task is about, verbatim from the instruction, or null",
  "channel": "sms or email when the task is sending a message (sms when they said text/SMS, email when they said email; default sms for lead messages, email for invoices), else null",
  "action": "generate_cma | generate_seller_presentation | null",
  "params": { "address": "verbatim address if given" }
} ] }`;

export async function parseInstruction(content: string): Promise<ParsedTask[]> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `The Realtor's instructions:\n\n${content.slice(0, 4000)}` }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Parser returned no text");

  const body = textBlock.text.trim().replace(/```(?:json)?|```/g, "");
  const first = body.indexOf("{");
  const last = body.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("Parser returned non-JSON");
  const raw = JSON.parse(body.slice(first, last + 1)) as { tasks?: unknown };

  const VALID = new Set([
    "receptionist",
    "sales_assistant",
    "marketing_assistant",
    "transaction_assistant",
    "accountant",
    "realtor",
  ]);
  const tasks = (Array.isArray(raw.tasks) ? raw.tasks : [])
    .map((t) => {
      const r = t as {
        title?: unknown;
        details?: unknown;
        assignee?: unknown;
        contact_name?: unknown;
        channel?: unknown;
        action?: unknown;
        params?: unknown;
      };
      const title = typeof r.title === "string" ? r.title.trim().slice(0, 200) : "";
      const assignee = VALID.has(String(r.assignee)) ? (r.assignee as ParsedTask["assignee"]) : "realtor";
      const details = typeof r.details === "string" && r.details.trim() ? r.details.trim().slice(0, 1000) : null;
      const contactName =
        typeof r.contact_name === "string" && r.contact_name.trim() ? r.contact_name.trim().slice(0, 120) : null;
      const channel = r.channel === "sms" || r.channel === "email" ? r.channel : null;
      // Registry action + extracted params (the realtor never reaches it, so
      // only AI-assignable tasks carry an action).
      const action = assignee !== "realtor" && isBossActionType(r.action) ? r.action : null;
      const params: Record<string, string> = {};
      if (action && r.params && typeof r.params === "object") {
        for (const [k, v] of Object.entries(r.params as Record<string, unknown>)) {
          if (typeof v === "string" && v.trim()) params[k] = v.trim().slice(0, 300);
        }
      }
      return title ? { title, details, assignee, contact_name: contactName, channel, action, params } : null;
    })
    .filter((t): t is ParsedTask => t !== null)
    .slice(0, 8);
  if (tasks.length === 0) throw new Error("Parser returned no tasks");
  return tasks;
}

type InstructionRow = {
  id: string;
  agent_id: unknown;
  content: string;
};

/** Process up to `limit` pending instructions. Called by the
 *  every-5-minutes cron (/api/cron/boss-instructions). */
export async function processPendingInstructions(limit = 10): Promise<{
  processed: number;
  tasksCreated: number;
  failed: number;
}> {
  const { data, error } = await supabaseAdmin
    .from("boss_instructions")
    .select("id, agent_id, content")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[boss-instructions] pending query failed:", error.message);
    return { processed: 0, tasksCreated: 0, failed: 1 };
  }

  const rows = (data ?? []) as InstructionRow[];
  let processed = 0;
  let tasksCreated = 0;
  let failed = 0;

  for (const row of rows) {
    const result = await processInstructionRow(row);
    if (result === null) continue; // another worker claimed it
    if (result.ok) {
      processed += 1;
      tasksCreated += result.tasksCreated;
    } else {
      failed += 1;
    }
  }

  return { processed, tasksCreated, failed };
}

/**
 * Process ONE instruction immediately — used by the submit endpoint
 * (via `after()`) so clicking Send doesn't wait for the 5-minute
 * cron; the cron remains the safety net for anything that slips
 * (e.g. a serverless instance dying mid-processing).
 */
export async function processInstructionById(id: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("boss_instructions")
    .select("id, agent_id, content")
    .eq("id", id)
    .eq("status", "pending")
    .maybeSingle();
  if (!data) return;
  await processInstructionRow(data as InstructionRow);
}

/** Claim + parse + route + execute one instruction. Returns null when
 *  another worker already claimed it. */
async function processInstructionRow(
  row: InstructionRow,
): Promise<{ ok: boolean; tasksCreated: number } | null> {
  const agentId = String(row.agent_id);
  let tasksCreated = 0;

  // Claim — a parallel worker (cron vs. submit) skips rows already
  // processing.
  const { data: claimed } = await supabaseAdmin
    .from("boss_instructions")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id");
  if (!claimed || claimed.length === 0) return null;

  try {
      const tasks = await parseInstruction(row.content);

      const assignedToAi: ParsedTask[] = [];
      const forRealtor: ParsedTask[] = [];
      for (const t of tasks) {
        let crmTaskId: string | null = null;
        if (t.assignee === "realtor") {
          // Mirror into the Realtor's real task list for review.
          const { data: crmTask } = await supabaseAdmin
            .from("crm_tasks")
            .insert({
              agent_id: agentId,
              title: t.title,
              description: t.details
                ? `${t.details}\n\n(From your instructions to the Boss Assistant.)`
                : "From your instructions to the Boss Assistant.",
              status: "open",
              priority: "high",
              source: "automation",
              task_type: "boss_instruction",
              metadata_json: { boss_instruction_id: row.id },
            })
            .select("id")
            .maybeSingle();
          crmTaskId = (crmTask as { id: string } | null)?.id ?? null;
          forRealtor.push(t);
        } else {
          assignedToAi.push(t);
        }

        const { data: insertedTask } = await supabaseAdmin
          .from("boss_instruction_tasks")
          .insert({
            instruction_id: row.id,
            agent_id: agentId,
            title: t.title,
            details: t.details,
            assigned_to: t.assignee,
            status: t.assignee === "realtor" ? "needs_review" : "assigned",
            crm_task_id: crmTaskId,
          })
          .select("id")
          .maybeSingle();
        tasksCreated += 1;

        // EXECUTION (architecture unfrozen): messaging tasks get the
        // real draft prepared now — the Realtor approves on the Boss
        // card and it sends. Falls back to plain "assigned" when we
        // can't execute confidently.
        const taskId = (insertedTask as { id: string } | null)?.id;
        let executed: "awaiting_approval" | "assigned" | "needs_input" | "completed" = "assigned";
        if (taskId && t.assignee !== "realtor") {
          if (t.action) {
            // Registry action — run it (or park needs_input when a required
            // param like the property address wasn't given).
            const { executeBossAction } = await import("@/lib/realtorboss/actions/execute");
            executed = await executeBossAction({ agentId, taskId, type: t.action, params: t.params });
          } else {
            // Messaging tasks: draft for approval (existing path).
            const { tryExecuteTask } = await import("@/lib/realtorboss/execution");
            executed = await tryExecuteTask({ agentId, taskId, task: t });
          }
        }

        // Visibility: the owning assistant's feed shows what the Boss put on
        // its desk — drafted, done, waiting on a detail, or just assigned.
        if (t.assignee !== "realtor") {
          const activity =
            executed === "awaiting_approval"
              ? { type: "boss_task_drafted", summary: `Drafted for your approval: ${t.title}`, attn: true }
              : executed === "needs_input"
                ? { type: "boss_task_needs_input", summary: `Needs one detail to start: ${t.title}`, attn: true }
                : executed === "completed"
                  ? { type: "boss_task_completed", summary: `Done: ${t.title}`, attn: false }
                  : { type: "boss_task_assigned", summary: `Boss Assistant assigned: ${t.title}`, attn: false };
          void logAssistantActivity({
            agentId,
            assistantType: t.assignee,
            activityType: activity.type,
            summary: activity.summary,
            outcome: t.details,
            requiresAttention: activity.attn,
          });
        }
      }

      await supabaseAdmin
        .from("boss_instructions")
        .update({
          status: "done",
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      void logAssistantActivity({
        agentId,
        assistantType: "boss_assistant",
        activityType: "instructions_processed",
        summary: `Turned your instructions into ${tasks.length} task${tasks.length === 1 ? "" : "s"}`,
        outcome: [
          assignedToAi.length > 0
            ? `${assignedToAi.length} assigned to the team (${[...new Set(assignedToAi.map((t) => ASSISTANT_LABELS[t.assignee]))].join(", ")})`
            : null,
          forRealtor.length > 0 ? `${forRealtor.length} for your review` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        requiresAttention: forRealtor.length > 0,
      });
      return { ok: true, tasksCreated };
    } catch (e) {
      console.error(`[boss-instructions] processing ${row.id} failed:`, e);
      await supabaseAdmin
        .from("boss_instructions")
        .update({
          status: "failed",
          error: (e instanceof Error ? e.message : "Processing failed").slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      return { ok: false, tasksCreated };
    }
}
