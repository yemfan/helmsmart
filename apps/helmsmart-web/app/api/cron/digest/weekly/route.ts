/**
 * GET /api/cron/digest/weekly
 *
 * Monday morning owner digest: for each org, summarizes cash on hand, open
 * receivables (with overdue), open bills (with due-soon), and open/overdue
 * tasks, then emails the owners + admins. Invoked daily by the dispatcher but
 * self-guards to Mondays (UTC) — pass ?force=1 to run any day (manual/testing).
 *
 * Auth: Bearer token via CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClientFor, packServiceConns } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const force = new URL(request.url).searchParams.get("force");
  if (!force && new Date().getUTCDay() !== 1) {
    return NextResponse.json({ skipped: "not monday" });
  }

  const today = new Date().toISOString().slice(0, 10);
  const weekOut = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  let sent = 0;
  let orgCount = 0;
  const errors: string[] = [];

  // Process every vertical's orgs — Core plus the medical project (if configured).
  for (const conn of packServiceConns()) {
    const db = createServiceClientFor(conn);
    const { data: orgs } = await db.from("organizations").select("id, name, weekly_digest_enabled");
    orgCount += orgs?.length ?? 0;

    for (const org of orgs ?? []) {
    try {
      if (org.weekly_digest_enabled === false) continue;
      // Recipients: owners + admins
      const { data: members } = await db
        .from("organization_members")
        .select("role, user:user_id(email)")
        .eq("organization_id", org.id)
        .in("role", ["owner", "admin"]);

      const emails = (members ?? [])
        .map((m) => {
          const u = Array.isArray(m.user) ? m.user[0] : m.user;
          return (u as { email?: string | null } | null)?.email ?? null;
        })
        .filter((e): e is string => !!e);

      if (!emails.length) continue;

      // Metrics
      const [banksRes, invRes, billsRes, tasksRes] = await Promise.all([
        db.from("bank_accounts").select("current_balance, type, is_active").eq("organization_id", org.id).eq("is_active", true),
        db.from("invoices").select("total, due_date, status").eq("organization_id", org.id).in("status", ["sent", "overdue"]),
        db.from("bills").select("amount, due_date, status").eq("organization_id", org.id).eq("status", "open"),
        db.from("tasks").select("due_date, status").eq("organization_id", org.id).in("status", ["open", "in_progress"]),
      ]);

      const banks = banksRes.data ?? [];
      const inv = invRes.data ?? [];
      const bills = billsRes.data ?? [];
      const tasks = tasksRes.data ?? [];

      if (!banks.length && !inv.length && !bills.length && !tasks.length) continue;

      const cash = banks.reduce(
        (s, a) => (a.type === "credit" ? s - Number(a.current_balance ?? 0) : s + Number(a.current_balance ?? 0)),
        0
      );
      const outstanding = inv.reduce((s, i) => s + Number(i.total), 0);
      const overdue = inv.filter((i) => (i.due_date as string) < today);
      const overdueAmt = overdue.reduce((s, i) => s + Number(i.total), 0);
      const owed = bills.reduce((s, b) => s + Number(b.amount), 0);
      const billsDueSoon = bills.filter((b) => (b.due_date as string) <= weekOut);
      const billsDueSoonAmt = billsDueSoon.reduce((s, b) => s + Number(b.amount), 0);
      const openTasks = tasks.length;
      const overdueTasks = tasks.filter((t) => t.due_date && (t.due_date as string) < today).length;

      const row = (label: string, value: string, sub: string, color: string) => `
        <td style="padding:14px 16px;border:1px solid #e2e8f0;border-radius:12px;width:50%">
          <div style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em">${label}</div>
          <div style="font-size:22px;font-weight:700;color:${color};margin-top:4px">${value}</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:2px">${sub}</div>
        </td>`;

      const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <tr><td style="background:#1e88e5;padding:20px 32px">
          <span style="font-size:16px;font-weight:700;color:#fff">${org.name}</span>
          <span style="font-size:13px;color:#aad4f7;float:right">Your week ahead</span>
        </td></tr>
        <tr><td style="padding:28px 32px 8px">
          <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#1e293b">Monday snapshot</p>
          <p style="margin:0 0 20px;font-size:13px;color:#64748b">Here's where things stand to start the week.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-spacing:8px;border-collapse:separate;margin:-8px">
            <tr>
              ${row("Cash on hand", fmt(cash), banks.length ? "Linked accounts" : "Link a bank", "#1e293b")}
              ${row("Outstanding", fmt(outstanding), overdueAmt > 0 ? `${fmt(overdueAmt)} overdue` : `${inv.length} open`, overdueAmt > 0 ? "#e11d48" : "#1e293b")}
            </tr>
            <tr>
              ${row("Bills to pay", fmt(owed), billsDueSoonAmt > 0 ? `${fmt(billsDueSoonAmt)} due this week` : `${bills.length} open`, billsDueSoonAmt > 0 ? "#d97706" : "#1e293b")}
              ${row("Open tasks", String(openTasks), overdueTasks > 0 ? `${overdueTasks} overdue` : "on track", overdueTasks > 0 ? "#e11d48" : "#1e293b")}
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 32px 32px">
          <a href="${appUrl}/home" style="display:inline-block;background:#1e88e5;color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px">Open dashboard →</a>
          <a href="${appUrl}/reports?tab=forecast" style="display:inline-block;margin-left:8px;color:#1e88e5;font-size:14px;font-weight:600;text-decoration:none;padding:12px 8px">View cash-flow forecast</a>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center">
          <p style="margin:0;font-size:12px;color:#94a3b8">Weekly digest · Powered by HelmSmart</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

      const text = `${org.name} — your week ahead\n\nCash on hand: ${fmt(cash)}\nOutstanding: ${fmt(outstanding)}${overdueAmt > 0 ? ` (${fmt(overdueAmt)} overdue)` : ""}\nBills to pay: ${fmt(owed)}${billsDueSoonAmt > 0 ? ` (${fmt(billsDueSoonAmt)} due this week)` : ""}\nOpen tasks: ${openTasks}${overdueTasks > 0 ? ` (${overdueTasks} overdue)` : ""}\n\nDashboard: ${appUrl}/home`;

      await sendEmail({
        fromName: `${org.name} via HelmSmart`,
        to: emails,
        subject: `Your week at ${org.name}: ${fmt(outstanding)} outstanding`,
        html,
        text,
      });
      sent++;
    } catch (err) {
      errors.push(`${org.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
    }
  }

  return NextResponse.json({ ok: true, orgs: orgCount, sent, errors });
}
