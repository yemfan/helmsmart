"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { sendInvoiceReminder } from "@/lib/actions/invoices";
import { planOverdueReminders, type OverdueInvoiceRow } from "@/lib/overdue-reminders-plan";

/**
 * Overdue invoices, and a way to remind every one of those clients at once.
 *
 * The owner's click is the approval, so nothing goes out on the first click:
 * it opens the list of exactly who will be reminded — and who will not, and
 * why. Each send is the same `sendInvoiceReminder` the per-invoice "Send
 * reminder" button calls, one invoice at a time, and what the banner reports
 * afterwards is what those calls returned.
 *
 * No AI employee's name on it. This used to read "Ask Alex to remind them" and
 * created a task instead of sending anything; nothing here is generated, and
 * the sending is the owner's own.
 */
export function OverdueRemindersBanner({
  invoices,
  overdueTotal,
  today,
}: {
  invoices: OverdueInvoiceRow[];
  /** Already formatted in the org's currency. */
  overdueTotal: string;
  /** UTC `YYYY-MM-DD` — the same-day boundary the dunning cron uses. */
  today: string;
}) {
  const { t } = useTranslation("books");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [sentCount, setSentCount] = useState<number | null>(null);
  const [failed, setFailed] = useState<string[]>([]);

  useEffect(() => {
    if (sentCount === null) return;
    const timer = setTimeout(() => setSentCount(null), 2500);
    return () => clearTimeout(timer);
  }, [sentCount]);

  if (invoices.length === 0) return null;

  const plan = planOverdueReminders(invoices, today);
  const noEmail = new Set(plan.noEmail.map((i) => i.id));
  const remindedToday = new Set(plan.remindedToday.map((i) => i.id));

  function sendAll() {
    const targets = plan.send;
    setFailed([]);
    setSentCount(null);
    setProgress({ done: 0, total: targets.length });
    startTransition(async () => {
      let sent = 0;
      const missed: string[] = [];
      for (const inv of targets) {
        try {
          await sendInvoiceReminder(inv.id);
          sent++;
        } catch (e) {
          console.error("sending an overdue-invoice reminder", inv.invoiceNumber, e);
          missed.push(inv.invoiceNumber);
        }
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
      setFailed(missed);
      if (sent > 0) setSentCount(sent);
      router.refresh();
    });
  }

  return (
    <div className="mb-6 px-5 py-3.5 bg-rose-50 border border-rose-200 rounded-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-rose-800">
          <Trans
            t={t}
            i18nKey="invoices.list.overdueReminders.summary"
            count={invoices.length}
            values={{ total: overdueTotal }}
            components={{ b: <span className="font-semibold" /> }}
          />
        </p>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-rose-200 text-rose-700 text-xs font-semibold rounded-lg hover:bg-rose-100 transition-colors shrink-0"
          >
            <Bell className="w-3.5 h-3.5" />
            {t("invoices.list.overdueReminders.review")}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3">
          <p className="text-xs text-slate-600 mb-2">{t("invoices.list.overdueReminders.intro")}</p>
          <ul className="bg-white border border-rose-100 rounded-lg divide-y divide-slate-100">
            {invoices.map((inv) => {
              const skipReason = noEmail.has(inv.id)
                ? t("invoices.list.overdueReminders.noEmail")
                : remindedToday.has(inv.id)
                  ? t("invoices.list.overdueReminders.remindedToday")
                  : null;
              return (
                <li key={inv.id} className="px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <span className="text-slate-800 min-w-0">
                      <span className="font-mono text-xs text-slate-500">{inv.invoiceNumber}</span>
                      {" · "}
                      {inv.clientName}
                      {inv.email ? <span className="text-slate-500">{" · "}{inv.email}</span> : null}
                    </span>
                    <span className="text-slate-700 tabular-nums">{inv.amount}</span>
                  </div>
                  <p className={`text-xs mt-0.5 ${skipReason ? "text-amber-700" : "text-slate-500"}`}>
                    {skipReason ??
                      (inv.lastReminderLabel
                        ? t("invoices.list.overdueReminders.lastReminded", { date: inv.lastReminderLabel })
                        : t("invoices.list.overdueReminders.neverReminded"))}
                  </p>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={sendAll}
              disabled={isPending || plan.send.length === 0}
              className="px-3 py-1.5 bg-rose-600 text-white text-xs font-semibold rounded-lg hover:bg-rose-700 disabled:opacity-50 transition-colors"
            >
              {isPending
                ? t("invoices.list.overdueReminders.sending", { done: progress.done, total: progress.total })
                : sentCount !== null
                  ? t("invoices.list.overdueReminders.sent", { count: sentCount })
                  : t("invoices.list.overdueReminders.send", { count: plan.send.length })}
            </button>
            <button
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="px-3 py-1.5 border border-slate-200 bg-white text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {t("common:actions.done")}
            </button>
          </div>
          {plan.send.length === 0 && !isPending && sentCount === null && failed.length === 0 && (
            <p className="mt-2 text-xs text-slate-500">{t("invoices.list.overdueReminders.nothingToSend")}</p>
          )}
          {failed.length > 0 && (
            <p className="mt-2 text-xs text-rose-600" role="alert">
              {t("invoices.list.overdueReminders.failed", { invoices: failed.join(", ") })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
