"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Send, CheckCircle2, XCircle, ChevronDown, CreditCard, Bell } from "lucide-react";
import { sendInvoice, markInvoicePaid, voidInvoice, sendInvoiceReminder } from "@/lib/actions/invoices";

interface BankAccount {
  id: string;
  name: string;
  mask: string | null;
}

interface Props {
  invoiceId: string;
  status: string;
  clientEmail: string | null;
  bankAccounts: BankAccount[];
}

export function InvoiceActions({ invoiceId, status, clientEmail, bankAccounts }: Props) {
  const { t } = useTranslation("books");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPaidModal, setShowPaidModal] = useState(false);
  const [selectedBank, setSelectedBank] = useState(bankAccounts[0]?.id ?? "");
  const [reminderSent, setReminderSent] = useState(false);

  function handleSend() {
    if (!clientEmail) { setError(t("invoices.errors.clientNoEmail")); return; }
    setError(null);
    startTransition(async () => {
      try {
        await sendInvoice(invoiceId);
      } catch (e: unknown) {
        console.error("send invoice", e);
        setError(t("invoices.errors.sendFailed"));
      }
    });
  }

  function handleReminder() {
    setError(null);
    startTransition(async () => {
      try {
        await sendInvoiceReminder(invoiceId);
        setReminderSent(true);
        setTimeout(() => setReminderSent(false), 2500);
        router.refresh();
      } catch (e: unknown) {
        console.error("send invoice reminder", e);
        setError(t("invoices.errors.reminderFailed"));
      }
    });
  }

  function handleMarkPaid() {
    if (!selectedBank) { setError(t("invoices.actions.selectBankAccount")); return; }
    setError(null);
    startTransition(async () => {
      try {
        await markInvoicePaid(invoiceId, selectedBank);
        setShowPaidModal(false);
        router.refresh();
      } catch (e: unknown) {
        console.error("mark invoice paid", e);
        setError(t("invoices.errors.markPaidFailed"));
      }
    });
  }

  function handleVoid() {
    if (!confirm(t("invoices.actions.confirmVoid"))) return;
    startTransition(async () => { await voidInvoice(invoiceId); router.refresh(); });
  }

  const isDraft   = status === "draft";
  const isSent    = status === "sent" || status === "overdue";
  const isPaid    = status === "paid";
  const isVoid    = status === "void";

  return (
    <>
      {/* Mark paid modal */}
      {showPaidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">{t("invoices.actions.markPaidTitle")}</h3>

            {bankAccounts.length === 0 ? (
              <p className="text-sm text-slate-500 mb-4">
                {t("invoices.actions.noMappedBanks")}
              </p>
            ) : (
              <>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">{t("invoices.actions.depositInto")}</label>
                <div className="relative mb-4">
                  <select
                    value={selectedBank}
                    onChange={(e) => setSelectedBank(e.target.value)}
                    className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-8"
                  >
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}{b.mask ? ` ···${b.mask}` : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  {t("invoices.actions.journalHint")}
                </p>
              </>
            )}

            {error && <p className="text-xs text-rose-600 bg-rose-50 rounded px-3 py-2 mb-3">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setShowPaidModal(false)}
                className="flex-1 py-2 border border-slate-200 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-50"
              >
                {t("common:actions.cancel")}
              </button>
              <button
                onClick={handleMarkPaid}
                disabled={isPending || bankAccounts.length === 0}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                {isPending ? t("invoices.actions.posting") : t("invoices.actions.confirmPayment")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {error && !showPaidModal && (
          <p className="text-xs text-rose-600">{error}</p>
        )}

        {(isDraft || isSent) && (
          <button
            onClick={handleSend}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            {isPending ? t("common:status.sending") : isDraft ? t("invoices.actions.sendInvoice") : t("invoices.actions.resend")}
          </button>
        )}

        {isSent && (
          <>
            {/* Stripe online payment link */}
            <a
              href={`/api/stripe/checkout?invoice=${invoiceId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <CreditCard className="w-3.5 h-3.5" />
              {t("invoices.actions.payOnline")}
            </a>
            <button
              onClick={() => setShowPaidModal(true)}
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t("invoices.actions.markPaid")}
            </button>
            <button
              onClick={handleReminder}
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <Bell className="w-3.5 h-3.5" />
              {reminderSent ? t("invoices.actions.reminderSent") : t("invoices.actions.sendReminder")}
            </button>
          </>
        )}

        {!isPaid && !isVoid && (
          <button
            onClick={handleVoid}
            disabled={isPending}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" />
            {t("invoices.actions.void")}
          </button>
        )}
      </div>
    </>
  );
}
