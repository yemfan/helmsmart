/**
 * GET /api/search?q=<query>&limit=<n>
 *
 * Full-text search across clients, invoices, transactions, and messages.
 * Requires valid Supabase session (auth cookie).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMemberOrgId } from "@/lib/auth/org-context";

export async function GET(request: NextRequest) {
  const q     = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? "5"), 10);

  if (q.length < 2) {
    return NextResponse.json({ clients: [], invoices: [], transactions: [], messages: [], estimates: [], projects: [], tasks: [] });
  }

  const orgId = await getMemberOrgId();
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const supabase = await createClient();
  const like = `%${q}%`;

  const [clientsRes, invoicesRes, transactionsRes, messagesRes, estimatesRes, projectsRes, tasksRes] = await Promise.all([
    // Clients
    supabase
      .from("clients")
      .select("id, first_name, last_name, company, email, phone, status")
      .eq("organization_id", orgId)
      .or(`first_name.ilike.${like},last_name.ilike.${like},company.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
      .limit(limit),

    // Invoices
    supabase
      .from("invoices")
      .select("id, invoice_number, status, total, due_date, clients(first_name, last_name)")
      .eq("organization_id", orgId)
      .ilike("invoice_number", like)
      .limit(limit),

    // Transactions
    supabase
      .from("bank_transactions")
      .select("id, date, name, merchant_name, amount, pending")
      .eq("organization_id", orgId)
      .or(`name.ilike.${like},merchant_name.ilike.${like}`)
      .order("date", { ascending: false })
      .limit(limit),

    // Messages
    supabase
      .from("messages")
      .select("id, channel, direction, body, sent_at, clients(first_name, last_name)")
      .eq("organization_id", orgId)
      .ilike("body", like)
      .order("sent_at", { ascending: false })
      .limit(limit),

    // Estimates
    supabase
      .from("estimates")
      .select("id, estimate_number, status, total")
      .eq("organization_id", orgId)
      .ilike("estimate_number", like)
      .limit(limit),

    // Projects
    supabase
      .from("projects")
      .select("id, name, status, color")
      .eq("organization_id", orgId)
      .ilike("name", like)
      .limit(limit),

    // Tasks
    supabase
      .from("tasks")
      .select("id, title, status, due_date")
      .eq("organization_id", orgId)
      .ilike("title", like)
      .limit(limit),
  ]);

  // Normalise invoice client join
  const invoices = (invoicesRes.data ?? []).map((inv) => {
    const cr = inv.clients;
    const c  = (Array.isArray(cr) ? cr[0] : cr) as { first_name: string | null; last_name: string | null } | null;
    return {
      id: inv.id,
      invoice_number: inv.invoice_number,
      status: inv.status,
      total: inv.total,
      due_date: inv.due_date,
      client_name: c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : null,
    };
  });

  const messages = (messagesRes.data ?? []).map((msg) => {
    const cr = msg.clients;
    const c  = (Array.isArray(cr) ? cr[0] : cr) as { first_name: string | null; last_name: string | null } | null;
    return {
      id: msg.id,
      channel: msg.channel,
      direction: msg.direction,
      body: (msg.body as string).slice(0, 120),
      sent_at: msg.sent_at,
      client_name: c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : null,
    };
  });

  return NextResponse.json({
    clients:      clientsRes.data ?? [],
    invoices,
    transactions: transactionsRes.data ?? [],
    messages,
    estimates:    estimatesRes.data ?? [],
    projects:     projectsRes.data ?? [],
    tasks:        tasksRes.data ?? [],
  });
}
