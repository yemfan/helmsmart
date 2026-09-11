/**
 * POST /api/ask
 *
 * Streaming AI business assistant. Injects live business data from Supabase
 * into the system prompt, then streams a Claude response back as plain text.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { orgCurrency } from "@/lib/books-currency";
import { moneyFormatter } from "@/lib/books-format";
import { languageDirective } from "@/lib/i18n/directives";
import { getMemberOrgId } from "@/lib/auth/org-context";

type Message = { role: "user" | "assistant"; content: string };

// ─── Business context builder ──────────────────────────────────────────────────

async function buildContext(
  orgId: string,
  tr: (key: string, opts?: Record<string, unknown>) => string,
  money: (value: number) => string,
): Promise<string> {
  const supabase = await createClient();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

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
  const context = await buildContext(orgId, t, money);
  const anthropic = new Anthropic({ apiKey });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        const stream = anthropic.messages.stream({
          model: "claude-haiku-4-5",
          max_tokens: 1024,
          // The owner reads this answer, so it comes back in their language.
          system: `You are an AI business assistant with access to real-time data from the user's business. Answer concisely and specifically. Format currency as ${currency}. Use bullet points for lists.${languageDirective(
            locale,
          )}\n\nToday's live business snapshot:\n\n${context}`,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });

        for await (const chunk of stream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        controller.enqueue(
          encoder.encode(`\n\n${t("ask.errors.stream", { message: msg || t("ask.error") })}`),
        );
      } finally {
        controller.close();
      }
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
