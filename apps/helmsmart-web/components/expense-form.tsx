"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { createExpense } from "@/lib/actions/expenses";
import { suggestExpenseAccount } from "@/lib/actions/expense-categorize";
import { DollarSign, ScanLine, X, Loader2, ImagePlus, CheckCircle2, Camera, Sparkles } from "lucide-react";

interface CoAAccount {
  id: string;
  code: string;
  name: string;
}

interface BankAccount {
  id: string;
  name: string;
  mask: string | null;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface Props {
  expenseAccounts: CoAAccount[];
  bankAccounts: BankAccount[];
  projects: ProjectOption[];
  /** When embedded in a modal: called after a successful save instead of navigating to the Expenses page. */
  onSuccess?: () => void;
  /** Overrides the default Cancel behavior (router.back) — e.g. close the host modal. */
  onCancel?: () => void;
}

/**
 * AI category → CoA account name fragment (case-insensitive partial match).
 *
 * The keys are the enum `/api/expenses/scan` is told to answer with, and the
 * hints are matched against account names as the owner typed them. Both halves
 * are lookup data, never screen copy, so they stay in English in every locale.
 */
const CATEGORY_HINTS: Record<string, string[]> = {
  "Advertising & Marketing": ["advertising", "marketing"],
  "Bank Fees":               ["bank fee", "bank charge"],
  "Computer & Software":    ["computer", "software", "tech"],
  "Dues & Subscriptions":   ["subscription", "dues", "membership"],
  "Equipment":              ["equipment", "machinery"],
  "Insurance":              ["insurance"],
  "Meals & Entertainment":  ["meals", "entertainment", "food"],
  "Office Supplies":        ["office"],
  "Professional Services":  ["professional", "consulting", "legal", "accounting"],
  "Rent & Utilities":       ["rent", "utilities", "utility"],
  "Repairs & Maintenance":  ["repairs", "maintenance"],
  "Shipping & Delivery":    ["shipping", "freight", "delivery"],
  "Travel":                 ["travel"],
  "Vehicle":                ["vehicle", "auto", "car", "fuel"],
};

/** The confidence bands the receipt scanner answers with. */
const CONFIDENCE_BANDS = ["high", "medium", "low"];

function findBestAccount(category: string | null, accounts: CoAAccount[]): string {
  if (!category) return accounts[0]?.id ?? "";
  const hints = CATEGORY_HINTS[category] ?? [];
  for (const hint of hints) {
    const match = accounts.find((a) => a.name.toLowerCase().includes(hint));
    if (match) return match.id;
  }
  return accounts[0]?.id ?? "";
}

export function ExpenseForm({ expenseAccounts, bankAccounts, projects, onSuccess, onCancel }: Props) {
  const router = useRouter();
  const { t } = useTranslation("books");
  const today = new Date().toISOString().slice(0, 10);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [date, setDate]                 = useState(today);
  const [amount, setAmount]             = useState("");
  const [description, setDescription]   = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState(expenseAccounts[0]?.id ?? "");

  // AI category suggestion
  const [suggesting, setSuggesting]     = useState(false);
  const [suggestReason, setSuggestReason] = useState<string | null>(null);

  async function handleSuggestCategory() {
    if (!description.trim() || suggesting) return;
    setSuggesting(true);
    setSuggestReason(null);
    try {
      const result = await suggestExpenseAccount(description.trim());
      if (result) {
        setExpenseAccountId(result.accountId);
        setSuggestReason(
          t("expenses.form.suggestReason", { account: result.accountName, reason: result.reason })
        );
      } else {
        setSuggestReason(t("expenses.form.suggestNoMatch"));
      }
    } catch {
      setSuggestReason(t("expenses.form.suggestFailed"));
    } finally {
      setSuggesting(false);
    }
  }
  const [paymentSourceId, setPaymentSourceId]   = useState<string>("");
  const [projectId, setProjectId]       = useState<string>("");
  const [error, setError]               = useState("");
  const [pending, start]                = useTransition();

  // Receipt scanning state
  const [scanning, setScanning]         = useState(false);
  const [scanError, setScanError]       = useState("");
  const [scannedFile, setScannedFile]   = useState<string | null>(null); // filename
  const [scanConfidence, setScanConfidence] = useState<string | null>(null);

  async function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanError("");
    setScanConfidence(null);
    setScanning(true);
    setScannedFile(file.name);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/api/expenses/scan", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: t("expenses.scan.failed") }));
        throw new Error(data.error ?? t("expenses.scan.failed"));
      }

      const data = await res.json();

