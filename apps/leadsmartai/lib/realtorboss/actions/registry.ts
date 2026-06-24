import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createCmaForAgent, isCreateCmaFailure } from "@/lib/cma/service";
import { createPresentation } from "@/lib/listing-presentations/service";

/**
 * Boss Assistant ACTION REGISTRY.
 *
 * Each action declares (a) which assistant owns it, (b) the parameters it
 * REQUIRES — so when the Realtor's instruction is missing one (e.g. an open
 * house with no date/time), the Boss asks a follow-up question instead of
 * silently doing nothing — and (c) a `run()` that calls the real capability
 * already in the app and returns a viewable artifact.
 *
 * Some actions are PLAYBOOKS: one command fans out into the whole set of
 * tasks needed (e.g. open_house → pricing CMA + an arranged, dated checklist).
 *
 * Adding a capability = adding one entry here (+ it shows up in the planner's
 * action catalog automatically). The executor (./execute.ts) and the Boss card
 * are generic.
 */

export type BossActionType =
  | "generate_cma"
  | "generate_seller_presentation"
  | "schedule_showing"
  | "cold_call_qualify"
  | "open_house";

export type ActionParamDef = {
  key: string;
  label: string;
  /** Follow-up question the Boss asks when this param is missing. */
  question: string;
};

type RunCtx = { agentId: string; params: Record<string, string> };

export type RunResult =
  | { status: "completed"; artifactType: string; artifactUrl: string | null; note: string }
  | { status: "assigned"; note: string };

export type BossAssignee =
  | "receptionist"
  | "sales_assistant"
  | "marketing_assistant"
  | "transaction_assistant"
  | "accountant";

export type BossActionDef = {
  type: BossActionType;
  assignee: BossAssignee;
  label: string;
  /** Tells the planner what this action does + when to choose it. */
  planHint: string;
  requiredParams: ActionParamDef[];
  run: (ctx: RunCtx) => Promise<RunResult>;
};

// ── shared helpers ──────────────────────────────────────────────────

async function resolveUserId(agentId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("agents")
    .select("auth_user_id")
    .eq("id", agentId)
    .maybeSingle();
  return (data as { auth_user_id?: string | null } | null)?.auth_user_id ?? null;
}

/** A crm_tasks row arranged by a playbook, with a due date relative to the
 *  event date when one was given. */
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

/** Event date (YYYY-MM-DD) + day offset → an ISO timestamp at `hour` local,
 *  or null when no usable date was given (task still gets created, undated). */
function dueAtFromDate(isoDate: string | undefined, offsetDays: number, hour = 9): string | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

async function matchContactForCall(
  agentId: string,
  rawName: string,
): Promise<{ id: string; name: string | null; phone: string | null } | null> {
  const name = rawName.trim();
  if (name.length < 2) return null;
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id, name, phone, phone_number")
    .eq("agent_id", agentId)
    .ilike("name", `%${name}%`)
    .limit(2);
  const rows = (data ?? []) as {
    id: string;
    name: string | null;
    phone: string | null;
    phone_number: string | null;
  }[];
  if (rows.length !== 1) return null;
  const r = rows[0];
  return { id: r.id, name: r.name, phone: r.phone_number ?? r.phone ?? null };
}

const ADDRESS: ActionParamDef = {
  key: "address",
  label: "property address",
  question: "What's the full property address?",
};
const EVENT_DATE: ActionParamDef = {
  key: "date",
  label: "date",
  question: "What date should this be on?",
};
const EVENT_TIME: ActionParamDef = {
  key: "time",
  label: "time",
  question: "What time?",
};

// ── the catalog ─────────────────────────────────────────────────────

