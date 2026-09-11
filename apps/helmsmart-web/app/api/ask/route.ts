/**
 * POST /api/ask
 *
 * Mark in the Ask Mark panel. He answers from live business data (injected
 * into his system prompt, as before), and now he can act: a tool loop over the
 * AI team's actions (`lib/ai-team/`) routes work to the specialists. Reads and
 * internal work (a task) run at once; anything that reaches a customer — a
 * text, a payment reminder — comes back as a proposal the owner approves in
 * the panel, never as a send.
 *
 * The response is newline-delimited JSON (`lib/ai-team/ask-stream.ts`): Mark's
 * words stream as he writes them, and each proposal arrives as the card to
 * render. A complete answer is counted as Mark's work (`questions_answered`)
 * after the response has finished.
 */

import { NextRequest, NextResponse, after } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { moneyFormatter } from "@/lib/books-format";
import { languageDirective } from "@/lib/i18n/directives";
import { requireOrgMember } from "@/lib/auth/org-context";
import { firstOfMonth } from "@/lib/org-date";
import { recordMarkAnswer } from "@/lib/workforce-attribution";
import { buildActionContext } from "@/lib/ai-team/context";
import { AI_TEAM_ACTIONS, defaultRunDeps, toolsForModel } from "@/lib/ai-team/registry";
import { runAction } from "@/lib/ai-team/run-action";
import { MARK_AGENT_MODEL, runMarkLoop } from "@/lib/ai-team/mark-loop";
import { anthropicMarkModel } from "@/lib/ai-team/mark-model";
import { buildMarkSystemPrompt } from "@/lib/ai-team/mark-prompt";
import { toApprovalView } from "@/lib/ai-team/approval-view";
import { ASK_CONTENT_TYPE, encodeAskEvent, sanitizeHistory, type AskEvent } from "@/lib/ai-team/ask-stream";

type Db = Awaited<ReturnType<typeof createClient>>;

// ─── Business context builder ──────────────────────────────────────────────────

