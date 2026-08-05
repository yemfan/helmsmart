import "server-only";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createCmaForAgent, isCreateCmaFailure } from "@/lib/cma/service";
import { startPlaybookRun } from "@/lib/realtyboss/playbook-runs/service";
import { autoDispatchRunTasks } from "@/lib/realtyboss/playbook-runs/dispatch";
import { defineTool } from "../types";

/**
 * Playbook & multi-step engagement tools (capability-map Phase 1).
 *
 * These wrap capabilities that already exist in the older action registry
 * (lib/realtyboss/actions/registry.ts) so Ask Max's tool-loop reaches them:
 * the two stateful selling/buying engagements, the open-house playbook, and
 * the closing-timeline playbook. All are non-outbound (they create CMAs, tasks,
 * and playbook-run records) — riskClass crm_write.
 */

// ── shared helpers (ported from the action registry) ─────────────────

async function resolveUserId(agentId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("agents")
    .select("auth_user_id")
    .eq("id", agentId)
    .maybeSingle();
  return (data as { auth_user_id?: string | null } | null)?.auth_user_id ?? null;
}

/** A crm_tasks row arranged by a playbook, due relative to the event date. */
async function createPlaybookTask(
  agentId: string,
  args: { title: string; description?: string | null; dueAt?: string | null; priority?: string },
): Promise<void> {
  await supabaseAdmin.from("crm_tasks").insert({
    agent_id: agentId,
    title: args.title.slice(0, 200),
    description: args.description ?? null,
    due_at: args.dueAt ?? null,
    status: "open",
    priority: args.priority ?? "medium",
    source: "automation",
    task_type: "boss_playbook",
    metadata_json: { from: "boss_playbook" },
  });
}

/** Event date (YYYY-MM-DD) + day offset → ISO at `hour` local, or null. */
function dueAtFromDate(isoDate: string | undefined, offsetDays: number, hour = 9): string | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

// ── stateful engagements ─────────────────────────────────────────────

export const startSellingPlaybook = defineTool({
  name: "start_selling_playbook",
  description:
    "Kick off the whole home-SELLING engagement end-to-end (after the listing agreement is signed): the Marketing team lays out a prep checklist, generates an AI marketing plan + custom property ads, schedules the rollout, and sets a weekly optimize review. Choose when asked to start selling / list / market a specific property end-to-end — NOT for just one CMA (run_cma) or one post (publish_social_post).",
  inputSchema: z.object({
    address: z.string().min(4).describe("Full address of the home to sell."),
  }),
  riskClass: "crm_write",
  assignee: "marketing_assistant",
  execute: async (ctx, input) => {
    const res = await startPlaybookRun({ agentId: ctx.agentId, type: "house_selling", params: { address: input.address } });
    if (!res.ok) return { status: "failed", error: res.error };
    const ran = await autoDispatchRunTasks(ctx.agentId, res.runId).catch(() => 0);
    const note = ran > 0 ? `${res.note} The Marketing team auto-ran ${ran} task${ran === 1 ? "" : "s"} (autopilot on).` : res.note;
    return { status: "completed", summary: note, artifactUrl: res.url, data: { runId: res.runId, autoRan: ran } };
  },
});

export const startBuyingPlaybook = defineTool({
  name: "start_buying_playbook",
  description:
    "Kick off the whole home-BUYING engagement end-to-end (after a buyer is qualified): the Sales team sets up the consultation, builds + saves a house-searching plan (criteria/frequency/channel), schedules delivery, and sets a weekly optimize review. Choose when asked to start a full buyer search / represent a buyer end-to-end — NOT for just one saved search (house_search).",
  inputSchema: z.object({
    contact_name: z.string().min(2).describe("The qualified buyer's name."),
    criteria: z.string().min(8).describe("What the buyer wants — beds/baths, area, price range."),
    frequency: z.enum(["daily", "weekly"]).optional().describe("Only if the realtor asked to send matches on a cadence."),
  }),
  riskClass: "crm_write",
  assignee: "sales_assistant",
  execute: async (ctx, input) => {
    const params: Record<string, string> = { contact_name: input.contact_name, criteria: input.criteria };
    if (input.frequency) params.frequency = input.frequency;
    const res = await startPlaybookRun({ agentId: ctx.agentId, type: "house_buying", params });
    if (!res.ok) return { status: "failed", error: res.error };
    const ran = await autoDispatchRunTasks(ctx.agentId, res.runId).catch(() => 0);
    const note = ran > 0 ? `${res.note} The Sales team auto-ran ${ran} task${ran === 1 ? "" : "s"} (autopilot on).` : res.note;
    return { status: "completed", summary: note, artifactUrl: res.url, data: { runId: res.runId, autoRan: ran } };
  },
});

