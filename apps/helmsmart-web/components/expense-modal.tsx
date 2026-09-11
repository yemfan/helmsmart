"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { X, Plus, Receipt } from "lucide-react";
import { ExpenseForm } from "@/components/expense-form";

interface ExpenseAccount {
  id: string;
  code: string;
  name: string;
}

interface BankAccount {
  id: string;
  name: string;
  mask: string | null;
  coa_account_id?: string | null;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface Props {
  expenseAccounts: ExpenseAccount[];
  bankAccounts: BankAccount[];
  projects?: ProjectOption[];
  /** `organizations.timezone`, passed through to the form's date default. */
  timeZone: string;
}

export function ExpenseModal({ expenseAccounts, bankAccounts, projects = [], timeZone }: Props) {
  const router = useRouter();
  const { t } = useTranslation("books");
  const [open, setOpen] = useState(false);

  function handleClose() {
    setOpen(false);
  }

  function handleSuccess() {
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium
                   bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors"
      >
        <Plus className="w-4 h-4" />
        <span>{t("expenses.modal.trigger")}</span>
        <span className="text-xs text-slate-400">{t("expenses.modal.triggerHint")}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 backdrop-blur-sm py-10"
          onClick={handleClose}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Receipt className="w-4 h-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-800">{t("expenses.modal.title")}</h3>
              </div>
              <button
                onClick={handleClose}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
                aria-label={t("expenses.modal.close")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body — full-featured form (receipt scan + project allocation) */}
            <div className="px-6 py-5">
              <ExpenseForm
                expenseAccounts={expenseAccounts}
                bankAccounts={bankAccounts}
                projects={projects}
                timeZone={timeZone}
                onSuccess={handleSuccess}
                onCancel={handleClose}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
