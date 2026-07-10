import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAnthropicClient } from "@/lib/anthropic";
import { findRecentCmaSnapshotByAddress } from "@/lib/cma/service";
import { generateHouseSearch } from "@/lib/house-search/aiHouseSearch";
import { createSavedHouseSearch } from "@/lib/house-search/savedHouseSearches";
import { generateMarketingPlan, generatePropertyAds } from "./generators";
import type { BossAssignee } from "@/lib/realtyboss/actions/registry";
import type {
  BuyingPlan,
  PlaybookArtifact,
  PlaybookExec,
  PlaybookRunRow,
  PlaybookRunType,
  PlaybookTaskMeta,
  SellingPlan,
} from "./types";

/** Days-from-now → ISO at 9am local, for task due dates. */
function dueInDays(offsetDays: number, hour = 9): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

async function createRunTask(
  agentId: string,
  runId: string,
  phase: string,
  args: {
    title: string;
    description?: string | null;
    dueAt?: string | null;
    priority?: string;
    /** When set, the task is AI-executable: an assistant runs it (auto or on approval). */
    exec?: PlaybookExec;
    assignee?: BossAssignee;
  },
): Promise<void> {
  const meta: PlaybookTaskMeta = {
    from: "playbook_run",
    run_id: runId,
    phase,
    // Executable steps go to the AI assistant; everything else is a human task
    // that belongs to the agent.
    owner: args.exec ? "assistant" : "agent",
  };
  if (args.exec) {
    meta.exec = args.exec;
    meta.assignee = args.assignee;
    meta.dispatch_status = "pending";
  }
  await supabaseAdmin.from("crm_tasks").insert({
    agent_id: agentId,
    title: args.title.slice(0, 200),
    description: args.description ?? null,
    due_at: args.dueAt ?? null,
    status: "open",
    priority: args.priority ?? "medium",
    source: "automation",
    task_type: "boss_playbook",
    metadata_json: meta,
  });
}

async function matchBuyerContact(
  agentId: string,
  rawName: string,
): Promise<{ id: string; name: string | null } | null> {
  const name = rawName.trim();
  if (name.length < 2) return null;
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id, name")
    .eq("agent_id", agentId)
    .ilike("name", `%${name}%`)
    .limit(2);
  const rows = (data ?? []) as { id: string; name: string | null }[];
  if (rows.length !== 1) return null;
  return { id: rows[0].id, name: rows[0].name };
}

async function appendArtifact(runId: string, artifact: PlaybookArtifact): Promise<void> {
  const { data } = await supabaseAdmin
    .from("playbook_runs")
    .select("artifacts_json")
    .eq("id", runId)
    .maybeSingle();
  const current = ((data as { artifacts_json?: PlaybookArtifact[] } | null)?.artifacts_json ?? []) as PlaybookArtifact[];
  await supabaseAdmin
    .from("playbook_runs")
    .update({ artifacts_json: [...current, artifact], updated_at: new Date().toISOString() })
    .eq("id", runId);
}

export type StartRunResult =
  | { ok: true; runId: string; note: string; url: string }
  | { ok: false; error: string };

// ── House selling ────────────────────────────────────────────────────

const SELLING_PREP: Array<{ title: string; off: number; priority: string }> = [
  { title: "Pre-listing walk — note repairs, declutter, staging", off: 0, priority: "high" },
  { title: "Confirm list price + pricing strategy (run/refresh CMA)", off: 1, priority: "high" },
  { title: "Complete repairs + declutter + stage", off: 2, priority: "medium" },
  { title: "Schedule photography + video + floor plan", off: 3, priority: "high" },
  { title: "Gather seller disclosures + HOA docs", off: 3, priority: "medium" },
];

const SELLING_EXECUTE: Array<{ key: string; title: string; off: number; priority: string }> = [
  { key: "mls", title: "Publish listing to MLS + portals (Zillow/Redfin/realtor.com) — verify fields", off: 5, priority: "high" },
  { key: "ads", title: "Post the property ads to social", off: 5, priority: "high" },
  { key: "sphere", title: "Email the listing to your sphere + buyer-agent circle", off: 6, priority: "medium" },
  { key: "open_house", title: "Schedule + promote open house #1", off: 7, priority: "high" },
];

