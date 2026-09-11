/**
 * Read actions — facts for Mark to reason over. They run at once, change
 * nothing, and return English data for the model (the owner never sees a tool
 * result; Mark answers in the owner's language).
 *
 * Each is owned by the specialist whose domain the data is, so Mark can say
 * who looked: Sarah knows the clients, Alex the invoices, Emma the calls.
 */
import { z } from "zod";
import { moneyFormatter } from "@/lib/books-format";
import { daysBetween } from "@/lib/org-date";
import { formatPhoneDisplay } from "@/lib/phone-display";
import { ACTION_KEYS } from "../approval-view";
import { CLIENT_COLUMNS, UNPAID_INVOICE_STATUSES, clientName, type OrgClient } from "../entities";
import { defineAction, type ActionContext } from "../types";

const FIND_LIMIT = 10;

/** Names for a set of client ids, org-scoped. */
async function namesFor(ctx: ActionContext, ids: Array<string | null>): Promise<Record<string, OrgClient>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return {};
  const { data, error } = await ctx.db
    .from("clients")
    .select(CLIENT_COLUMNS)
    .eq("organization_id", ctx.orgId)
    .in("id", unique);
  if (error) throw new Error(`clients lookup failed: ${error.message}`);
  const out: Record<string, OrgClient> = {};
  for (const c of (data ?? []) as OrgClient[]) out[c.id] = c;
  return out;
}

