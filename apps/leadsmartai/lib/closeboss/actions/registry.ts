import "server-only";

import { getAnthropicClient } from "@/lib/anthropic";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  createCmaForAgent,
  findRecentCmaSnapshotByAddress,
  isCreateCmaFailure,
} from "@/lib/cma/service";
import { generateAiCma } from "@/lib/cma/aiCma";
import { generateDeepReport } from "@/lib/deep-report/service";
import type { PropertyUse } from "@/lib/deep-report/types";
import { getFeatureQuota, incrementFeatureUsage } from "@/lib/quota/featureQuota";
import { generatePresentationAISections } from "@/lib/presentationAI";
import { loadPresentationAgent } from "@/lib/presentations/loadPresentationAgent";
import { generateHouseSearch } from "@/lib/house-search/aiHouseSearch";
import {
  createSavedHouseSearch,
  updateSavedHouseSearch,
} from "@/lib/house-search/savedHouseSearches";
import { startPlaybookRun } from "@/lib/closeboss/playbook-runs/service";
import { autoDispatchRunTasks } from "@/lib/closeboss/playbook-runs/dispatch";
import { routeSkillRequest, runSkillAndSave } from "@/lib/closeboss/skills/run";
import { getSkill, ASSIGNEE_LABEL } from "@/lib/closeboss/skills/catalog";
import {
  draftAvatarScript,
  getAvatarState,
  publishAvatarVideo,
  renderAvatarVideo,
} from "@/lib/agent/avatarStudio";

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
  | "generate_deep_report"
  | "generate_seller_presentation"
  | "schedule_showing"
  | "cold_call_qualify"
  | "open_house"
  | "coordinate_closing"
  | "post_social"
  | "create_avatar_video"
  | "buyer_home_search"
  | "start_selling_playbook"
  | "start_buying_playbook"
  | "run_skill";

export type ActionParamDef = {
  key: string;
  label: string;
  /** Follow-up question the Boss asks when this param is missing. */
  question: string;
};

type RunCtx = {
  agentId: string;
  params: Record<string, string>;
  /** Communication-approval policy (agent_message_settings.review_policy ===
   *  "autosend"). When false, real outbound actions (calls, posts) prepare the
   *  work and hand it to the Realtor instead of auto-dialing / auto-publishing. */
  autoExecute: boolean;
};

export type RunResult =
  | { status: "completed"; artifactType: string; artifactUrl: string | null; note: string }
  | { status: "assigned"; note: string };

export type BossAssignee =
  | "receptionist"
  | "sales_assistant"
  | "marketing_assistant"
  | "transaction_assistant"
  | "accountant";

/** Outbound channel an action acts on — used to resolve per-channel autopilot. */
export type BossChannel = "call" | "sms" | "email" | "social";

