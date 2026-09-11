/**
 * Who a bulk "send payment reminders" click will actually reach.
 *
 * The owner's click on the overdue-invoices banner is the approval, so the
 * banner lists every overdue invoice BEFORE anything goes out, sorted into:
 *
 *   send          → gets the reminder
 *   noEmail       → skipped: `sendReminderForInvoice` refuses a client with no
 *                   email, so promising one would be a lie
 *   remindedToday → skipped: already reminded today (by the owner or by the
 *                   dunning cron, which applies the same same-day rule)
 *
 * `today` is the UTC `YYYY-MM-DD`, the same day boundary the dunning cron uses
 * against `last_reminder_sent_at`.
 *
 * Pure, so the rule is tested without a database.
 */

export interface OverdueInvoiceRow {
  id: string;
  invoiceNumber: string;
  clientName: string;
  email: string | null;
  /** Already formatted in the org's currency and the reader's locale. */
  amount: string;
  /** ISO timestamp of the last reminder sent, or null if none. */
  lastReminderSentAt: string | null;
  /** `lastReminderSentAt`, formatted for the reader; null when never reminded. */
  lastReminderLabel: string | null;
}

type PlanRow = Pick<OverdueInvoiceRow, "email" | "lastReminderSentAt">;

export interface ReminderPlan<T extends PlanRow> {
  send: T[];
  noEmail: T[];
  remindedToday: T[];
}

export function planOverdueReminders<T extends PlanRow>(rows: readonly T[], today: string): ReminderPlan<T> {
  const plan: ReminderPlan<T> = { send: [], noEmail: [], remindedToday: [] };
  for (const row of rows) {
    if (!row.email?.trim()) plan.noEmail.push(row);
    else if (row.lastReminderSentAt?.slice(0, 10) === today) plan.remindedToday.push(row);
    else plan.send.push(row);
  }
  return plan;
}
