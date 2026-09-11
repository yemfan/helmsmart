/**
 * POST /api/ask
 *
 * Mark's answers in the Ask Mark panel. Injects live business data from
 * Supabase into the system prompt, then streams a Claude response back as
 * plain text. A complete answer is counted as Mark's work (`questions_answered`)
 * after the response has finished.
 */

import { NextRequest, NextResponse, after } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { orgCurrency } from "@/lib/books-currency";
import { moneyFormatter } from "@/lib/books-format";
import { languageDirective } from "@/lib/i18n/directives";
import { getMemberOrgId } from "@/lib/auth/org-context";
import { orgToday } from "@/lib/org-timezone";
import { firstOfMonth } from "@/lib/org-date";
import { recordMarkAnswer } from "@/lib/workforce-attribution";

type Message = { role: "user" | "assistant"; content: string };
type Db = Awaited<ReturnType<typeof createClient>>;

// ─── Business context builder ──────────────────────────────────────────────────

async function buildContext(
  supabase: Db,
  orgId: string,
  tr: (key: string, opts?: Record<string, unknown>) => string,
  money: (value: number) => string,
): Promise<string> {
  // The org's date: Mark's "Today:", the overdue check and month-to-date all
  // count in the business's day, the one its dashboard shows.
  const todayStr = await orgToday(orgId);
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
   * owner reads it: the failures are translated here rather than at the two
   * call sites that show whatever text came back.
   */
  const t = await getServerT("home");
  const locale = await getServerLocale();

  const orgId = (await getMemberOrgId()) ?? "";
  if (!orgId) return new NextResponse(t("ask.errors.unauthorized"), { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new NextResponse(t("ask.errors.notConfigured"), { status: 503 });
  }

  let messages: Message[] = [];
  try {
    const body = await request.json();
    messages = (body.messages ?? []) as Message[];
  } catch {
    return new NextResponse(t("ask.errors.invalidRequest"), { status: 400 });
  }
  if (!messages.length) return new NextResponse(t("ask.errors.noMessages"), { status: 400 });

  const currency = await orgCurrency(orgId);
  const money = moneyFormatter(locale, currency);
  const supabase = await createClient();
  const context = await buildContext(supabase, orgId, t, money);
  const anthropic = new Anthropic({ apiKey });

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
    if (await answered) await recordMarkAnswer(supabase, orgId);
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let text = "";
      let ok = false;
      try {
        const stream = anthropic.messages.stream({
          model: "claude-haiku-4-5",
          max_tokens: 1024,
          // The owner reads this answer, so it comes back in their language.
          // Mark answers; he does not act (yet), and must not say he did.
          system: `You are Mark, the AI Chief Operating Officer on this business's AI team, answering the owner's questions about their business. Answer from the live snapshot below, concisely and specifically; if it doesn't hold what they asked, say so instead of guessing. Format currency as ${currency}. Use bullet points for lists. You can't take actions from this chat — you don't send messages, change records or hand work to other AI employees — so never say you did or will; if asked, say plainly that you can't do that from here yet.${languageDirective(
            locale,
          )}\n\nToday's live business snapshot:\n\n${context}`,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });

        for await (const chunk of stream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            text += chunk.delta.text;
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
        ok = text.trim().length > 0;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        controller.enqueue(
          encoder.encode(`\n\n${t("ask.errors.stream", { message: msg || t("ask.error") })}`),
        );
      } finally {
        settle(ok);
        controller.close();
      }
    },
    cancel() {
      // The owner closed the panel mid-answer: not an answer they received.
      settle(false);
    },
  });

  return new NextResponse(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
    },
  });
}