export type BossActionDef = {
  type: BossActionType;
  assignee: BossAssignee;
  label: string;
  /** Tells the planner what this action does + when to choose it. */
  planHint: string;
  requiredParams: ActionParamDef[];
  /**
   * The outbound channel this action sends on, when it has one. Set only for
   * actions that actually reach a person (a call, a post). Read-only/internal
   * actions (CMA, presentation, scheduling tasks) omit it — they ignore the
   * autopilot policy and always run. Used to look up the per-channel autopilot
   * mode in {@link effectiveAutopilot}.
   */
  channel?: BossChannel;
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
    .select("id, name, phone")
    .eq("agent_id", agentId)
    .ilike("name", `%${name}%`)
    .limit(2);
  const rows = (data ?? []) as {
    id: string;
    name: string | null;
    phone: string | null;
  }[];
  if (rows.length !== 1) return null;
  const r = rows[0];
  return { id: r.id, name: r.name, phone: r.phone ?? null };
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
/**
 * `property_use` is deliberately NOT an ActionParamDef.
 *
 * requiredParams is the ask-before-running list, and a deep report defaults to
 * a primary residence — which is what most buyers are — so declaring it there
 * would stop every run to ask a question that already has the right answer.
 * params_json is free-form, so the planner still fills it from "for a rental"
 * or "as an investment" off the planHint; run() coerces anything else.
 */
const DEEP_REPORT_USES: PropertyUse[] = ["primary", "second_home", "investment"];
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

  generate_deep_report: {
    type: "generate_deep_report",
    assignee: "sales_assistant",
    label: "Deep Report",
    planHint:
      "generate_deep_report — produce the full property picture for one address: valuation, deal rating, rent estimate, affordability, investment returns, schools and neighborhood. Choose over generate_cma when the agent wants more than a price — ‘should my buyer buy this’, ‘is this a good rental’, ‘run the numbers on’. params: { address, property_use? }.",
    requiredParams: [
      { ...ADDRESS, question: "What's the full property address for the deep report?" },
    ],
    run: async ({ agentId, params }) => {
      const userId = await resolveUserId(agentId);
      if (!userId) {
        return { status: "assigned", note: "Couldn't resolve your account to run the deep report." };
      }

      // Same quota policy as the dashboard route and the Max tool — three
      // entry points, one rule about what the agent is allowed to spend.
      const quota = await getFeatureQuota(userId, "deep_report");
      if (quota.reached) {
        return {
          status: "assigned",
          note: `Daily Deep Report limit reached (${quota.limit}/day). Resets tomorrow.`,
        };
      }

      const propertyUse = DEEP_REPORT_USES.includes(params.property_use as PropertyUse)
        ? (params.property_use as PropertyUse)
        : "primary";
      const res = await generateDeepReport({
        agentId,
        address: params.address,
        propertyUse,
      });
      if (!res.ok) return { status: "assigned", note: res.error };
      await incrementFeatureUsage(userId, "deep_report");

      // Persist so the agent can reopen it. The report is already generated at
      // this point, so a failed save costs the link, not the work — which is
      // why artifactUrl is nullable and this doesn't return "assigned".
      let id: string | null = null;
      try {
        const { data } = await supabaseAdmin
          .from("deep_reports")
          .insert({
            agent_id: userId,
            address: res.report.property.address,
            property_use: propertyUse,
            report: res.report,
          } as never)
          .select("id")
          .single();
        id = (data as { id: string } | null)?.id ?? null;
      } catch {
        /* non-fatal — see above */
      }

      return {
        status: "completed",
        artifactType: "deep_report",
        // The agent's own copy, not a share link: /deep-report/<id> asks who
        // you are and serves only your own reports.
        artifactUrl: id ? `/deep-report/${id}` : null,
        note: `Deep report ready for ${res.report.property.address}`,
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
    channel: "call",
    planHint:
      "cold_call_qualify — have the AI place an outbound voice call to a lead and qualify them (budget, timeline, motivation). Choose when asked to call / cold-call / qualify a specific person. params: { contact_name }.",
    requiredParams: [
      { key: "contact_name", label: "who to call", question: "Who should the AI call — what's the lead's name?" },
    ],
    run: async ({ agentId, params, autoExecute }) => {
      const m = await matchContactForCall(agentId, params.contact_name);
      if (!m) {
        return { status: "assigned", note: `Couldn't find a single contact matching "${params.contact_name}".` };
      }
      if (!m.phone) {
        return { status: "assigned", note: `${m.name ?? "That contact"} has no phone number on file.` };
      }
      // Communication approval is on → don't auto-dial; hand it to the Realtor.
      if (!autoExecute) {
        await createPlaybookTask(agentId, {
          title: `Call & qualify ${m.name ?? params.contact_name}`,
          description:
            "Communication approval is on, so the AI didn't auto-dial. Call to qualify on budget, timeline, and motivation — or switch the messaging review policy to auto-send to let the AI place these calls.",
          priority: "high",
        });
        return {
          status: "completed",
          artifactType: "call_pending",
          artifactUrl: null,
          note: `Queued for you to call ${m.name ?? "the contact"} (approval required)`,
        };
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
    channel: "social",
    planHint:
      "post_social — draft and schedule a social media post. Choose when asked to post / share / promote / announce something on social. params: { topic } (what the post is about, e.g. a new listing or open house).",
    requiredParams: [
      { key: "topic", label: "what to post about", question: "What should the social post be about?" },
    ],
    run: async ({ agentId, params, autoExecute }) => {
      const caption = await draftSocialCaption(params.topic);
      if (!caption) return { status: "assigned", note: "Couldn't draft the post." };

      // Auto-publish only when communication approval is OFF (auto-send) AND a
      // Meta account is connected; otherwise hand the finished draft over.
      const { data: acct } = await supabaseAdmin
        .from("social_accounts")
        .select("id")
        .eq("agent_id", agentId)
        .eq("platform", "meta")
        .limit(1)
        .maybeSingle();
      const account = acct as { id: string } | null;

      if (!autoExecute || !account) {
        await createPlaybookTask(agentId, {
          title: `Post on social: ${params.topic}`,
          description: `${
            !autoExecute
              ? "Communication approval is on — review and publish this:"
              : "Connect Facebook/Instagram in Marketing to auto-publish, or post this:"
          }\n\n${caption}`,
          priority: "medium",
        });
        return {
          status: "completed",
          artifactType: "social_draft",
          artifactUrl: null,
          note: !autoExecute
            ? "Social post drafted for your review"
            : "Social post drafted — connect Facebook/Instagram to auto-publish",
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

  create_avatar_video: {
    type: "create_avatar_video",
    assignee: "marketing_assistant",
    label: "Avatar video",
    channel: "social",
    planHint:
      'create_avatar_video — film a short talking-head VIDEO of the agent (their digital twin / avatar) about a topic and post it to social (Facebook, Instagram, LinkedIn). Choose ONLY when asked for a VIDEO of themselves / an avatar video / a talking-head clip. A plain text or image post is post_social, not this. Requires the agent to have set up their Digital Twin (intro video + cloned voice). params: { topic } (what the video is about).',
    requiredParams: [
      { key: "topic", label: "what the video is about", question: "What should the avatar video be about?" },
    ],
    run: async ({ agentId, params, autoExecute }) => {
      // Gate 1: the feature must be configured on the server.
      const state = await getAvatarState(agentId);
      if (!state.configured) {
        return { status: "assigned", note: "Avatar video isn't set up on the server yet (needs FAL_KEY + ELEVENLABS_API_KEY)." };
      }
      // Gate 2: the agent's own twin must be ready (intro video + consented voice clone).
      if (!state.hasIntroVideo || !state.voiceReady) {
        await createPlaybookTask(agentId, {
          title: "Set up your Digital Twin to make avatar videos",
          description:
            "To create talking-head videos, first record your intro video and clone your voice in My Profile → Digital Twin.",
          priority: "medium",
        });
        return {
          status: "completed",
          artifactType: "social_draft",
          artifactUrl: null,
          note: "Set up your Digital Twin (intro video + voice clone) first — I left you a task.",
        };
      }

      // Draft the spoken script from the topic (grounded in the brand profile).
      const script = await draftAvatarScript(agentId, params.topic);
      if (!script.trim()) return { status: "assigned", note: "Couldn't draft the video script." };

      // Approval gate: the render costs money, so only render + publish when
      // communication approval is OFF (auto-send). Otherwise hand the script over.
      if (!autoExecute) {
        await createPlaybookTask(agentId, {
          title: `Approve avatar video: ${params.topic}`,
          description:
            "Communication approval is on. Review this script, then render + post it from My Profile → Digital Twin → Avatar:\n\n" +
            script,
          priority: "medium",
        });
        return {
          status: "completed",
          artifactType: "social_draft",
          artifactUrl: null,
          note: "Avatar video script drafted for your review",
        };
      }

      // Render the talking-head clip (paid), then publish to the connected
      // video-capable accounts (Facebook / Instagram / LinkedIn / …).
      let videoUrl: string | null = null;
      try {
        const rendered = await renderAvatarVideo(agentId, script, null);
        videoUrl = rendered.videoUrl;
      } catch (e) {
        return { status: "assigned", note: `Couldn't render the avatar video: ${e instanceof Error ? e.message : "render failed"}` };
      }

      const pub = await publishAvatarVideo(agentId).catch((e) => ({
        scheduled: 0,
        error: e instanceof Error ? e.message : "publish failed",
      }));
      if (pub.scheduled === 0) {
        return {
          status: "completed",
          artifactType: "social_draft",
          artifactUrl: videoUrl,
          note: pub.error ?? "Avatar video made, but no connected social accounts to post to.",
        };
      }
      return {
        status: "completed",
        artifactType: "social",
        artifactUrl: videoUrl,
        note: `Avatar video posted to ${pub.scheduled} ${pub.scheduled === 1 ? "account" : "accounts"} — "${params.topic}"`,
      };
    },
  },

  buyer_home_search: {
    type: "buyer_home_search",
    assignee: "sales_assistant",
    label: "Buyer home search",
    planHint:
      'buyer_home_search — save a property search for a BUYER contact and (optionally) auto-email them new matches daily or weekly. Choose when a buyer is looking for homes by criteria (beds/baths, area, price). e.g. "Set up a search for John — 3b/2b in Alhambra $600k-$1M, send weekly". params: { contact_name (the buyer), criteria (the full brief incl. beds/baths, area, price range), frequency (daily | weekly — only when they ask to send/email on a schedule) }.',
    requiredParams: [
      { key: "contact_name", label: "which buyer", question: "Which buyer is this search for — what's their name?" },
      {
        key: "criteria",
        label: "search criteria",
        question: "What's the buyer looking for? Include beds/baths, area, and price range.",
      },
    ],
    run: async ({ agentId, params }) => {
      const m = await matchContactForCall(agentId, params.contact_name);
      if (!m) {
        return {
          status: "assigned",
          note: `Couldn't find a single contact matching "${params.contact_name}". Add them as a contact (or check the name) and try again.`,
        };
      }

      const search = await generateHouseSearch(params.criteria);
      if (!search.ok) return { status: "assigned", note: search.error };

      // Auto-send only when the Realtor asked to send on a cadence.
      const freq = (params.frequency ?? "").toLowerCase();
      const frequency = freq.includes("week") ? "weekly" : freq.includes("dai") || freq.includes("day") ? "daily" : null;

      let saved;
      try {
        saved = await createSavedHouseSearch(agentId, {
          contactId: m.id,
          name: params.criteria.slice(0, 80),
          query: params.criteria,
          refinements: [],
          result: search.result,
        });
      } catch (e) {
        return { status: "assigned", note: e instanceof Error ? e.message : "Couldn't save the search." };
      }

      if (frequency) {
        try {
          await updateSavedHouseSearch(agentId, saved.id, { autoRun: true, autoRunFrequency: frequency });
        } catch {
          /* search is saved; the schedule just didn't stick — surfaced in the note */
        }
      }

      const count = search.result.listings.length;
      const who = m.name ?? "the buyer";
      return {
        status: "completed",
        artifactType: "buyer_search",
        artifactUrl: "/dashboard/house-search",
        note: `Saved a home search for ${who} — ${count} match${count === 1 ? "" : "es"} so far${
          frequency ? `; emailing new ones ${frequency}` : ""
        }.`,
      };
    },
  },

  start_selling_playbook: {
    type: "start_selling_playbook",
    assignee: "marketing_assistant",
    label: "Selling playbook",
    planHint:
      'start_selling_playbook — STATEFUL PLAYBOOK: kick off the whole home-selling engagement (after the listing agreement is signed). The team lays out a prep checklist, generates an AI marketing plan + 3 custom property ads, schedules the rollout, and sets a weekly optimize review. Choose when asked to start selling / list / market a specific property end-to-end (not just one CMA or one post). params: { address }.',
    requiredParams: [{ ...ADDRESS, question: "What's the address of the home to sell?" }],
    run: async ({ agentId, params }) => {
      const res = await startPlaybookRun({ agentId, type: "house_selling", params });
      if (!res.ok) return { status: "assigned", note: res.error };
      const ran = await autoDispatchRunTasks(agentId, res.runId);
      const note = ran > 0 ? `${res.note} The Marketing Assistant auto-ran ${ran} task${ran === 1 ? "" : "s"} (autopilot on).` : res.note;
      return { status: "completed", artifactType: "playbook_run", artifactUrl: res.url, note };
    },
  },

  start_buying_playbook: {
    type: "start_buying_playbook",
    assignee: "sales_assistant",
    label: "Buying playbook",
    planHint:
      'start_buying_playbook — STATEFUL PLAYBOOK: kick off the whole home-buying engagement (after a buyer is qualified). The team sets up the consultation, builds + saves a house-searching plan (criteria/frequency/channel), schedules delivery, and sets a weekly optimize review. Choose when asked to start a full buyer search / represent a buyer end-to-end (not just one saved search). params: { contact_name (the buyer), criteria (beds/baths, area, price), frequency (daily|weekly, optional) }.',
    requiredParams: [
      { key: "contact_name", label: "which buyer", question: "Which qualified buyer is this for — what's their name?" },
      {
        key: "criteria",
        label: "search criteria",
        question: "What's the buyer looking for? Include beds/baths, area, and price range.",
      },
    ],
    run: async ({ agentId, params }) => {
      const res = await startPlaybookRun({ agentId, type: "house_buying", params });
      if (!res.ok) return { status: "assigned", note: res.error };
      const ran = await autoDispatchRunTasks(agentId, res.runId);
      const note = ran > 0 ? `${res.note} The Sales Assistant auto-ran ${ran} task${ran === 1 ? "" : "s"} (autopilot on).` : res.note;
      return { status: "completed", artifactType: "playbook_run", artifactUrl: res.url, note };
    },
  },

  run_skill: {
    type: "run_skill",
    assignee: "sales_assistant",
    label: "Run a skill",
    planHint:
      'run_skill — run one of the agent\'s Realtor AI skills: write/generate content, scripts, or analyses (listing description, social posts, nurture/drip sequence, farm/circle prospecting, expired/FSBO scripts, objection scripts, buyer consultation packet, market report, net sheet, GCI plan, newsletter, case study, video scripts, and ~50 more). Choose for a writing/content/analysis request that is NOT one of the specific actions above (CMA, seller presentation, showing, cold call, open house, closing, single social post, buyer search, playbooks). params: { request } (the user\'s full request, verbatim).',
    requiredParams: [
      { key: "request", label: "the request", question: "What would you like the team to write or work on?" },
    ],
    run: async ({ agentId, params }) => {
      const route = await routeSkillRequest(agentId, params.request);
      if (route.skillId === null) return { status: "assigned", note: route.reason };
      const res = await runSkillAndSave(agentId, route.skillId, route.inputs);
      if (!res.ok) return { status: "assigned", note: res.error };
      const title = getSkill(route.skillId)?.title ?? "skill";
      const gateNote = res.gate ? (res.gate.status === "flag" ? " — compliance flagged, review before use" : " — compliance passed") : "";
      return {
        status: "completed",
        artifactType: "skill_output",
        artifactUrl: `/dashboard/skills/runs/${res.runId}`,
        note: `${ASSIGNEE_LABEL[res.assignee]} ran "${title}"${gateNote}`,
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