async function startSelling(
  agentId: string,
  params: Record<string, string>,
): Promise<StartRunResult> {
  const address = (params.address ?? "").trim();
  if (!address) return { ok: false, error: "Need the property address to start the selling playbook." };

  const contactId = params.contact_id?.trim() || null;
  const nowIso = new Date().toISOString();

  const { data: inserted, error } = await supabaseAdmin
    .from("playbook_runs")
    .insert({
      agent_id: agentId,
      type: "house_selling",
      contact_id: contactId,
      property_address: address,
      title: `Sell ${address}`,
      phase: "prepare",
      status: "active",
      plan_json: {},
      artifacts_json: [],
      next_review_at: dueInDays(7),
      updated_at: nowIso,
    })
    .select("id")
    .single();
  if (error || !inserted?.id) return { ok: false, error: error?.message ?? "Couldn't create the playbook run." };
  const runId = inserted.id as string;
  const url = `/dashboard/playbook-runs/${runId}`;

  // Phase 1 — prep checklist.
  for (const s of SELLING_PREP) {
    await createRunTask(agentId, runId, "prepare", {
      title: `${s.title} — ${address}`,
      description: `House-selling playbook for ${address}.`,
      dueAt: dueInDays(s.off),
      priority: s.priority,
    });
  }

  // Pricing context for the AI (reuse a recent CMA snapshot if one exists — no fresh web search).
  let priceContext: string | null = null;
  try {
    const snap = await findRecentCmaSnapshotByAddress(agentId, address, 30);
    const v = snap?.snapshot?.valuation;
    if (v?.estimatedValue) {
      priceContext = `Recent CMA estimate ~$${Math.round(v.estimatedValue).toLocaleString()}${
        v.low && v.high ? ` (range $${Math.round(v.low).toLocaleString()}–$${Math.round(v.high).toLocaleString()})` : ""
      }.`;
    }
  } catch {
    /* pricing context is optional */
  }

  // Phase 2 — marketing plan (best-effort).
  const plan: SellingPlan = {};
  try {
    const mp = await generateMarketingPlan({ address, priceContext });
    plan.marketingPlan = mp.plan;
    plan.channels = mp.channels;
    await appendArtifact(runId, { kind: "marketing_plan", title: "Marketing plan", url, createdAt: nowIso });
  } catch {
    await createRunTask(agentId, runId, "marketing_plan", {
      title: `Draft the marketing plan — ${address}`,
      description: "The AI couldn't auto-draft the plan; do it here or re-run the playbook.",
      priority: "high",
    });
  }

  // Phase 3 — three custom property ads (best-effort).
  try {
    const ads = await generatePropertyAds({ address, priceContext });
    if (ads.length) {
      plan.ads = ads;
      await appendArtifact(runId, { kind: "property_ads", title: `${ads.length} property ads`, url, createdAt: nowIso });
    }
  } catch {
    /* ads are best-effort */
  }

  await supabaseAdmin
    .from("playbook_runs")
    .update({ plan_json: plan, phase: "execute", updated_at: new Date().toISOString() })
    .eq("id", runId);

  // Phase 4 — execute. AI-executable steps are BOUND to the Marketing Assistant
  // (posting the ads) and run autonomously when social autopilot is on, else the
  // agent clicks "Approve & run". The rest are human checklist tasks.
  for (const s of SELLING_EXECUTE) {
    const exec: PlaybookExec | undefined =
      s.key === "ads" && plan.ads?.length
        ? {
            kind: "boss_action",
            type: "post_social",
            params: { topic: `New listing at ${address} — ${plan.ads[0].angle}. ${plan.ads[0].headline}` },
          }
        : undefined;
    await createRunTask(agentId, runId, "execute", {
      title: `${s.title} — ${address}`,
      description: exec
        ? `House-selling playbook for ${address}. The Marketing Assistant can post this — approve to run, or it runs automatically if social autopilot is on.`
        : `House-selling playbook for ${address}. Review before it goes out.`,
      dueAt: dueInDays(s.off),
      priority: s.priority,
      exec,
      assignee: exec ? "marketing_assistant" : undefined,
    });
  }

  // Phase 5 — optimize review, one week out.
  await createRunTask(agentId, runId, "optimize", {
    title: `Optimize the marketing plan — ${address}`,
    description:
      "Weekly review: check showings/views/feedback, then open the playbook run and click Optimize to get AI adjustments to price positioning, channels, and ads.",
    dueAt: dueInDays(7),
    priority: "medium",
  });

  const adNote = plan.ads?.length ? ` + ${plan.ads.length} ads` : "";
  const planNote = plan.marketingPlan ? "marketing plan" : "prep checklist";
  return {
    ok: true,
    runId,
    note: `Selling playbook started for ${address} — ${planNote}${adNote}, prep + execute tasks scheduled, weekly optimize review set.`,
    url,
  };
}