export const findClients = defineAction({
  key: ACTION_KEYS.findClients,
  employee: "sarah",
  riskClass: "read",
  permission: "clients.read",
  description:
    "Find clients in this business by name, phone number or email (part of one is fine). Returns each match's id, name, phone, email and preferred language. ALWAYS use this before texting someone or naming a client in an action — never guess an id. If several people match and the owner didn't say which, ask ONE question naming them instead of picking one.",
  input: z.object({
    query: z.string().min(1).max(100).describe("A name, phone number or email address, or part of one."),
  }),
  async execute({ query }, ctx) {
    const tokens = query
      .replace(/[,()%*]/g, " ")
      .split(/\s+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const digits = query.replace(/\D/g, "");
    if (tokens.length === 0) return { status: "done", summary: "No search terms.", data: { matches: [] } };

    // One probe the database can index-scan, then the whole query applied
    // here: "Dana Lee" is two words, and no single column holds both.
    const byPhone = digits.length >= 7;
    const probe = byPhone ? digits.slice(-4) : [...tokens].sort((a, b) => b.length - a.length)[0];
    const like = `%${probe}%`;
    const { data, error } = await ctx.db
      .from("clients")
      .select(CLIENT_COLUMNS)
      .eq("organization_id", ctx.orgId)
      .or(`first_name.ilike.${like},last_name.ilike.${like},company.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return { status: "failed", error: `Client search failed: ${error.message}` };

    const rows = ((data ?? []) as OrgClient[]).filter((c) => {
      if (byPhone) return (c.phone ?? "").replace(/\D/g, "").includes(digits.slice(-7));
      const hay = `${c.first_name ?? ""} ${c.last_name ?? ""} ${c.company ?? ""} ${c.email ?? ""}`.toLowerCase();
      return tokens.every((tok) => hay.includes(tok));
    });
    const matches = rows.slice(0, FIND_LIMIT).map((c) => ({
      id: c.id,
      name: clientName(c),
      phone: c.phone ? formatPhoneDisplay(c.phone) : null,
      email: c.email,
      preferred_language: c.preferred_language,
      status: c.status,
    }));
    const note =
      matches.length === 0
        ? "No client matches. Tell the owner and ask who they meant; do not guess."
        : matches.length > 1
          ? "Several clients match. Unless the owner's request already says which one, ask ONE short question naming them and stop."
          : undefined;
    return {
      status: "done",
      summary: `${matches.length} client${matches.length === 1 ? "" : "s"} matched "${query}".`,
      data: { matches, ...(note ? { note } : {}) },
    };
  },
});

export const listOverdueInvoices = defineAction({
  key: ACTION_KEYS.listOverdueInvoices,
  employee: "alex",
  riskClass: "read",
  permission: "invoices.read",
  description:
    "List this business's overdue invoices (sent, unpaid, past their due date): invoice id and number, client, amount, days overdue, how many reminders went out and when, and whether the client has an email for a reminder. Use it before proposing a payment reminder, or when the owner asks what is overdue.",
  input: z.object({}),
  async execute(_params, ctx) {
    const { data, error } = await ctx.db
      .from("invoices")
      .select("id, invoice_number, total, due_date, status, client_id, reminder_count, last_reminder_sent_at")
      .eq("organization_id", ctx.orgId)
      .in("status", UNPAID_INVOICE_STATUSES)
      .lt("due_date", ctx.today)
      .order("due_date", { ascending: true })
      .limit(25);
    if (error) return { status: "failed", error: `Invoice lookup failed: ${error.message}` };
    type Row = {
      id: string;
      invoice_number: string;
      total: number;
      due_date: string;
      client_id: string | null;
      reminder_count: number | null;
      last_reminder_sent_at: string | null;
    };
    const rows = (data ?? []) as Row[];
    const clients = await namesFor(ctx, rows.map((r) => r.client_id));
    const money = moneyFormatter(ctx.locale, ctx.currency);
    const invoices = rows.map((r) => {
      const c = r.client_id ? clients[r.client_id] : undefined;
      return {
        id: r.id,
        invoice_number: r.invoice_number,
        client_id: r.client_id,
        client_name: c ? clientName(c) : null,
        client_has_email: !!c?.email,
        amount: money(Number(r.total)),
        due_date: r.due_date,
        days_overdue: daysBetween(r.due_date, ctx.today),
        reminders_sent: r.reminder_count ?? 0,
        last_reminder_sent_at: r.last_reminder_sent_at,
      };
    });
    const total = rows.reduce((s, r) => s + Number(r.total), 0);
    return {
      status: "done",
      summary: `${invoices.length} overdue invoice${invoices.length === 1 ? "" : "s"}.`,
      data: { invoices, total_overdue: money(total) },
    };
  },
});

export const listOpenTasks = defineAction({
  key: ACTION_KEYS.listOpenTasks,
  employee: "mark",
  riskClass: "read",
  permission: "pipeline.read",
  description:
    "List the business's open tasks (open or in progress), soonest due first: title, due date, priority, and the client it is about. Use it when the owner asks what is on their plate.",
  input: z.object({}),
  async execute(_params, ctx) {
    const { data, error } = await ctx.db
      .from("tasks")
      .select("id, title, due_date, priority, status, client_id")
      .eq("organization_id", ctx.orgId)
      .in("status", ["open", "in_progress"])
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(25);
    if (error) return { status: "failed", error: `Task lookup failed: ${error.message}` };
    type Row = { id: string; title: string; due_date: string | null; priority: string; status: string; client_id: string | null };
    const rows = (data ?? []) as Row[];
    const clients = await namesFor(ctx, rows.map((r) => r.client_id));
    const tasks = rows.map((r) => ({
      id: r.id,
      title: r.title,
      due_date: r.due_date,
      overdue: !!r.due_date && r.due_date < ctx.today,
      priority: r.priority,
      status: r.status,
      client_name: r.client_id && clients[r.client_id] ? clientName(clients[r.client_id]) : null,
    }));
    return { status: "done", summary: `${tasks.length} open task${tasks.length === 1 ? "" : "s"}.`, data: { tasks } };
  },
});

export const listRecentCalls = defineAction({
  key: ACTION_KEYS.listRecentCalls,
  employee: "emma",
  riskClass: "read",
  permission: "clients.read",
  description:
    "List recent phone calls to the business, newest first: who called (client name or number), whether the call was answered, missed or went to voicemail, and whether a missed caller was texted back. Use it when the owner asks who called.",
  input: z.object({
    days: z.number().int().min(1).max(30).optional().describe("How many days back to look. Default 7."),
  }),
  async execute({ days }, ctx) {
    const since = new Date(ctx.now.getTime() - (days ?? 7) * 86_400_000).toISOString();
    const { data, error } = await ctx.db
      .from("calls")
      .select("id, from_number, client_id, status, auto_replied, called_at")
      .eq("organization_id", ctx.orgId)
      .gte("called_at", since)
      .order("called_at", { ascending: false })
      .limit(20);
    if (error) return { status: "failed", error: `Call lookup failed: ${error.message}` };
    type Row = { id: string; from_number: string; client_id: string | null; status: string; auto_replied: boolean; called_at: string };
    const rows = (data ?? []) as Row[];
    const clients = await namesFor(ctx, rows.map((r) => r.client_id));
    const calls = rows.map((r) => ({
      id: r.id,
      caller: r.client_id && clients[r.client_id] ? clientName(clients[r.client_id]) : formatPhoneDisplay(r.from_number),
      client_id: r.client_id,
      status: r.status,
      texted_back: r.auto_replied,
      called_at: r.called_at,
    }));
    return { status: "done", summary: `${calls.length} call${calls.length === 1 ? "" : "s"}.`, data: { calls } };
  },
});
