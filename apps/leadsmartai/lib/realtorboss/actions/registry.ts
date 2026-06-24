import "server-only";

import { getAnthropicClient } from "@/lib/anthropic";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  createCmaForAgent,
  findRecentCmaSnapshotByAddress,
  isCreateCmaFailure,
} from "@/lib/cma/service";
import { generateAiCma } from "@/lib/cma/aiCma";
import { generatePresentationAISections } from "@/lib/presentationAI";
import { loadPresentationAgent } from "@/lib/presentations/loadPresentationAgent";

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
  | "open_house"
  | "coordinate_closing"
  | "post_social";

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

async function draftSocialCaption(topic: string): Promise<string> {
  const client = getAnthropicClient();
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    system:
      "You write one social post for a real estate agent — warm, professional, first person, 1-3 short paragraphs, ending with a clear call to action. Plain text. Use only the topic given; never invent prices, dates, or addresses. Output ONLY the post text.",
    messages: [{ role: "user", content: `Topic: ${topic}\n\nWrite the post now.` }],
  });
  const tb = res.content.find((b) => b.type === "text");
  return tb && tb.type === "text" ? tb.text.trim().slice(0, 1200) : "";
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
      "generate_seller_presentation — build a full AI seller/listing presentation (pricing, comps, market, neighborhood, schools, agent profile). Choose for a listing or seller presentation. params: { address }.",
    requiredParams: [
      { ...ADDRESS, question: "What's the property address for the seller presentation?" },
    ],
    run: async ({ agentId, params }) => {
      const userId = await resolveUserId(agentId);
      if (!userId) return { status: "assigned", note: "Couldn't resolve your account." };
      const address = params.address;

      // Reuse a recent CMA snapshot for this address if one exists (avoids a
      // fresh web search); otherwise run the AI CMA engine for pricing + comps.
      const existing = await findRecentCmaSnapshotByAddress(agentId, address, 30);
      let snap = existing?.snapshot;
      if (!snap) {
        const cma = await generateAiCma({ address });
        if (!cma.ok) return { status: "assigned", note: cma.error };
        snap = cma.snapshot;
      }

      const property = {
        address: snap.subject.address,
        city: null as string | null,
        state: null as string | null,
        beds: snap.subject.beds || null,
        baths: snap.subject.baths || null,
        sqft: snap.subject.sqft || null,
        propertyType: snap.subject.propertyType,
        yearBuilt: snap.subject.yearBuilt || null,
        lotSizeSqft: snap.subject.lotSizeSqft ?? null,
        hoaMonthly: snap.subject.hoaMonthly ?? null,
      };
      const estimate = {
        estimatedValue: snap.valuation.estimatedValue || null,
        low: snap.valuation.low || null,
        high: snap.valuation.high || null,
        avgPricePerSqft: snap.valuation.avgPricePerSqft || null,
        summary: snap.summary ?? "",
      };
      const comps = snap.comps.map((c) => ({
        address: c.address,
        price: c.price,
        sqft: c.sqft,
        pricePerSqft: c.pricePerSqft,
        distanceMiles: c.distanceMiles,
        soldDate: c.soldDate,
        beds: c.beds,
        baths: c.baths,
        propertyType: c.propertyType,
      }));

      const [aiSections, agent] = await Promise.all([
        generatePresentationAISections({
          address: property.address,
          estimate,
          comps: comps.map((c) => ({
            address: c.address,
            price: c.price,
            sqft: c.sqft,
            soldDate: c.soldDate,
            distanceMiles: c.distanceMiles,
          })),
        }),
        loadPresentationAgent(agentId),
      ]);

      const data = {
        property,
        estimate,
        comps,
        pricing_strategy: aiSections.pricing_strategy,
        market_insights: aiSections.market_insights,
        marketing_plan: aiSections.marketing_plan,
        neighborhood: aiSections.neighborhood,
        schools: aiSections.schools,
        agent,
        sources: aiSections.sources,
      };

      const { data: inserted, error } = await supabaseAdmin
        .from("presentations")
        .insert({ agent_id: userId, property_address: property.address, data })
        .select("id")
        .single();
      if (error || !inserted?.id) {
        return { status: "assigned", note: error?.message ?? "Failed to save the presentation." };
      }
      return {
        status: "completed",
        artifactType: "presentation",
        artifactUrl: `/presentation/${inserted.id}`,
        note: `Seller presentation ready for ${address}`,
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

  coordinate_closing: {
    type: "coordinate_closing",
    assignee: "transaction_assistant",
    label: "Coordinate closing",
    planHint:
      "coordinate_closing — PLAYBOOK: lay out the closing timeline. Schedules the standard deadline checklist (inspection, appraisal, financing/loan, title & escrow review, final walkthrough, closing day) counting back from the closing date. Choose when asked to coordinate/manage a closing or set up a transaction timeline. params: { address, closing_date (YYYY-MM-DD) }.",
    requiredParams: [
      { ...ADDRESS, question: "Which property's closing should I coordinate — what's the address?" },
      { key: "closing_date", label: "closing date", question: "What's the closing date (YYYY-MM-DD)?" },
    ],
    run: async ({ agentId, params }) => {
      const { address } = params;
      const close = params.closing_date;
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
        await createPlaybookTask(agentId, {
          title: s.title,
          description: `Closing timeline for ${address} (closing ${close}).`,
          dueAt: dueAtFromDate(close, s.off),
          priority: s.priority,
        });
        scheduled += 1;
      }
      return {
        status: "completed",
        artifactType: "closing",
        artifactUrl: null,
        note: `Closing timeline arranged for ${address} — ${scheduled} milestones scheduled to ${close}`,
      };
    },
  },

  post_social: {
    type: "post_social",
    assignee: "marketing_assistant",
    label: "Social post",
    planHint:
      "post_social — draft and schedule a social media post. Choose when asked to post / share / promote / announce something on social. params: { topic } (what the post is about, e.g. a new listing or open house).",
    requiredParams: [
      { key: "topic", label: "what to post about", question: "What should the social post be about?" },
    ],
    run: async ({ agentId, params }) => {
      const caption = await draftSocialCaption(params.topic);
      if (!caption) return { status: "assigned", note: "Couldn't draft the post." };

      // Auto-publish via the scheduler when a Meta account is connected;
      // otherwise hand the finished draft to the agent to post.
      const { data: acct } = await supabaseAdmin
        .from("social_accounts")
        .select("id")
        .eq("agent_id", agentId)
        .eq("platform", "meta")
        .limit(1)
        .maybeSingle();
      const account = acct as { id: string } | null;

      if (!account) {
        await createPlaybookTask(agentId, {
          title: `Post on social: ${params.topic}`,
          description: `Drafted by your Marketing Assistant. Connect Facebook/Instagram in Marketing to auto-publish, or post this:\n\n${caption}`,
          priority: "medium",
        });
        return {
          status: "completed",
          artifactType: "social_draft",
          artifactUrl: null,
          note: "Social post drafted — connect Facebook/Instagram in Marketing to auto-publish",
        };
      }

      const scheduledFor = new Date(Date.now() + 2 * 60 * 1000).toISOString();
      const { error } = await supabaseAdmin.from("scheduled_posts").insert({
        agent_id: agentId,
        social_account_id: account.id,
        platform: "facebook",
        caption,
        scheduled_for: scheduledFor,
        status: "scheduled",
      });
      if (error) return { status: "assigned", note: "Couldn't schedule the post." };
      return {
        status: "completed",
        artifactType: "social",
        artifactUrl: null,
        note: `Facebook post scheduled — "${params.topic}"`,
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