      // Auto-fill fields with extracted data
      if (data.date)        setDate(data.date);
      if (data.amount)      setAmount(String(data.amount));
      if (data.description) setDescription(data.description);
      if (data.vendor_name && !data.description) setDescription(data.vendor_name);
      if (data.category)    setExpenseAccountId(findBestAccount(data.category, expenseAccounts));
      if (data.confidence)  setScanConfidence(data.confidence);

    } catch (err) {
      setScanError(err instanceof Error ? err.message : t("expenses.scan.failed"));
      setScannedFile(null);
    } finally {
      setScanning(false);
      // Reset file input so the same file can be re-selected
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleSubmit() {
    const amt = parseFloat(amount);
    if (!date || isNaN(amt) || amt <= 0 || !description.trim() || !expenseAccountId) {
      setError(t("expenses.form.required"));
      return;
    }
    setError("");
    start(async () => {
      try {
        await createExpense({
          date,
          amount: amt,
          description: description.trim(),
          expenseAccountId,
          paymentSourceId: paymentSourceId || null,
          projectId: projectId || null,
        });
        if (onSuccess) {
          onSuccess();
        } else {
          router.push("/books/expenses");
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("expenses.form.saveFailed"));
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Receipt scanner card */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <ScanLine className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 mb-0.5">{t("expenses.scan.title")}</p>
            <p className="text-xs text-slate-500 mb-3">
              {t("expenses.scan.subtitle")}
            </p>

            {scanning ? (
              <div className="flex items-center gap-2 text-sm text-indigo-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("expenses.scan.extracting")}
              </div>
            ) : scannedFile ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span className="truncate max-w-[160px]">{scannedFile}</span>
                  {scanConfidence && (
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                      scanConfidence === "high" ? "bg-emerald-100 text-emerald-700"
                      : scanConfidence === "medium" ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                    }`}>
                      {CONFIDENCE_BANDS.includes(scanConfidence)
                        ? t(`expenses.scan.confidence.${scanConfidence}`)
                        : scanConfidence}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { setScannedFile(null); setScanConfidence(null); }}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-white transition-colors"
                  title={t("expenses.scan.clear")}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <label className="inline-flex items-center gap-2 cursor-pointer px-4 py-2 bg-white border border-indigo-200 hover:border-indigo-400 text-indigo-700 text-sm font-medium rounded-lg transition-colors">
                  <ImagePlus className="w-4 h-4" />
                  {t("expenses.scan.upload")}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleReceiptUpload}
                    className="sr-only"
                  />
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer px-4 py-2 bg-white border border-indigo-200 hover:border-indigo-400 text-indigo-700 text-sm font-medium rounded-lg transition-colors">
                  <Camera className="w-4 h-4" />
                  {t("expenses.scan.takePhoto")}
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    capture="environment"
                    onChange={handleReceiptUpload}
                    className="sr-only"
                  />
                </label>
              </div>
            )}

            {scanError && (
              <p className="text-xs text-rose-600 mt-2" role="alert">{scanError}</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <h2 className="text-sm font-semibold text-slate-800">{t("expenses.form.details")}</h2>

        {/* Date + Amount */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("expenses.form.date")}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("expenses.form.amount")}</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full text-sm border border-slate-300 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("expenses.form.description")}</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("expenses.form.descriptionPlaceholder")}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Expense account (DR) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-slate-600">{t("expenses.form.expenseAccount")}</label>
            <button
              type="button"
              onClick={handleSuggestCategory}
              disabled={!description.trim() || suggesting}
              title={description.trim() ? t("expenses.form.suggestHint") : t("expenses.form.suggestHintDisabled")}
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {suggesting
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Sparkles className="w-3 h-3" />}
              {suggesting ? t("common:status.thinking") : t("expenses.form.suggest")}
            </button>
          </div>
          <select
            value={expenseAccountId}
            onChange={(e) => { setExpenseAccountId(e.target.value); setSuggestReason(null); }}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            {expenseAccounts.length === 0 && (
              <option value="">{t("expenses.form.noExpenseAccounts")}</option>
            )}
            {expenseAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
          {suggestReason ? (
            <p className="text-xs text-indigo-600 mt-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {suggestReason}
            </p>
          ) : (
            <p className="text-xs text-slate-400 mt-1">{t("expenses.form.debitedHint")}</p>
          )}
        </div>

        {/* Payment source (CR) */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">{t("expenses.form.paidFrom")}</label>
          <select
            value={paymentSourceId}
            onChange={(e) => setPaymentSourceId(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="">{t("expenses.form.accountsPayable")}</option>
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}{b.mask ? ` ···${b.mask}` : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">{t("expenses.form.creditedHint")}</p>
        </div>

        {/* Project (optional) — attributes this expense to a project's P&L */}
        {projects.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              {t("expenses.form.project")}
              <span className="text-slate-400 font-normal">{t("expenses.form.optionalSuffix")}</span>
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">{t("expenses.form.noProject")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1">{t("expenses.form.projectHint")}</p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-4 py-3" role="alert">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => (onCancel ? onCancel() : router.back())}
          disabled={pending}
          className="flex-1 py-3 text-sm font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors"
        >
          {t("common:actions.cancel")}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending || !expenseAccountId}
          className="flex-1 py-3 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {pending ? t("common:status.saving") : t("expenses.form.save")}
        </button>
      </div>
    </div>
  );
}