// ── House buying ─────────────────────────────────────────────────────

async function startBuying(
  agentId: string,
  params: Record<string, string>,
): Promise<StartRunResult> {
  const rawName = (params.contact_name ?? "").trim();
  const criteria = (params.criteria ?? "").trim();
  if (!rawName) return { ok: false, error: "Need the buyer's name to start the buying playbook." };
  if (!criteria) return { ok: false, error: "Need the buyer's search criteria (beds/baths, area, price)." };

  const buyer = await matchBuyerContact(agentId, rawName);
  if (!buyer) {
    return { ok: false, error: `Couldn't find a single contact matching "${rawName}". Add them as a contact and try again.` };
  }

  const freqRaw = (params.frequency ?? "").toLowerCase();
  const frequency: "daily" | "weekly" | null = freqRaw.includes("week")
    ? "weekly"
    : freqRaw.includes("dai") || freqRaw.includes("day")
      ? "daily"
      : null;
  const who = buyer.name ?? "the buyer";
  const nowIso = new Date().toISOString();

  const { data: inserted, error } = await supabaseAdmin
    .from("playbook_runs")
    .insert({
      agent_id: agentId,
      type: "house_buying",
      contact_id: buyer.id,
      property_address: null,
      title: `Home search for ${who}`,
      phase: "consultation",
      status: "active",
      plan_json: {},
      artifacts_json: [],
      next_review_at: dueInDays(7),
      updated_at: nowIso,
    })
    .select("id")
    .single();
  if (error || !inserted?.id) return { ok: false, error: error?.message ?? "Couldn't create the playbook run." };
  const runId = inserted.id as string;
  const url = `/dashboard/playbook-runs/${runId}`;

  // Phase 1 — consultation.
  await createRunTask(agentId, runId, "consultation", {
    title: `Buyer consultation with ${who}`,
    description:
      "Confirm must-haves vs nice-to-haves, budget/pre-approval, timeline, and preferred communication channel. Book the meeting.",
    dueAt: dueInDays(2),
    priority: "high",
  });

  // Phase 2 — house-searching plan (reuse the saved-search engine).
  const plan: BuyingPlan = { criteria, frequency, channel: params.channel?.trim() || "email" };
  const search = await generateHouseSearch(criteria);
  if (search.ok) {
    try {
      const saved = await createSavedHouseSearch(agentId, {
        contactId: buyer.id,
        name: criteria.slice(0, 80),
        query: criteria,
        refinements: [],
        result: search.result,
      });
      plan.savedSearchId = saved.id;
      plan.matchCount = search.result.listings.length;
      await appendArtifact(runId, {
        kind: "saved_search",
        title: `Saved search — ${plan.matchCount} matches`,
        url: "/dashboard/house-search",
        createdAt: nowIso,
      });
    } catch {
      /* the plan is still recorded even if saving the live search failed */
    }
  }

  await supabaseAdmin
    .from("playbook_runs")
    .update({ plan_json: plan, phase: "execute", updated_at: new Date().toISOString() })
    .eq("id", runId);

  // Phase 3 — execute. Bound to the Sales Assistant: turning on the saved
  // search's recurring delivery. Runs autonomously when email autopilot is on,
  // else the agent clicks "Approve & run".
  const cadence: "daily" | "weekly" = frequency ?? "weekly";
  const sendExec: PlaybookExec | undefined = plan.savedSearchId
    ? { kind: "enable_autorun", savedSearchId: plan.savedSearchId, frequency: cadence, assignee: "sales_assistant", channel: "email" }
    : undefined;
  await createRunTask(agentId, runId, "execute", {
    title: `Send new home matches to ${who} (${cadence})`,
    description: sendExec
      ? `The Sales Assistant will deliver fresh matches to ${who} ${cadence} — approve to start, or it starts automatically if email autopilot is on.`
      : `Review the saved search and send fresh matches to ${who} on a ${cadence} cadence.`,
    dueAt: dueInDays(1),
    priority: "high",
    exec: sendExec,
    assignee: sendExec ? "sales_assistant" : undefined,
  });

  // Phase 4 — optimize review.
  await createRunTask(agentId, runId, "optimize", {
    title: `Optimize the search plan for ${who}`,
    description:
      "Weekly review: note what the buyer liked/passed on, then open the playbook run and click Optimize to get AI adjustments to criteria, area, or price.",
    dueAt: dueInDays(7),
    priority: "medium",
  });

  const matchNote = typeof plan.matchCount === "number" ? ` — ${plan.matchCount} matches so far` : "";
  return {
    ok: true,
    runId,
    note: `Buying playbook started for ${who}${matchNote}. Consultation, saved search, ${cadence} match delivery, and weekly optimize review set.`,
    url,
  };
}