async function buildContext(
  supabase: Db,
  orgId: string,
  /** The business's date, `YYYY-MM-DD`. */
  todayStr: string,
  tr: (key: string, opts?: Record<string, unknown>) => string,
  money: (value: number) => string,
): Promise<string> {
  // The org's date: Mark's "Today:", the overdue check and month-to-date all
  // count in the business's day, the one its dashboard shows. `todayStr` is
  // `orgToday` from the action context, so Mark's tools count in the same day.
  const monthStart = firstOfMonth(todayStr);

  const [orgRes, clientsRes, invoicesRes, txnsRes] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).single(),
    supabase.from("clients").select("status").eq("organization_id", orgId),
    supabase
      .from("invoices")
      .select("status, total, due_date")
      .eq("organization_id", orgId)
      .neq("status", "void"),
    supabase
      .from("bank_transactions")
      .select("amount, personal_finance_category")
      .eq("organization_id", orgId)
      .eq("pending", false)
      .gte("date", monthStart)
      .lte("date", todayStr),
  ]);

  const orgName = orgRes.data?.name ?? tr("ask.yourBusiness");
  const clients = clientsRes.data ?? [];
  const invoices = invoicesRes.data ?? [];
  const txns = txnsRes.data ?? [];

  // Summarise clients by status
  const clientCounts = clients.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  // Summarise invoices
  const outstanding = invoices.filter(
    (i) => i.status === "sent" || i.status === "overdue"
  );
  const overdue = invoices.filter(
    (i) =>
      i.status === "overdue" ||
      (i.status === "sent" && i.due_date < todayStr)
  );
  const paid = invoices.filter((i) => i.status === "paid");
  const totalOutstanding = outstanding.reduce((s, i) => s + Number(i.total), 0);
  const totalPaid = paid.reduce((s, i) => s + Number(i.total), 0);

  // Summarise bank transactions (MTD)
  let mtdRevenue = 0;
  let mtdExpenses = 0;
  const uncategorized = tr("ask.uncategorized");
  const catMap = new Map<string, number>();
  for (const t of txns) {
    // Plaid sign convention: negative = inflow (revenue), positive = outflow (expense)
    if (t.amount < 0) {
      mtdRevenue += Math.abs(t.amount);
    } else {
      mtdExpenses += t.amount;
      const cat = t.personal_finance_category ?? uncategorized;
      catMap.set(cat, (catMap.get(cat) ?? 0) + t.amount);
    }
  }
  const topCats = Array.from(catMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([cat, amt]) => `  • ${cat.replace(/_/g, " ").toLowerCase()}: ${money(amt)}`)
    .join("\n");

  return `Organization: ${orgName}
Today: ${todayStr} | Month-to-date: ${monthStart} to ${todayStr}

CLIENTS (${clients.length} total)
  Active: ${clientCounts["active"] ?? 0}  |  Leads: ${clientCounts["lead"] ?? 0}  |  Prospects: ${clientCounts["prospect"] ?? 0}  |  Inactive: ${clientCounts["inactive"] ?? 0}

INVOICES
  Outstanding (unpaid): ${outstanding.length} invoices · ${money(totalOutstanding)}
  Overdue:              ${overdue.length} invoices
  Paid (all-time):      ${paid.length} invoices · ${money(totalPaid)}

BANK TRANSACTIONS (month-to-date)
  Revenue:  ${money(mtdRevenue)}
  Expenses: ${money(mtdExpenses)}
  Net:      ${money(mtdRevenue - mtdExpenses)}
${topCats ? `\n  Top expense categories:\n${topCats}` : ""}`;
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  /*
   * Every string below is rendered straight into the assistant panel, so the
   * owner reads it: the failures are translated here rather than at the call
   * site that shows whatever text came back.
   */
  const t = await getServerT("home");

  // Membership, and the role the actions are gated on.
  const access = await requireOrgMember();
  if (!access.ok) return new NextResponse(t("ask.errors.unauthorized"), { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new NextResponse(t("ask.errors.notConfigured"), { status: 503 });
  }

  let raw: unknown;
  try {
    raw = ((await request.json()) as { messages?: unknown } | null)?.messages;
  } catch {
    return new NextResponse(t("ask.errors.invalidRequest"), { status: 400 });
  }
  const history = sanitizeHistory(raw);
  if (!history.length) return new NextResponse(t("ask.errors.noMessages"), { status: 400 });

  const supabase = await createClient();
  const ctx = await buildActionContext({
    db: supabase,
    orgId: access.orgId,
    userId: access.userId,
    role: access.role,
  });
  const money = moneyFormatter(ctx.locale, ctx.currency);
  const snapshot = await buildContext(supabase, ctx.orgId, ctx.today, t, money);
  const system = buildMarkSystemPrompt({
    snapshot,
    currency: ctx.currency,
    today: ctx.today,
    team: ctx.team,
    // The owner reads Mark's words, so they come back in the owner's language.
    languageDirective: languageDirective(ctx.locale),
  });
  const tools = toolsForModel(AI_TEAM_ACTIONS, ctx.team);
  const model = anthropicMarkModel(new Anthropic({ apiKey }), MARK_AGENT_MODEL);

  /*
   * A complete answer is Mark's work, and the Command Center counts it. The
   * count is written in `after()` — once the response has finished — so the
   * owner never waits on it, and `recordMarkAnswer` swallows its own failures
   * (and no-ops for an org that never seeded its workforce), so it can't break
   * an answer. A stream that errored, produced nothing, or was abandoned by
   * the client isn't counted.
   */
  let settle: (answered: boolean) => void = () => {};
  const answered = new Promise<boolean>((resolve) => {
    settle = resolve;
  });
  after(async () => {
    if (await answered) await recordMarkAnswer(supabase, ctx.orgId);
  });

  const encoder = new TextEncoder();
  let cancelled = false;
  const readable = new ReadableStream({
    async start(controller) {
      const send = (event: AskEvent) => {
        if (!cancelled) controller.enqueue(encoder.encode(encodeAskEvent(event)));
      };
      let ok = false;
      try {
        const result = await runMarkLoop({
          model,
          system,
          tools,
          history,
          dispatch: (name, input) => runAction(ctx, name, input, defaultRunDeps, { surface: "ask" }),
          emit: (event) =>
            event.type === "text"
              ? send({ t: "text", v: event.text })
              : send({ t: "proposal", approval: toApprovalView(event.outcome.approval, ctx.team, ctx.now) }),
          copy: {
            roundLimit: t("ask.roundLimit"),
            budget: t("ask.budget"),
            refusal: t("ask.refusal"),
          },
        });
        ok = result.stop !== "refusal" && (result.text.trim().length > 0 || result.toolCalls.length > 0);
      } catch (err) {
        // The provider's own error is for the log, not for the owner.
        console.error("[ask] Mark's loop failed:", err);
        send({ t: "error", v: t("ask.error") });
      } finally {
        settle(ok);
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      // The owner closed the panel mid-answer: not an answer they received.
      cancelled = true;
      settle(false);
    },
  });

  return new NextResponse(readable, {
    headers: {
      "Content-Type": ASK_CONTENT_TYPE,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
    },
  });
}
