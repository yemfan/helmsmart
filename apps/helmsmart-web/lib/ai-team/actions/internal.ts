/**
 * Internal actions — work that stays inside the business. They run at once
 * (nothing reaches a customer), and each is recorded as Mark's run so it shows
 * in the AI activity feed.
 */
import { z } from "zod";
import { insertTask } from "@helm/dna-operations";
import { ACTION_KEYS } from "../approval-view";
import { clientName, orgClient } from "../entities";
import { defineAction } from "../types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const createTask = defineAction({
  key: ACTION_KEYS.createTask,
  employee: "mark",
  riskClass: "internal",
  // The same permission the Tasks page's own create action asks for.
  permission: "pipeline.write",
  description:
    "Add a task to the business's task list. Use it when the owner asks you to remember, schedule or follow up on something internal (\"add a task to call the supplier tomorrow\"). Resolve relative dates against today's date in the prompt. If the task is about a client, look them up with find_clients first and pass their id.",
  input: z.object({
    title: z.string().min(1).max(200).describe("What needs doing, in the owner's language, as a short imperative."),
    due_date: z.string().regex(DATE).optional().describe("YYYY-MM-DD in the business's calendar."),
    client_id: z.string().uuid().optional().describe("The client this task is about, from find_clients."),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    notes: z.string().max(2000).optional(),
  }),
  async preview(params, ctx) {
    if (params.client_id && !(await orgClient(ctx.db, ctx.orgId, params.client_id))) {
      return { ok: false, reason: "That client id is not a client of this business. Look them up with find_clients." };
    }
    return { ok: true, summary: `Mark will add the task "${params.title}".`, details: {} };
  },
  async execute(params, ctx) {
    // Re-checked here too: preview and execute each stand on their own.
    const client = params.client_id ? await orgClient(ctx.db, ctx.orgId, params.client_id) : null;
    if (params.client_id && !client) {
      return { status: "rejected", reason: "That client id is not a client of this business." };
    }
    await insertTask(ctx.db, ctx.orgId, {
      title: params.title,
      notes: params.notes,
      due_date: params.due_date,
      client_id: client?.id,
      priority: params.priority,
    });
    return {
      status: "done",
      summary: `Task added: "${params.title}"${params.due_date ? `, due ${params.due_date}` : ""}${client ? `, for ${clientName(client)}` : ""}.`,
      run: {
        status: "succeeded",
        channel: "internal",
        subject: client ? { type: "contact", id: client.id } : null,
        outcome: { action: ACTION_KEYS.createTask, title: params.title, due_date: params.due_date ?? null },
      },
    };
  },
});

export const HANDOFF_CATEGORIES = ["needs_action", "out_of_scope", "unclear", "capability_gap"] as const;

/**
 * The honest escape hatch. When a request needs the owner personally, is out
 * of scope, stayed unclear after one question, or asks for something no tool
 * does yet, Mark says so and leaves a task — instead of inventing a result or
 * a tool. `capability_gap` hand-offs are the backlog of what to build next:
 *
 *   select started_at, outcome->>'summary', outcome->>'why'
 *     from ai_employee_runs
 *    where outcome->>'action' = 'hand_off_to_owner'
 *      and outcome->>'category' = 'capability_gap';
 *
 * (Recorded when the org has seeded its workforce; the task is created either
 * way, and the gap is also logged as `[ai-team] hand-off`.)
 */
export const handOffToOwner = defineAction({
  key: ACTION_KEYS.handOffToOwner,
  employee: "mark",
  riskClass: "internal",
  permission: "clients.read",
  description:
    "Hand a request back to the owner as a task when the team should NOT or CANNOT do it: it needs the owner personally (moving money, signing, account or security changes) — needs_action; it isn't something this business software does — out_of_scope; it stayed unclear even after you asked one question — unclear; or the team should be able to do it but has no tool for it yet (for example posting on social media, placing a call, booking an appointment from chat) — capability_gap. Never invent a result or pretend a tool exists; prefer acting when a tool fits, or asking ONE clarifying question when a detail is missing.",
  input: z.object({
    summary: z.string().min(3).max(200).describe("What the owner asked for, in one line, in the owner's language. Becomes the task title."),
    why: z.string().min(3).max(500).describe("Why this needs the owner rather than the team, in the owner's language."),
    category: z.enum(HANDOFF_CATEGORIES),
    suggested_next_step: z.string().max(300).optional().describe("A concrete next step for the owner, if you have one."),
    owner: z
      .enum(["mark", "tim", "emily", "alex", "sarah", "emma"])
      .optional()
      .describe("The teammate whose domain it is: alex for money, sarah for clients and sales, emily for marketing and social, emma for calls and bookings, tim for reports; mark otherwise."),
  }),
  async execute(params, ctx) {
    const notes = [
      params.why,
      params.suggested_next_step ? ctx.i18n.home("aiApprovals.handoff.nextStep", { step: params.suggested_next_step }) : null,
    ]
      .filter(Boolean)
      .join("\n\n");
    await insertTask(ctx.db, ctx.orgId, { title: params.summary, notes, priority: "normal" });
    console.info("[ai-team] hand-off", { orgId: ctx.orgId, category: params.category, summary: params.summary });
    return {
      status: "done",
      summary: `Handed to the owner as a task (${params.category}). Tell them plainly what you couldn't do and that it's on their task list.`,
      data: { category: params.category },
      run: {
        status: "escalated",
        channel: "internal",
        subject: null,
        outcome: {
          action: ACTION_KEYS.handOffToOwner,
          category: params.category,
          summary: params.summary,
          why: params.why,
          owner: params.owner ?? "mark",
        },
      },
    };
  },
});