export async function startPlaybookRun(args: {
  agentId: string;
  type: PlaybookRunType;
  params: Record<string, string>;
}): Promise<StartRunResult> {
  if (args.type === "house_selling") return startSelling(args.agentId, args.params);
  return startBuying(args.agentId, args.params);
}

// ── Reads ────────────────────────────────────────────────────────────

export async function listPlaybookRuns(agentId: string): Promise<PlaybookRunRow[]> {
  const { data } = await supabaseAdmin
    .from("playbook_runs")
    .select("*")
    .eq("agent_id", agentId)
    .order("updated_at", { ascending: false })
    .limit(100);
  return (data ?? []) as PlaybookRunRow[];
}

// ── Auto-start settings + idempotency ────────────────────────────────

export type PlaybookAutoSettings = { autoSelling: boolean; autoBuying: boolean };

export async function getPlaybookAutoSettings(agentId: string): Promise<PlaybookAutoSettings> {
  try {
    const { data } = await supabaseAdmin
      .from("playbook_auto_settings")
      .select("auto_selling, auto_buying")
      .eq("agent_id", agentId)
      .maybeSingle();
    const row = data as { auto_selling?: boolean; auto_buying?: boolean } | null;
    return { autoSelling: Boolean(row?.auto_selling), autoBuying: Boolean(row?.auto_buying) };
  } catch {
    return { autoSelling: false, autoBuying: false };
  }
}

export async function setPlaybookAutoSettings(
  agentId: string,
  input: Partial<PlaybookAutoSettings>,
): Promise<PlaybookAutoSettings> {
  const current = await getPlaybookAutoSettings(agentId);
  const next: PlaybookAutoSettings = {
    autoSelling: input.autoSelling ?? current.autoSelling,
    autoBuying: input.autoBuying ?? current.autoBuying,
  };
  await supabaseAdmin.from("playbook_auto_settings").upsert(
    { agent_id: agentId, auto_selling: next.autoSelling, auto_buying: next.autoBuying, updated_at: new Date().toISOString() },
    { onConflict: "agent_id" },
  );
  return next;
}

/** Is there already an active run of this type for the subject? (idempotency for auto-start.) */
export async function hasActiveRun(
  agentId: string,
  type: PlaybookRunType,
  subject: { address?: string | null; contactId?: string | null },
): Promise<boolean> {
  let q = supabaseAdmin
    .from("playbook_runs")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .eq("type", type)
    .eq("status", "active");
  if (subject.address) q = q.eq("property_address", subject.address);
  if (subject.contactId) q = q.eq("contact_id", subject.contactId);
  const { count } = await q;
  return (count ?? 0) > 0;
}

/** Consultation-first buying run for auto-start (a qualified buyer, no criteria yet). */
export async function autoStartBuyingRun(agentId: string, contactId: string): Promise<StartRunResult> {
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("name")
    .eq("agent_id", agentId)
    .eq("id", contactId)
    .maybeSingle();
  const who = (data as { name?: string | null } | null)?.name ?? "the buyer";
  const nowIso = new Date().toISOString();

  const { data: inserted, error } = await supabaseAdmin
    .from("playbook_runs")
    .insert({
      agent_id: agentId,
      type: "house_buying",
      contact_id: contactId,
      property_address: null,
      title: `Home search for ${who}`,
      phase: "consultation",
      status: "active",
      plan_json: {},
      artifacts_json: [],
      next_review_at: dueInDays(7),
      updated_at: nowIso,
    })
    .select("id")
    .single();
  if (error || !inserted?.id) return { ok: false, error: error?.message ?? "Couldn't create the playbook run." };
  const runId = inserted.id as string;

  await createRunTask(agentId, runId, "consultation", {
    title: `Buyer consultation with ${who}`,
    description: "Confirm must-haves vs nice-to-haves, budget/pre-approval, timeline, and preferred channel. Book the meeting.",
    dueAt: dueInDays(2),
    priority: "high",
  });
  await createRunTask(agentId, runId, "search_plan", {
    title: `Set the search criteria + start the search for ${who}`,
    description: `Once you have criteria, tell the Boss: "start a buying playbook for ${who} — [beds/baths, area, price]" to build + save the live search.`,
    dueAt: dueInDays(2),
    priority: "high",
  });

  return {
    ok: true,
    runId,
    note: `Buying playbook started for ${who} — consultation + criteria kickoff.`,
    url: `/dashboard/playbook-runs/${runId}`,
  };
}