export const BOSS_ACTIONS: Record<BossActionType, BossActionDef> = {
  generate_cma: {
    type: "generate_cma",
    assignee: "sales_assistant",
    label: "AI CMA",
    planHint:
      "generate_cma — produce a comparative market analysis (CMA) / home valuation with live comps. Choose for a CMA, comps, a value or price estimate, or \"what's it worth\". params: { address }.",
    requiredParams: [{ ...ADDRESS, question: "What's the full property address for the CMA?" }],
    run: async ({ agentId, params }) => {
      const userId = await resolveUserId(agentId);
      if (!userId) return { status: "assigned", note: "Couldn't resolve your account to run the CMA." };
      const res = await createCmaForAgent({ userId, agentId, subjectAddress: params.address });
      if (isCreateCmaFailure(res)) return { status: "assigned", note: res.error };
      return {
        status: "completed",
        artifactType: "cma",
        artifactUrl: `/dashboard/cma/${res.cma.id}`,
        note: `CMA ready for ${params.address}`,
      };
    },
  },

  generate_seller_presentation: {
    type: "generate_seller_presentation",
    assignee: "sales_assistant",
    label: "Seller Presentation",
    planHint:
      "generate_seller_presentation — start a branded listing/seller presentation. Choose for a listing or seller presentation. params: { address }.",
    requiredParams: [
      { ...ADDRESS, question: "What's the property address for the seller presentation?" },
    ],
    run: async ({ agentId, params }) => {
      await createPresentation({ agentId, propertyAddress: params.address });
      return {
        status: "completed",
        artifactType: "presentation",
        artifactUrl: "/dashboard/presentations",
        note: `Seller presentation started for ${params.address}`,
      };
    },
  },

  schedule_showing: {
    type: "schedule_showing",
    assignee: "receptionist",
    label: "Showing",
    planHint:
      "schedule_showing — book a property showing/tour. Choose when asked to schedule/book a showing or tour. params: { address, date (YYYY-MM-DD), time }.",
    requiredParams: [
      { ...ADDRESS, question: "What's the property address for the showing?" },
      { ...EVENT_DATE, question: "What date is the showing?" },
      { ...EVENT_TIME, question: "What time is the showing?" },
    ],
    run: async ({ agentId, params }) => {
      await createPlaybookTask(agentId, {
        title: `Showing: ${params.address} — ${params.date} ${params.time}`,
        description: `Showing booked via the Boss Assistant for ${params.address} on ${params.date} at ${params.time}.`,
        dueAt: dueAtFromDate(params.date, 0),
        priority: "high",
      });
      return {
        status: "completed",
        artifactType: "showing",
        artifactUrl: null,
        note: `Showing scheduled — ${params.address}, ${params.date} ${params.time}`,
      };
    },
  },

  cold_call_qualify: {
    type: "cold_call_qualify",
    assignee: "sales_assistant",
    label: "Cold call & qualify",
    planHint:
      "cold_call_qualify — have the AI place an outbound voice call to a lead and qualify them (budget, timeline, motivation). Choose when asked to call / cold-call / qualify a specific person. params: { contact_name }.",
    requiredParams: [
      { key: "contact_name", label: "who to call", question: "Who should the AI call — what's the lead's name?" },
    ],
    run: async ({ agentId, params }) => {
      const m = await matchContactForCall(agentId, params.contact_name);
      if (!m) {
        return { status: "assigned", note: `Couldn't find a single contact matching "${params.contact_name}".` };
      }
      if (!m.phone) {
        return { status: "assigned", note: `${m.name ?? "That contact"} has no phone number on file.` };
      }
      // Queue via the same scheduler the Sales composer uses; the */15 drain
      // cron places the call. Cancellable from the scheduled-actions strip.
      const scheduledFor = new Date(Date.now() + 2 * 60 * 1000).toISOString();
      const { error } = await supabaseAdmin.from("scheduled_actions").insert({
        agent_id: agentId,
        channel: "call",
        purpose: "follow_up",
        contact_ids: [m.id],
        body: "Qualify on budget, timeline, and motivation; book a next step if they're interested.",
        scheduled_for: scheduledFor,
        status: "scheduled",
      });
      if (error) return { status: "assigned", note: "Couldn't queue the call." };
      return {
        status: "completed",
        artifactType: "call",
        artifactUrl: null,
        note: `AI call queued to ${m.name ?? "the contact"} — qualifying on budget, timeline, motivation`,
      };
    },
  },

  open_house: {
    type: "open_house",
    assignee: "marketing_assistant",
    label: "Open house",
    planHint:
      "open_house — PLAYBOOK: set up an open house. The team pulls a pricing CMA and schedules the whole task list around the date (promo, signs, sign-in sheets, day-of confirm, visitor follow-up). Choose when asked to set up / arrange / run an open house. params: { address, date (YYYY-MM-DD), time }.",
    requiredParams: [
      { ...ADDRESS, question: "What's the address of the open house?" },
      { ...EVENT_DATE, question: "What date is the open house?" },
      { ...EVENT_TIME, question: "What time is the open house?" },
    ],
    run: async ({ agentId, params }) => {
      const { address, date, time } = params;

      // 1) Pricing CMA — the deliverable the rest hangs off.
      let cmaUrl: string | null = null;
      const userId = await resolveUserId(agentId);
      if (userId) {
        const res = await createCmaForAgent({ userId, agentId, subjectAddress: address });
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
        await createPlaybookTask(agentId, {
          title: s.title,
          description: `Open house playbook for ${address} (${when}).`,
          dueAt: dueAtFromDate(date, s.off),
          priority: s.priority,
        });
        scheduled += 1;
      }

      return {
        status: "completed",
        artifactType: "open_house",
        artifactUrl: cmaUrl,
        note: `Open house arranged for ${address} on ${when} — ${cmaUrl ? "pricing CMA + " : ""}${scheduled} tasks scheduled`,
      };
    },
  },
};

const ALL_TYPES = Object.keys(BOSS_ACTIONS) as BossActionType[];

export function isBossActionType(v: unknown): v is BossActionType {
  return typeof v === "string" && (ALL_TYPES as string[]).includes(v);
}

/** Required params still missing from `params`. */
export function missingParams(
  type: BossActionType,
  params: Record<string, unknown>,
): ActionParamDef[] {
  return BOSS_ACTIONS[type].requiredParams.filter((p) => {
    const v = params[p.key];
    return !(typeof v === "string" && v.trim().length > 0);
  });
}

/** The next follow-up question (one at a time), or null when ready to run. */
export function followUpQuestion(
  type: BossActionType,
  params: Record<string, unknown>,
): string | null {
  const missing = missingParams(type, params);
  return missing.length > 0 ? missing[0].question : null;
}

/** The catalog block injected into the planner's system prompt. */
export function actionCatalogPrompt(): string {
  return Object.values(BOSS_ACTIONS)
    .map((a) => `- ${a.planHint}`)
    .join("\n");
}