// ── one-shot playbooks ───────────────────────────────────────────────

export const setupOpenHouse = defineTool({
  name: "setup_open_house",
  description:
    "Set up an open house (playbook). Pulls a pricing CMA and schedules the whole task list around the date — promote on social + portals, order signs, print sign-in sheets, day-of confirm, and visitor follow-up. Choose when asked to set up / arrange / run an open house.",
  inputSchema: z.object({
    address: z.string().min(4).describe("Address of the open house."),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Open house date, YYYY-MM-DD."),
    time: z.string().min(1).optional().describe("Open house time, e.g. '1-4pm'."),
  }),
  riskClass: "crm_write",
  assignee: "marketing_assistant",
  execute: async (ctx, input) => {
    const { address, date } = input;
    const time = input.time ?? "";

    // 1) Pricing CMA — the deliverable the rest hangs off.
    let cmaUrl: string | null = null;
    const userId = await resolveUserId(ctx.agentId);
    if (userId) {
      const res = await createCmaForAgent({ userId, agentId: ctx.agentId, subjectAddress: address });
      if (!isCreateCmaFailure(res)) cmaUrl = `/dashboard/cma/${res.cma.id}`;
    }

    // 2) The arranged, dated checklist (offsets are days from the event).
    const when = `${date}${time ? ` ${time}` : ""}`;
    const steps: Array<{ title: string; off: number; priority: string }> = [
      { title: `Promote open house on social + portals — ${address}`, off: -4, priority: "high" },
      { title: `Order open house signs + directionals — ${address}`, off: -3, priority: "high" },
      { title: `Print sign-in sheets + flyers — ${address}`, off: -1, priority: "medium" },
      { title: `Confirm open house ${when} — ${address}`, off: -1, priority: "high" },
      { title: `Follow up with open-house visitors — ${address}`, off: 1, priority: "high" },
    ];
    let scheduled = 0;
    for (const s of steps) {
      await createPlaybookTask(ctx.agentId, {
        title: s.title,
        description: `Open house playbook for ${address} (${when}).`,
        dueAt: dueAtFromDate(date, s.off),
        priority: s.priority,
      });
      scheduled += 1;
    }

    return {
      status: "completed",
      summary: `Open house arranged for ${address} on ${when} — ${cmaUrl ? "pricing CMA + " : ""}${scheduled} tasks scheduled.`,
      artifactUrl: cmaUrl,
      data: { scheduled, cmaUrl },
    };
  },
});

export const coordinateClosing = defineTool({
  name: "coordinate_closing",
  description:
    "Lay out the closing timeline (playbook). Schedules the standard deadline checklist — inspection, appraisal, financing/loan contingency, title & escrow review, final walkthrough, closing day — counting back from the closing date. Choose when asked to coordinate/manage a closing or set up a transaction timeline.",
  inputSchema: z.object({
    address: z.string().min(4).describe("Property whose closing to coordinate."),
    closing_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Closing date, YYYY-MM-DD."),
  }),
  riskClass: "crm_write",
  assignee: "transaction_assistant",
  execute: async (ctx, input) => {
    const { address } = input;
    const close = input.closing_date;
    const steps: Array<{ title: string; off: number; priority: string }> = [
      { title: `Schedule inspection — ${address}`, off: -21, priority: "high" },
      { title: `Order appraisal — ${address}`, off: -18, priority: "high" },
      { title: `Confirm loan commitment / clear financing contingency — ${address}`, off: -10, priority: "urgent" },
      { title: `Review title & escrow / clear-to-close — ${address}`, off: -7, priority: "high" },
      { title: `Final walkthrough — ${address}`, off: -1, priority: "high" },
      { title: `Closing day — ${address}`, off: 0, priority: "urgent" },
    ];
    let scheduled = 0;
    for (const s of steps) {
      await createPlaybookTask(ctx.agentId, {
        title: s.title,
        description: `Closing timeline for ${address} (closing ${close}).`,
        dueAt: dueAtFromDate(close, s.off),
        priority: s.priority,
      });
      scheduled += 1;
    }
    return {
      status: "completed",
      summary: `Closing timeline arranged for ${address} — ${scheduled} milestones scheduled to ${close}.`,
      data: { scheduled },
    };
  },
});
