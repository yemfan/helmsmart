/**
 * GET /api/cron/invoices/reminders
 *
 * Dunning: emails a payment reminder for each overdue, unpaid invoice
 * according to each org's configured schedule (reminder_days_intervals).
 * Tone escalates with how overdue the invoice is.
 * Called daily by Vercel Cron.
 *
 * Auth: Bearer token via CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClientFor, packServiceConns } from "@/lib/supabase/server";
import { createNotificationService } from "@/lib/actions/notifications";
import {
  sendReminderForInvoice,
  daysOverdue,
  type ReminderInvoice,
} from "@/lib/invoice-reminders";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const conn of packServiceConns()) {
    const db = createServiceClientFor(conn);

    // Fetch all overdue invoices (we'll filter by org schedule below)
    const { data: invoices, error } = await db
      .from("invoices")
      .select(
        "id, invoice_number, total, due_date, client_id, reminder_count, last_reminder_sent_at, organization_id, clients(first_name, last_name, email, phone, preferred_language)"
      )
      .in("status", ["sent", "overdue"])
      .lt("due_date", today);

    if (error) {
      errors.push(error.message);
      continue;
    }

    if (!invoices?.length) continue;

    // Fetch org reminder settings for all unique orgs in this batch
    const orgIds = [...new Set(invoices.map((i) => i.organization_id))];
    const { data: orgs } = await db
      .from("organizations")
      .select("id, auto_send_reminders, reminder_days_intervals, reminder_max_count")
      .in("id", orgIds);

    const orgMap = new Map(
      (orgs ?? []).map((o) => [
        o.id,
        {
          autoSend:      o.auto_send_reminders ?? true,
          intervals:     (o.reminder_days_intervals as number[] | null) ?? [3, 7, 14, 30],
          maxCount:      o.reminder_max_count ?? 4,
        },
      ])
    );

    for (const inv of invoices) {
      const settings = orgMap.get(inv.organization_id) ?? {
        autoSend: true,
        intervals: [3, 7, 14, 30],
        maxCount: 4,
      };

      // Respect org-level toggle
      if (!settings.autoSend) {
        skipped++;
        continue;
      }

      // Check if max reminders reached
      const reminderCount = inv.reminder_count ?? 0;
      if (reminderCount >= settings.maxCount) {
        skipped++;
        continue;
      }

      // Check if today matches a scheduled interval
      const overduedays = daysOverdue(inv.due_date);
      const shouldSendToday = settings.intervals.some((intervalDay) => {
        // Send if overdue days matches the interval exactly,
        // or if we're past it and haven't sent since the previous interval
        return overduedays >= intervalDay;
      });
      if (!shouldSendToday) {
        skipped++;
        continue;
      }

      // Find the threshold for the next interval we should be at
      const applicableIntervals = settings.intervals.filter((d) => d <= overduedays);
      if (applicableIntervals.length === 0) {
        skipped++;
        continue;
      }
      const targetInterval = applicableIntervals[applicableIntervals.length - 1];

      // Check if we already sent a reminder for this interval level
      // (i.e., reminder_count >= position in intervals array)
      const intervalIndex = settings.intervals.indexOf(targetInterval);
      if (reminderCount > intervalIndex) {
        skipped++;
        continue;
      }

      // Also gate by last_reminder_sent_at to avoid double-sends on same day
      if (inv.last_reminder_sent_at) {
        const lastSentDate = inv.last_reminder_sent_at.slice(0, 10);
        if (lastSentDate === today) {
          skipped++;
          continue;
        }
      }

      // A rejected send now throws. Contain it per invoice so one bad
      // recipient doesn't abort the rest of this org's dunning run.
      let res: { sent: boolean };
      try {
        res = await sendReminderForInvoice(db, inv as ReminderInvoice);
      } catch (e) {
        errors.push(
          `invoice ${inv.invoice_number}: ${e instanceof Error ? e.message : String(e)}`
        );
        continue;
      }
      if (!res.sent) {
        skipped++;
        continue;
      }

      sent++;
      await createNotificationService(
        inv.organization_id,
        {
          type: "invoice_overdue",
          title: `Reminder sent: Invoice ${inv.invoice_number}`,
          body: `Reminder #${reminderCount + 1} sent — ${overduedays} days overdue, $${Number(inv.total).toFixed(2)}`,
          link: `/books/invoices/${inv.id}`,
        },
        db
      );
    }
  }

  return NextResponse.json({ sent, skipped, errors });
}
