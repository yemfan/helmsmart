"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Receipt, ChevronDown, ChevronUp, Search, User2, X } from "lucide-react";
import { formatMoney, computeTotals } from "@/lib/books/money";
import type { InvoiceRow, InvoiceStatus } from "@/lib/books/invoices";

type LineDraft = { description: string; quantity: string; unitPrice: string };
type PickContact = { id: string; name: string; email: string };

const STATUS_TONE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 ring-slate-200",
  sent: "bg-blue-50 text-blue-700 ring-blue-200",
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  overdue: "bg-amber-50 text-amber-700 ring-amber-200",
  void: "bg-rose-50 text-rose-700 ring-rose-200",
};

const emptyLine = (): LineDraft => ({ description: "", quantity: "1", unitPrice: "" });

/** "Jun 17, 2026, 3:42 PM" in the viewer's locale/timezone, or "" if not sent. */
function formatSentAt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function BooksClient({ initialInvoices }: { initialInvoices: InvoiceRow[] }) {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const [showForm, setShowForm] = useState(initialInvoices.length === 0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  // Create-form state
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [taxPct, setTaxPct] = useState("0");
  const [notes, setNotes] = useState("");
  const [paymentUrl, setPaymentUrl] = useState(
    initialInvoices.find((i) => i.payment_url)?.payment_url ?? "",
  );
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Bill to" contact picker
  const [contacts, setContacts] = useState<PickContact[]>([]);
  const [contactId, setContactId] = useState<string | null>(null);
  const [contactQuery, setContactQuery] = useState("");
  const [contactOpen, setContactOpen] = useState(false);
  const contactBoxRef = useRef<HTMLDivElement | null>(null);

  const totals = useMemo(
    () =>
      computeTotals(
        lines.map((l) => ({ quantity: Number(l.quantity) || 0, unitPrice: Number(l.unitPrice) || 0 })),
        (Number(taxPct) || 0) / 100,
      ),
    [lines, taxPct],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/books/contacts");
        const data = (await res.json()) as { contacts?: PickContact[] };
        if (alive) setContacts(Array.isArray(data.contacts) ? data.contacts : []);
      } catch {
        /* manual entry still works */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (contactBoxRef.current && !contactBoxRef.current.contains(e.target as Node)) setContactOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filteredContacts = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    const list = !q
      ? contacts
      : contacts.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
    return list.slice(0, 8);
  }, [contacts, contactQuery]);

  function pickContact(c: PickContact) {
    setContactId(c.id);
    setContactQuery(c.name);
    setClientName(c.name === "Unnamed contact" ? "" : c.name);
    if (c.email) setClientEmail(c.email);
    setContactOpen(false);
  }
  function clearContact() {
    setContactId(null);
    setContactQuery("");
  }

  const outstanding = useMemo(
    () =>
      initialInvoices
        .filter((i) => i.status === "sent" || i.status === "overdue")
        .reduce((s, i) => s + Number(i.total || 0), 0),
    [initialInvoices],
  );
  const paidTotal = useMemo(
    () => initialInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.total || 0), 0),
    [initialInvoices],
  );

  // Outstanding = the working list you act on; Paid = the ledger an invoice
  // moves to once payment is received (status → paid, paid_at stamped).
  const activeInvoices = useMemo(
    () => initialInvoices.filter((i) => i.status !== "paid" && i.status !== "void"),
    [initialInvoices],
  );
  const paidInvoices = useMemo(
    () => initialInvoices.filter((i) => i.status === "paid"),
    [initialInvoices],
  );

  function setLine(i: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(i: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }
  function resetForm() {
    setClientName("");
    setClientEmail("");
    setDueDate("");
    setTaxPct("0");
    setNotes("");
    setLines([emptyLine()]);
    setContactId(null);
    setContactQuery("");
  }

  async function createInvoice() {
    const cleanLines = lines
      .map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity) || 0, unitPrice: Number(l.unitPrice) || 0 }))
      .filter((l) => l.description);
    if (cleanLines.length === 0) {
      setError(t("pages.books.needLineItem"));
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/books/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          clientName,
          clientEmail,
          dueDate: dueDate || null,
          taxRate: (Number(taxPct) || 0) / 100,
          notes,
          paymentUrl,
          lines: cleanLines,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not create the invoice.");
      resetForm();
      setShowForm(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the invoice.");
    } finally {
      setCreating(false);
    }
  }

  async function changeStatus(id: string, status: InvoiceStatus) {
    setBusyId(id);
    setRowError(null);
    try {
      const res = await fetch("/api/dashboard/books/invoices/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (res.ok && data.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function sendInvoice(id: string) {
    setBusyId(id);
    setRowError(null);
    try {
      const res = await fetch("/api/dashboard/books/invoices/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) router.refresh();
      else setRowError(data.error || "Could not send the invoice.");
    } catch {
      setRowError("Could not send the invoice.");
    } finally {
      setBusyId(null);
    }
  }

  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";

  // One row renderer shared by the Outstanding list and the Paid ledger.
  const renderInvoiceRow = (inv: InvoiceRow) => (
    <li key={inv.id} className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{inv.invoice_number}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${STATUS_TONE[inv.status] ?? STATUS_TONE.draft}`}>
            {inv.status}
          </span>
        </div>
        <p className="truncate text-xs text-slate-500">
          {inv.client_name || "—"}
          {inv.due_date ? ` · due ${inv.due_date}` : ""}
          {/* Locale/timezone-formatted on the client — suppress the SSR/CSR
              mismatch this can cause. Paid rows show when payment landed. */}
          {inv.status === "paid" && formatSentAt(inv.paid_at) ? (
            <span suppressHydrationWarning>{` · paid ${formatSentAt(inv.paid_at)}`}</span>
          ) : formatSentAt(inv.sent_at) ? (
            <span suppressHydrationWarning>{` · sent ${formatSentAt(inv.sent_at)}`}</span>
          ) : null}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold text-slate-900 dark:text-slate-100">{formatMoney(Number(inv.total), inv.currency || "USD")}</span>
      <div className="flex shrink-0 items-center gap-1">
        <a
          href={`/api/dashboard/books/invoices/pdf?id=${inv.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          PDF
        </a>
        {inv.client_email && inv.status !== "paid" && inv.status !== "void" && (
          <button type="button" onClick={() => void sendInvoice(inv.id)} disabled={busyId === inv.id} className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50">
            {busyId === inv.id ? "…" : inv.status === "draft" ? t("pages.books.send") : t("pages.books.resend")}
          </button>
        )}
        {inv.status === "draft" && !inv.client_email && (
          <button type="button" onClick={() => void changeStatus(inv.id, "sent")} disabled={busyId === inv.id} className="rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">{t("pages.books.markSent")}</button>
        )}
        {inv.status !== "paid" && inv.status !== "void" && (
          <button type="button" onClick={() => void changeStatus(inv.id, "paid")} disabled={busyId === inv.id} className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{t("pages.books.markPaid")}</button>
        )}
      </div>
    </li>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">{t("pages.books.breadcrumb")}</div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            <Receipt className="h-6 w-6 text-blue-600" strokeWidth={2} />{t("pages.books.books")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("pages.books.intro")}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          {showForm ? <ChevronUp className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{t("pages.dashFragments.newInvoice")}</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t("pages.books.kpiInvoices")} value={String(initialInvoices.length)} tone="slate" />
        <Stat label={t("pages.books.kpiOutstanding")} value={formatMoney(outstanding)} tone="amber" />
        <Stat label={t("pages.books.kpiPaid")} value={formatMoney(paidTotal)} tone="emerald" />
      </div>

      {/* Create form */}
      {showForm && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.books.newInvoice")}</h2>

          <div ref={contactBoxRef} className="relative mb-3">
            <span className="mb-1 block text-[11px] font-medium text-slate-500">{t("pages.books.billTo")}</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" strokeWidth={2} />
              <input
                className={`${input} pl-9 ${contactId ? "pr-9" : ""}`}
                value={contactQuery}
                onChange={(e) => {
                  setContactQuery(e.target.value);
                  setContactId(null);
                  setContactOpen(true);
                }}
                onFocus={() => setContactOpen(true)}
                placeholder={t("pages.books.searchContacts")}
              />
              {contactId && (
                <button
                  type="button"
                  onClick={clearContact}
                  aria-label={t("pages.books.clearContact")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600"
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              )}
            </div>
            {contactOpen && contacts.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1 shadow-lg">
                {filteredContacts.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-500">{t("pages.books.noMatches")}</div>
                ) : (
                  filteredContacts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickContact(c);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50"
                    >
                      <User2 className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} />
                      <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-200">{c.name}</span>
                      {c.email && <span className="shrink-0 truncate text-xs text-slate-500">{c.email}</span>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <span className="mb-1 block text-[11px] font-medium text-slate-500">{t("pages.books.clientName")}</span>
              <input className={input} value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder={t("pages.books.clientNamePlaceholder")} />
            </div>
            <div>
              <span className="mb-1 block text-[11px] font-medium text-slate-500">{t("pages.books.clientEmail")}</span>
              <input className={input} value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder={t("pages.books.clientEmailPlaceholder")} />
            </div>
            <div>
              <span className="mb-1 block text-[11px] font-medium text-slate-500">{t("pages.books.dueDate")}</span>
              <input type="date" className={input} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <span className="mb-1 block text-[11px] font-medium text-slate-500">{t("pages.books.taxRate")}</span>
              <input className={input} value={taxPct} onChange={(e) => setTaxPct(e.target.value)} inputMode="decimal" placeholder="0" />
            </div>
          </div>

          <div className="mt-3">
            <span className="mb-1 block text-[11px] font-medium text-slate-500">{t("pages.books.paymentLink")}</span>
            <input
              className={input}
              value={paymentUrl}
              onChange={(e) => setPaymentUrl(e.target.value)}
              placeholder={t("pages.books.paymentLinkPlaceholder")}
            />
          </div>

          {/* Line items */}
          <div className="mt-4">
            <span className="mb-1 block text-[11px] font-medium text-slate-500">{t("pages.books.lineItems")}</span>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className={`${input} flex-1`}
                    value={l.description}
                    onChange={(e) => setLine(i, { description: e.target.value })}
                    placeholder={t("pages.books.description")}
                  />
                  <input
                    className={`${input} w-16 text-right`}
                    value={l.quantity}
                    onChange={(e) => setLine(i, { quantity: e.target.value })}
                    inputMode="decimal"
                    placeholder={t("pages.books.qty")}
                  />
                  <input
                    className={`${input} w-24 text-right`}
                    value={l.unitPrice}
                    onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                    inputMode="decimal"
                    placeholder={t("pages.books.price")}
                  />
                  <span className="w-24 text-right text-sm text-slate-600 dark:text-slate-400">
                    {formatMoney((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-rose-600"
                    aria-label={t("pages.books.removeLine")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addLine} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
              <Plus className="h-3.5 w-3.5" />{t("pages.books.addLine")}</button>
          </div>

          {/* Totals */}
          <div className="mt-4 ml-auto w-full max-w-[16rem] space-y-1 text-sm">
            <Row label={t("pages.books.subtotal")} value={formatMoney(totals.subtotal)} />
            <Row label={t("pages.books.taxPct", { pct: Number(taxPct) || 0 })} value={formatMoney(totals.taxAmount)} />
            <Row label={t("pages.books.total")} value={formatMoney(totals.total)} bold />
          </div>

          <div className="mt-3">
            <span className="mb-1 block text-[11px] font-medium text-slate-500">{t("pages.books.notes")}</span>
            <textarea className={`${input} min-h-[60px]`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("pages.books.notesPlaceholder")} />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void createInvoice()}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? t("pages.books.creating") : t("pages.books.create")}
            </button>
            {error && <span className="text-xs font-medium text-rose-600">{error}</span>}
          </div>
        </section>
      )}

      {rowError && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{rowError}</p>
      )}

      {/* Invoice list */}
      {initialInvoices.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center">
          <p className="text-sm text-slate-500">{t("pages.books.emptyAll")}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Outstanding — the working list you act on */}
          {activeInvoices.length > 0 ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
              {activeInvoices.map(renderInvoiceRow)}
            </ul>
          ) : (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-center">
              <p className="text-sm text-slate-500">{t("pages.books.emptyOutstanding")}</p>
            </div>
          )}

          {/* Paid ledger — an invoice moves here once payment is received */}
          {paidInvoices.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
                <span>{t("pages.books.paid")}</span>
                <span className="tabular-nums text-emerald-600">{formatMoney(paidTotal)}</span>
              </h2>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
                {paidInvoices.map(renderInvoiceRow)}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "slate" | "amber" | "emerald" }) {
  const palette: Record<string, string> = {
    slate: "bg-slate-50 text-slate-900",
    amber: "bg-amber-50 text-amber-900",
    emerald: "bg-emerald-50 text-emerald-900",
  };
  return (
    <div className={`rounded-xl px-3 py-2.5 ${palette[tone]}`}>
      <div className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-0.5 text-lg font-semibold">{value}</div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "border-t border-slate-200 dark:border-slate-700 pt-1 font-semibold text-slate-900 dark:text-slate-100" : "text-slate-600"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
