import "server-only";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { defineTool } from "../types";

/**
 * "Ask Max anything" read tools (capability-map Phase 2).
 *
 * Aggregate, read-only views over the business so Max can ANSWER — not just DO.
 * "How's my pipeline?", "which deals are at risk?", "what did I make this
 * year?". All riskClass "research" (no writes, no sends); the model narrates
 * the structured data they return.
 */

const NO_ARGS = z.object({}).describe("No input.");

function daysBetween(fromIso: string, to: Date): number {
  return Math.floor((to.getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

// ── get_pipeline ─────────────────────────────────────────────────────

export const getPipeline = defineTool({
  name: "get_pipeline",
  description:
    "Answer questions about the lead/contact pipeline: how many leads, how many are hot vs warm vs cold, who's cooling off (no activity lately), and the top hot leads right now. Use for 'how's my pipeline', 'who are my hot leads', 'who's gone quiet', 'how many leads do I have'.",
  inputSchema: NO_ARGS,
  riskClass: "research",
  assignee: "sales_assistant",
  execute: async (ctx) => {
    const { data, error } = await supabaseAdmin
      .from("contacts")
      .select("id, name, rating, engagement_score, intent, buying_or_selling, last_activity_at")
      .eq("agent_id", ctx.agentId);
    if (error) return { status: "failed", error: error.message };
    const rows = (data ?? []) as Array<{
      id: string; name: string | null; rating: string | null;
      engagement_score: number | null; intent: string | null;
      buying_or_selling: string | null; last_activity_at: string | null;
    }>;
    const now = new Date();
    const isHot = (r: (typeof rows)[number]) => r.rating === "hot" || Number(r.engagement_score ?? 0) >= 70;
    const isWarm = (r: (typeof rows)[number]) => !isHot(r) && (r.rating === "warm" || Number(r.engagement_score ?? 0) >= 40);
    const hot = rows.filter(isHot);
    const warm = rows.filter(isWarm);
    const cold = rows.filter((r) => !isHot(r) && !isWarm(r));
    const cooling = rows.filter(
      (r) => (isHot(r) || isWarm(r)) && r.last_activity_at && daysBetween(r.last_activity_at, now) >= 14,
    );
    const topHot = [...hot]
      .sort((a, b) => Number(b.engagement_score ?? 0) - Number(a.engagement_score ?? 0))
      .slice(0, 5)
      .map((r) => ({
        name: r.name ?? "Unnamed",
        score: Number(r.engagement_score ?? 0),
        intent: r.intent ?? r.buying_or_selling ?? null,
        lastActiveDaysAgo: r.last_activity_at ? daysBetween(r.last_activity_at, now) : null,
      }));

    return {
      status: "completed",
      summary: `Pipeline: ${rows.length} contacts — ${hot.length} hot, ${warm.length} warm, ${cold.length} cold${
        cooling.length ? `; ${cooling.length} cooling off (no activity 14+ days)` : ""
      }.`,
      artifactUrl: "/dashboard/contacts",
      data: { total: rows.length, hot: hot.length, warm: warm.length, cold: cold.length, cooling: cooling.length, topHot },
    };
  },
});

// ── get_deals ────────────────────────────────────────────────────────

type DeadlineRow = {
  id: string; property_address: string; status: string;
  inspection_deadline: string | null; inspection_completed_at: string | null;
  appraisal_deadline: string | null; appraisal_completed_at: string | null;
  loan_contingency_deadline: string | null; loan_contingency_removed_at: string | null;
  closing_date: string | null;
};

export const getDeals = defineTool({
  name: "get_deals",
  description:
    "Answer questions about active transactions and their deadlines: which deals are in progress, what contingency/closing deadlines are coming up, and which are AT RISK (due soon and not yet cleared). Use for 'how are my deals', 'what's closing soon', 'which deals are at risk', 'what deadlines are coming up'.",
  inputSchema: z.object({
    within_days: z.number().int().min(1).max(120).optional().describe("Deadline horizon in days (default 14)."),
  }),
  riskClass: "research",
  assignee: "transaction_assistant",
  execute: async (ctx, input) => {
    const horizon = input.within_days ?? 14;
    const { data, error } = await supabaseAdmin
      .from("transactions")
      .select(
        "id, property_address, status, inspection_deadline, inspection_completed_at, appraisal_deadline, appraisal_completed_at, loan_contingency_deadline, loan_contingency_removed_at, closing_date",
      )
      .eq("agent_id", ctx.agentId)
      .in("status", ["active", "pending"]);
    if (error) return { status: "failed", error: error.message };
    const deals = (data ?? []) as DeadlineRow[];

    const now = new Date();
    const horizonMs = now.getTime() + horizon * 86_400_000;
    const alerts: Array<{ property: string; milestone: string; dueInDays: number; risk: "high" | "medium" }> = [];
    for (const t of deals) {
      const candidates = [
        { label: "Inspection", date: t.inspection_deadline, done: t.inspection_completed_at },
        { label: "Appraisal", date: t.appraisal_deadline, done: t.appraisal_completed_at },
        { label: "Loan contingency", date: t.loan_contingency_deadline, done: t.loan_contingency_removed_at },
        { label: "Closing", date: t.closing_date, done: null as string | null },
      ];
      for (const c of candidates) {
        if (!c.date || c.done) continue;
        const due = new Date(c.date);
        if (due.getTime() > horizonMs) continue;
        const dueInDays = daysBetween(now.toISOString(), due);
        alerts.push({
          property: t.property_address,
          milestone: c.label,
          dueInDays,
          risk: due.getTime() < now.getTime() + 3 * 86_400_000 ? "high" : "medium",
        });
      }
    }
    alerts.sort((a, b) => a.dueInDays - b.dueInDays);
    const highRisk = alerts.filter((a) => a.risk === "high").length;

    return {
      status: "completed",
      summary: `${deals.length} active deal${deals.length === 1 ? "" : "s"}; ${alerts.length} deadline${
        alerts.length === 1 ? "" : "s"
      } in the next ${horizon} days${highRisk ? ` (${highRisk} at high risk — due within 3 days)` : ""}.`,
      artifactUrl: "/dashboard/transactions",
      data: {
        deals: deals.map((d) => ({ property: d.property_address, status: d.status, closing: d.closing_date })),
        deadlines: alerts,
      },
    };
  },
});

// ── get_financials ───────────────────────────────────────────────────

export const getFinancials = defineTool({
  name: "get_financials",
  description:
    "Answer money questions: commission pipeline (in-flight deals), commission earned/closed so far this year, the next expected payout, and expenses this month. Use for 'what did I make', 'what's my commission pipeline', 'when's my next payout', 'how much have I spent', 'how are my numbers'.",
  inputSchema: NO_ARGS,
  riskClass: "research",
  assignee: "accountant",
  execute: async (ctx) => {
    const now = new Date();
    const yearStart = `${now.getFullYear()}-01-01`;
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const todayIso = now.toISOString().slice(0, 10);

    const [txRes, closedRes, expRes] = await Promise.all([
      supabaseAdmin
        .from("transactions")
        .select("property_address, closing_date, gross_commission, agent_net_commission, status")
        .eq("agent_id", ctx.agentId)
        .in("status", ["active", "pending"]),
      supabaseAdmin
        .from("transactions")
        .select("gross_commission, agent_net_commission, closing_date")
        .eq("agent_id", ctx.agentId)
        .eq("status", "closed")
        .gte("closing_date", yearStart),
      supabaseAdmin
        .from("expenses")
        .select("amount")
        .eq("agent_id", ctx.agentId)
        .gte("expense_date", monthStart),
    ]);
    if (txRes.error) return { status: "failed", error: txRes.error.message };

    const inflight = (txRes.data ?? []) as Array<{
      property_address: string; closing_date: string | null;
      gross_commission: number | null; agent_net_commission: number | null; status: string;
    }>;
    const closed = (closedRes.data ?? []) as Array<{ gross_commission: number | null; agent_net_commission: number | null }>;
    const expenses = (expRes.data ?? []) as Array<{ amount: number | null }>;

    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const pipelineGross = sum(inflight.map((t) => Number(t.gross_commission ?? 0)));
    const pipelineNet = sum(inflight.map((t) => Number(t.agent_net_commission ?? t.gross_commission ?? 0)));
    const closedNet = sum(closed.map((t) => Number(t.agent_net_commission ?? t.gross_commission ?? 0)));
    const expensesMonth = sum(expenses.map((e) => Number(e.amount ?? 0)));

    // Next payout = nearest-closing in-flight deal with a future closing date.
    const upcoming = inflight
      .filter((t) => t.closing_date && t.closing_date >= todayIso)
      .sort((a, b) => (a.closing_date! < b.closing_date! ? -1 : 1))[0];
    const nextPayout = upcoming
      ? {
          property: upcoming.property_address,
          closing: upcoming.closing_date,
          net: Number(upcoming.agent_net_commission ?? upcoming.gross_commission ?? 0),
        }
      : null;

    const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
    return {
      status: "completed",
      summary: `Commission pipeline ${fmt(pipelineNet)} across ${inflight.length} in-flight deal${
        inflight.length === 1 ? "" : "s"
      }; ${fmt(closedNet)} closed YTD. ${
        nextPayout ? `Next payout ~${fmt(nextPayout.net)} at ${nextPayout.property} (closes ${nextPayout.closing}). ` : ""
      }Expenses this month ${fmt(expensesMonth)}.`,
      artifactUrl: "/dashboard/ai-accountant",
      data: { pipelineGross, pipelineNet, closedNet, expensesMonth, nextPayout, inflightCount: inflight.length },
    };
  },
});

// ── get_calendar ─────────────────────────────────────────────────────

export const getCalendar = defineTool({
  name: "get_calendar",
  description:
    "Answer questions about the schedule: what's on the calendar today or in the next few days — appointments, showings, calls, meetings — and who they're with. Use for 'what's on my calendar', 'what do I have today', 'what's coming up this week', 'am I free tomorrow'.",
  inputSchema: z.object({
    within_days: z.number().int().min(1).max(60).optional().describe("How many days ahead to look (default 7)."),
  }),
  riskClass: "research",
  assignee: "receptionist",
  execute: async (ctx, input) => {
    const horizon = input.within_days ?? 7;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const end = new Date(now.getTime() + horizon * 86_400_000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("lead_calendar_events")
      .select("id, title, starts_at, status, contacts(name)")
      .eq("agent_id", ctx.agentId)
      .neq("status", "cancelled")
      .gte("starts_at", start)
      .lte("starts_at", end)
      .order("starts_at", { ascending: true })
      .limit(50);
    if (error) return { status: "failed", error: error.message };
    const rows = (data ?? []) as Array<{
      id: string; title: string | null; starts_at: string; status: string | null;
      contacts: { name: string | null } | { name: string | null }[] | null;
    }>;
    const contactName = (c: (typeof rows)[number]["contacts"]) =>
      Array.isArray(c) ? c[0]?.name ?? null : c?.name ?? null;
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime();
    const todayCount = rows.filter((r) => new Date(r.starts_at).getTime() <= todayEnd).length;
    const events = rows.map((r) => ({
      title: r.title ?? "Untitled",
      when: r.starts_at,
      who: contactName(r.contacts),
    }));

    return {
      status: "completed",
      summary: `${todayCount} appointment${todayCount === 1 ? "" : "s"} today; ${rows.length} in the next ${horizon} days.`,
      artifactUrl: "/dashboard/calendar",
      data: { todayCount, total: rows.length, events },
    };
  },
});

// ── get_sphere_signals ───────────────────────────────────────────────

export const getSphereSignals = defineTool({
  name: "get_sphere_signals",
  description:
    "Answer 'who in my sphere is showing buying/selling signals' — life-event and intent signals detected on contacts (new job, growing family, equity milestone, browsing activity) with the suggested next move. Use for 'who's likely to sell', 'who's likely to buy', 'any signals in my sphere', 'who should I reach out to'.",
  inputSchema: NO_ARGS,
  riskClass: "research",
  assignee: "sales_assistant",
  execute: async (ctx) => {
    // contact_signals has no agent_id; scope through the contacts embed.
    const { data, error } = await supabaseAdmin
      .from("contact_signals")
      .select("id, signal_type, label, confidence, suggested_action, detected_at, contacts!inner(name, agent_id)")
      .eq("contacts.agent_id", ctx.agentId)
      .is("dismissed_at", null)
      .order("detected_at", { ascending: false })
      .limit(20);
    if (error) return { status: "failed", error: error.message };
    const rows = (data ?? []) as Array<{
      id: string; signal_type: string | null; label: string | null; confidence: string | null;
      suggested_action: string | null; detected_at: string | null;
      contacts: { name: string | null } | { name: string | null }[] | null;
    }>;
    const name = (c: (typeof rows)[number]["contacts"]) => (Array.isArray(c) ? c[0]?.name : c?.name) ?? "A contact";
    const signals = rows.map((r) => ({
      contact: name(r.contacts),
      type: r.signal_type,
      label: r.label,
      confidence: r.confidence,
      suggestedAction: r.suggested_action,
    }));

    return {
      status: "completed",
      summary: rows.length
        ? `${rows.length} active sphere signal${rows.length === 1 ? "" : "s"} — e.g. ${signals
            .slice(0, 3)
            .map((s) => `${s.contact} (${s.label ?? s.type})`)
            .join(", ")}.`
        : "No active sphere signals right now.",
      artifactUrl: "/dashboard/sphere/signals",
      data: { count: rows.length, signals },
    };
  },
});

// ── get_performance ──────────────────────────────────────────────────

export const getPerformance = defineTool({
  name: "get_performance",
  description:
    "Answer 'how's business doing / how am I trending' — a throughput snapshot: total leads, active deals in flight, and deals closed so far this year with their volume. Complements get_financials (money) and get_pipeline (leads) with the overall business picture. Use for 'how's business', 'how am I doing this year', 'how many deals have I closed'.",
  inputSchema: NO_ARGS,
  riskClass: "research",
  assignee: "accountant",
  execute: async (ctx) => {
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const [leadsRes, activeRes, closedRes] = await Promise.all([
      supabaseAdmin.from("contacts").select("id", { count: "exact", head: true }).eq("agent_id", ctx.agentId),
      supabaseAdmin
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", ctx.agentId)
        .in("status", ["active", "pending"]),
      supabaseAdmin
        .from("transactions")
        .select("gross_commission, purchase_price")
        .eq("agent_id", ctx.agentId)
        .eq("status", "closed")
        .gte("closing_date", yearStart),
    ]);
    if (closedRes.error) return { status: "failed", error: closedRes.error.message };
    const leads = leadsRes.count ?? 0;
    const active = activeRes.count ?? 0;
    const closed = (closedRes.data ?? []) as Array<{ gross_commission: number | null; purchase_price: number | null }>;
    const closedCount = closed.length;
    const closedVolume = closed.reduce((a, t) => a + Number(t.purchase_price ?? 0), 0);
    const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

    return {
      status: "completed",
      summary: `${leads} lead${leads === 1 ? "" : "s"} in the CRM, ${active} deal${
        active === 1 ? "" : "s"
      } in flight, and ${closedCount} closed this year${closedVolume ? ` (${fmt(closedVolume)} in volume)` : ""}.`,
      artifactUrl: "/dashboard/boss",
      data: { leads, activeDeals: active, closedYtd: closedCount, closedVolumeYtd: closedVolume },
    };
  },
});
