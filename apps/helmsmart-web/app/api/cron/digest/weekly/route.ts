/**
 * GET /api/cron/digest/weekly
 *
 * Monday morning owner digest: for each org, summarizes cash on hand, open
 * receivables (with overdue), open bills (with due-soon), and open/overdue
 * tasks, then emails the owners + admins. Invoked daily by the dispatcher but
 * self-guards to Mondays (UTC) — pass ?force=1 to run any day (manual/testing).
 *
 * LANGUAGE. Nobody asked for this mail, so there is no request and no cookie
 * to read a locale from. Each recipient's own `user_preferences.ui_locale`
 * decides their copy, their date and number formatting; the org's `currency`
 * column decides the symbol, because the ledger is the org's regardless of who
 * is reading it. Recipients are grouped by locale, so an org with two English
 * owners and one Chinese owner renders twice and sends twice, not three times.
 *
 * Auth: Bearer token via CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { intlLocale } from "@leadsmart/i18n";
import { createServiceClientFor, packServiceConns } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { moneyFormatter } from "@/lib/books-format";
import { translatorFor } from "@/lib/i18n/translator";
import { userUiLocales } from "@/lib/i18n/userLocale";
import { orgOwnerRecipients } from "@/lib/org-recipients";

export const dynamic = "force-dynamic";

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
    const { data: orgs } = await db
      .from("organizations")
      .select("id, name, weekly_digest_enabled, currency");
    orgCount += orgs?.length ?? 0;

    for (const org of orgs ?? []) {
    try {
      if (org.weekly_digest_enabled === false) continue;
      // Recipients: owners + admins.
      //
      // This was an embed — .select("role, user:user_id(email)") — which
      // returns nothing, always: organization_members has no email column, and
      // user_id points at auth.users, which PostgREST cannot embed from the
      // public schema. It failed with PGRST200, supabase-js returned data null,
      // and this loop then `continue`d on an empty list every week without a
      // sound. The digest has been "sent" to nobody.
      const recipients = await orgOwnerRecipients(db, org.id);
      if (!recipients.length) continue;

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

      // One query for every recipient's language, then one rendering per
      // distinct language rather than one per person.
      const localeOf = await userUiLocales(recipients.map((r) => r.userId));
      const groups = new Map<string, string[]>();
      for (const r of recipients) {
        // null = they never chose, which renders English — the same copy as
        // an explicit "en", so the two share a rendering.
        const key = localeOf.get(r.userId) ?? "en";
        groups.set(key, [...(groups.get(key) ?? []), r.email]);
      }

      const currency = (org.currency as string | null) ?? null;

      for (const [locale, to] of groups) {
        const t = translatorFor(locale, "emails");
        const fmt = moneyFormatter(locale, currency, { maximumFractionDigits: 0 });
        const lang = intlLocale(locale);

      const row = (label: string, value: string, sub: string, color: string) => `
        <td style="padding:14px 16px;border:1px solid #e2e8f0;border-radius:12px;width:50%">
          <div style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em">${label}</div>
          <div style="font-size:22px;font-weight:700;color:${color};margin-top:4px">${value}</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:2px">${sub}</div>
        </td>`;

      const html = `<!DOCTYPE html>
<html lang="${lang}"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <tr><td style="background:#1e88e5;padding:20px 32px">
          <span style="font-size:16px;font-weight:700;color:#fff">${org.name}</span>
          <span style="font-size:13px;color:#aad4f7;float:right">${t("digest.headerNote")}</span>
        </td></tr>
        <tr><td style="padding:28px 32px 8px">
          <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#1e293b">${t("digest.title")}</p>
          <p style="margin:0 0 20px;font-size:13px;color:#64748b">${t("digest.intro")}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-spacing:8px;border-collapse:separate;margin:-8px">
            <tr>
              ${row(t("digest.cash.label"), fmt(cash), banks.length ? t("digest.cash.linked") : t("digest.cash.none"), "#1e293b")}
              ${row(t("digest.outstanding.label"), fmt(outstanding), overdueAmt > 0 ? t("digest.outstanding.overdue", { amount: fmt(overdueAmt) }) : t("digest.outstanding.open", { count: inv.length }), overdueAmt > 0 ? "#e11d48" : "#1e293b")}
            </tr>
            <tr>
              ${row(t("digest.bills.label"), fmt(owed), billsDueSoonAmt > 0 ? t("digest.bills.dueThisWeek", { amount: fmt(billsDueSoonAmt) }) : t("digest.bills.open", { count: bills.length }), billsDueSoonAmt > 0 ? "#d97706" : "#1e293b")}
              ${row(t("digest.tasks.label"), new Intl.NumberFormat(lang).format(openTasks), overdueTasks > 0 ? t("digest.tasks.overdue", { count: overdueTasks }) : t("digest.tasks.onTrack"), overdueTasks > 0 ? "#e11d48" : "#1e293b")}
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 32px 32px">
          <a href="${appUrl}/home" style="display:inline-block;background:#1e88e5;color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px">${t("digest.openDashboard")}</a>
          <a href="${appUrl}/reports?tab=forecast" style="display:inline-block;margin-left:8px;color:#1e88e5;font-size:14px;font-weight:600;text-decoration:none;padding:12px 8px">${t("digest.viewForecast")}</a>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center">
          <p style="margin:0;font-size:12px;color:#94a3b8">${t("digest.footer")}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

      // Whole sentences, one key each — a line assembled from a stem and a
      // parenthetical would put the pieces in English word order.
      const text = [
        t("digest.text.heading", { org: org.name }),
        "",
        t("digest.text.cash", { amount: fmt(cash) }),
        overdueAmt > 0
          ? t("digest.text.outstandingOverdue", { amount: fmt(outstanding), overdue: fmt(overdueAmt) })
          : t("digest.text.outstanding", { amount: fmt(outstanding) }),
        billsDueSoonAmt > 0
          ? t("digest.text.billsDueSoon", { amount: fmt(owed), dueSoon: fmt(billsDueSoonAmt) })
          : t("digest.text.bills", { amount: fmt(owed) }),
        overdueTasks > 0
          ? t("digest.text.tasksOverdue", { count: openTasks, overdue: overdueTasks })
          : t("digest.text.tasks", { count: openTasks }),
        "",
        t("digest.text.dashboard", { url: `${appUrl}/home` }),
      ].join("\n");

      await sendEmail({
        fromName: t("digest.fromName", { org: org.name }),
        to,
        subject: t("digest.subject", { org: org.name, outstanding: fmt(outstanding) }),
        html,
        text,
      });
      sent++;
      }
    } catch (err) {
      errors.push(`${org.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
    }
  }

  return NextResponse.json({ ok: true, orgs: orgCount, sent, errors });
}
