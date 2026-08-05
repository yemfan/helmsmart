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