export async function getPlaybookRun(agentId: string, runId: string): Promise<PlaybookRunRow | null> {
  const { data } = await supabaseAdmin
    .from("playbook_runs")
    .select("*")
    .eq("agent_id", agentId)
    .eq("id", runId)
    .maybeSingle();
  return (data as PlaybookRunRow | null) ?? null;
}

export type OptimizeResult =
  | { ok: true; suggestions: string[] }
  | { ok: false; error: string };

/**
 * The agent-approved "optimize as we go" step. Reads the run's living plan +
 * any notes the agent added, asks the AI for concrete adjustments, records them
 * on the plan, files an approval task, and pushes the next review out a week.
 * The AI proposes; nothing changes the plan's execution without the agent.
 */
export async function optimizePlaybookRun(
  agentId: string,
  runId: string,
  agentNote?: string,
): Promise<OptimizeResult> {
  const run = await getPlaybookRun(agentId, runId);
  if (!run) return { ok: false, error: "Playbook run not found." };
  if (run.status !== "active") return { ok: false, error: "This playbook run isn't active." };

  const isSelling = run.type === "house_selling";
  const client = getAnthropicClient();
  let suggestions: string[] = [];
  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 900,
      system:
        `You are the ${isSelling ? "Marketing" : "Sales"} Assistant on a real estate agent's AI team, running a weekly optimization review of a ${
          isSelling ? "listing marketing" : "buyer home-search"
        } plan. Given the current plan and the agent's notes on how it's going, propose 3–5 concrete, prioritized adjustments ` +
        `(${isSelling ? "price positioning, channels, ad angles, open-house cadence" : "criteria, area, price band, cadence, channel"}). ` +
        `Each suggestion is one actionable sentence. Never invent facts or numbers not implied by the input. Output ONLY a JSON object: { "suggestions": string[] }.`,
      messages: [
        {
          role: "user",
          content: `Playbook: ${run.title}\nCurrent plan: ${JSON.stringify(run.plan_json).slice(0, 4000)}\nAgent notes: ${
            agentNote?.trim() || "(none provided — infer likely early-stage adjustments)"
          }\n\nGive the optimization suggestions now.`,
        },
      ],
    });
    const tb = res.content.find((b) => b.type === "text");
    const text = tb && tb.type === "text" ? tb.text : "";
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = m ? (JSON.parse(m[0]) as { suggestions?: unknown }) : null;
    suggestions = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions.filter((s): s is string => typeof s === "string").slice(0, 6)
      : [];
  } catch {
    return { ok: false, error: "Couldn't generate optimization suggestions — try again." };
  }
  if (!suggestions.length) return { ok: false, error: "No suggestions were produced — add a note on how it's going and retry." };

  const nowIso = new Date().toISOString();
  const plan = (run.plan_json ?? {}) as Record<string, unknown>;
  const prevNotes = Array.isArray((plan as { optimizeNotes?: unknown }).optimizeNotes)
    ? ((plan as { optimizeNotes: string[] }).optimizeNotes)
    : [];
  const entry = `${nowIso.slice(0, 10)}: ${suggestions.join(" · ")}`;
  await supabaseAdmin
    .from("playbook_runs")
    .update({
      plan_json: { ...plan, lastOptimizedAt: nowIso, optimizeNotes: [...prevNotes, entry].slice(-10) },
      next_review_at: dueInDays(7),
      updated_at: nowIso,
    })
    .eq("id", runId);

  await createRunTask(agentId, runId, "optimize", {
    title: `Apply plan adjustments — ${run.property_address ?? run.title}`,
    description: `AI-proposed optimizations (approve/adjust before acting):\n\n- ${suggestions.join("\n- ")}`,
    dueAt: dueInDays(1),
    priority: "high",
  });

  return { ok: true, suggestions };
}

/** Linked phased tasks for a run (open + done), newest due first. */
export async function getRunTasks(agentId: string, runId: string) {
  const { data } = await supabaseAdmin
    .from("crm_tasks")
    .select("id, title, description, status, priority, due_at, metadata_json")
    .eq("agent_id", agentId)
    .eq("task_type", "boss_playbook")
    .contains("metadata_json", { run_id: runId })
    .order("due_at", { ascending: true })
    .limit(200);
  return (data ?? []) as Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string | null;
    due_at: string | null;
    metadata_json: PlaybookTaskMeta | null;
  }>;
}
