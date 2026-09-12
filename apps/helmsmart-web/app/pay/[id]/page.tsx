/**
 * Public client payment portal — /pay/[invoiceId]
 *
 * No sign-in, BY DESIGN: the invoice id is the credential. This is a
 * capability link, like the client portal's `portal_token` and the reschedule
 * token. Whoever holds the URL can view this one invoice and pay it, and
 * nothing more: no edits, no other invoice, nothing about the org beyond its
 * name.
 *
 * That holds only while the id stays unguessable and unlisted:
 *   - `invoices.id` defaults to `gen_random_uuid()` (v4, 122 random bits; see
 *     `supabase/migrations/00006_invoices.sql`). Never look this page up by
 *     `invoice_number`, which is sequential and guessable.
 *   - The id leaves the org only in links sent to that invoice's client: the
 *     invoice email (`lib/actions/invoices.ts`), reminders
 *     (`lib/invoice-reminders.ts`), and the client's own portal, which lists
 *     only the invoices of the client its token belongs to. No public page,
 *     sitemap or unauthenticated API lists invoice ids. Do not add one.
 *   - `/api/stripe/checkout?invoice=` takes the same id and grants the same
 *     thing: paying this invoice's total.
 * The cost of the model: a forwarded link shows the invoice to whoever it
 * reaches, and there is no per-link revocation.
 *
 * The reader is the CUSTOMER, so the locale is theirs — cookie, then
 * Accept-Language — the way `app/accept/[id]` resolves it, never the owner's
 * stored preference. The currency is the other way round: money on this
 * invoice is the org's `organizations.currency`, because relabelling a
 * Canadian contractor's total as dollars for a Spanish-speaking reader would
 * be a lie about the amount rather than a translation of it.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { dateFormatter, moneyFormatter } from "@/lib/books-format";
import { calendarDate } from "@/lib/org-date";
import { Building2, CheckCircle2, CreditCard, Calendar, FileText } from "lucide-react";
import { PayButton } from "./pay-button";
import { StripeResultBanner } from "@/components/stripe-result-banner";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("public");
  return { title: t("pay.metaTitle") };
}

export default async function PayInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; cancelled?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const [locale, t] = await Promise.all([getServerLocale(), getServerT("public")]);
  const stripeResult: "success" | "cancelled" | null =
    sp.success === "1" ? "success" : sp.cancelled === "1" ? "cancelled" : null;
  const supabase = await createServiceClient();

  const { data: inv } = await supabase
    .from("invoices")
    .select(`
      id, invoice_number, status, issue_date, due_date,
      subtotal, tax_rate, tax_amount, total, notes, paid_at,
      invoice_lines(id, description, quantity, unit_price, amount, sort_order),
      clients(first_name, last_name, company, email),
      organizations(name, currency, timezone)
    `)
    .eq("id", id)
    .single();

  if (!inv) notFound();

  const clientRaw = inv.clients;
  const client = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as {
    first_name: string | null; last_name: string | null;
    company: string | null; email: string | null;
  } | null;

  const orgRaw = inv.organizations;
  const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as {
    name: string;
    currency: string | null;
    timezone: string | null;
  } | null;

  // Built once, called per row — constructing an Intl formatter is the
  // expensive half.
  const fmt = moneyFormatter(locale, org?.currency);
  const longDate = dateFormatter(locale, { month: "long", day: "numeric", year: "numeric" });

  const lines = (Array.isArray(inv.invoice_lines) ? inv.invoice_lines : []) as {
    id: string; description: string; quantity: number;
    unit_price: number; amount: number; sort_order: number;
  }[];
  lines.sort((a, b) => a.sort_order - b.sort_order);

  const clientName = client
    ? [client.first_name, client.last_name].filter(Boolean).join(" ") ||
      client.company ||
      t("pay.clientFallback")
    : t("pay.clientFallback");

  // Overdue by the business's date — the one its dashboard and reminders use.
  const today = calendarDate(org?.timezone);
  const isOverdue = inv.status === "sent" && inv.due_date < today;
  const isPaid    = inv.status === "paid";
  const isVoid    = inv.status === "void";
  const canPay    = !isPaid && !isVoid;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-2.5">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-800">
            {org?.name ?? "HelmSmart"}
          </span>
        </div>
      </header>

      <main className="flex-1 px-6 py-10">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* Stripe redirect result banner */}
          {stripeResult && !isPaid && (
            <StripeResultBanner result={stripeResult} />
          )}

          {/* Paid banner */}
          {isPaid && (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 text-emerald-800 px-5 py-4 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-sm">{t("pay.paid.title")}</p>
                {inv.paid_at && (
                  <p className="text-xs mt-0.5 text-emerald-700">
                    {t("pay.paid.on", { date: longDate(calendarDate(org?.timezone, new Date(inv.paid_at))) })}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Overdue warning */}
          {isOverdue && !isPaid && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 px-5 py-3 rounded-xl text-sm font-medium">
              {t("pay.overdue")}
            </div>
          )}

          {/* Void notice */}
          {isVoid && (
            <div className="bg-slate-100 border border-slate-200 text-slate-600 px-5 py-3 rounded-xl text-sm">
              {t("pay.void")}
            </div>
          )}

          {/* Invoice card */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            {/* Header */}
            <div className="px-8 py-7 border-b border-slate-100">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{t("pay.label")}</p>
                  <p className="text-2xl font-bold text-slate-900 font-mono">{inv.invoice_number}</p>
                </div>
                <div className="text-right text-sm text-slate-500 space-y-1">
                  <div className="flex items-center gap-1.5 justify-end">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <span>{t("pay.issued", { date: longDate(inv.issue_date) })}</span>
                  </div>
                  <div className={`flex items-center gap-1.5 justify-end ${isOverdue ? "text-rose-600 font-medium" : ""}`}>
                    <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{t("pay.due", { date: longDate(inv.due_date) })}</span>
                  </div>
                </div>
              </div>

              {client && (
                <div className="mt-6">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{t("pay.billTo")}</p>
                  <p className="text-sm font-semibold text-slate-800">{clientName}</p>
                  {client.email && <p className="text-xs text-slate-500">{client.email}</p>}
                </div>
              )}
            </div>

            {/* Line items */}
            <div className="px-8 py-6">
              <div className="grid grid-cols-[1fr_60px_90px_90px] gap-3 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <span>{t("pay.table.description")}</span>
                <span className="text-right">{t("pay.table.qty")}</span>
                <span className="text-right">{t("pay.table.price")}</span>
                <span className="text-right">{t("pay.table.amount")}</span>
              </div>

              <div className="divide-y divide-slate-50">
                {lines.map((line) => (
                  <div key={line.id} className="grid grid-cols-[1fr_60px_90px_90px] gap-3 py-3 text-sm">
                    <span className="text-slate-800">{line.description}</span>
                    <span className="text-right text-slate-500 tabular-nums">{line.quantity}</span>
                    <span className="text-right text-slate-500 tabular-nums">{fmt(line.unit_price)}</span>
                    <span className="text-right text-slate-800 font-medium tabular-nums">{fmt(line.amount)}</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="flex justify-end mt-5 pt-5 border-t border-slate-100">
                <div className="w-56 space-y-1.5">
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>{t("pay.totals.subtotal")}</span>
                    <span className="tabular-nums">{fmt(Number(inv.subtotal))}</span>
                  </div>
                  {Number(inv.tax_rate) > 0 && (
                    <div className="flex justify-between text-sm text-slate-600">
                      <span>{t("pay.totals.tax", { rate: (Number(inv.tax_rate) * 100).toFixed(0) })}</span>
                      <span className="tabular-nums">{fmt(Number(inv.tax_amount))}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                    <span>{t("pay.totals.totalDue")}</span>
                    <span className="tabular-nums">{fmt(Number(inv.total))}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {inv.notes && (
                <div className="mt-5 pt-5 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{t("pay.notes")}</p>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{inv.notes}</p>
                </div>
              )}
            </div>

            {/* Payment CTA */}
            {canPay && (
              <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-500">{t("pay.amountDue")}</p>
                  <p className="text-xl font-bold text-slate-900 tabular-nums">{fmt(Number(inv.total))}</p>
                </div>
                <PayButton invoiceId={inv.id} />
              </div>
            )}
          </div>

          <p className="text-center text-xs text-slate-400">
            {t("pay.footer", { number: inv.invoice_number })}
          </p>
        </div>
      </main>
    </div>
  );
}
