import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft, Printer } from "lucide-react";
import { InvoiceActions } from "@/components/invoice-actions";
import { StripeResultBanner } from "@/components/stripe-result-banner";
import { InvoiceTimesheetImport } from "@/components/invoice-timesheet-import";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { orgCurrency } from "@/lib/books-currency";
import { orgTimezone } from "@/lib/org-timezone";
import { calendarDate } from "@/lib/org-date";
import { dateFormatter, moneyFormatter } from "@/lib/books-format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("books");
  return { title: t("invoices.detail.metaTitle") };
}

const STATUS_COLORS: Record<string, string> = {
  draft:   "bg-slate-100 text-slate-600",
  sent:    "bg-blue-100 text-blue-700",
  paid:    "bg-emerald-100 text-emerald-700",
  overdue: "bg-rose-100 text-rose-700",
  void:    "bg-slate-100 text-slate-400",
};

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stripe?: string }>;
}) {
  const [{ id }, { stripe }] = await Promise.all([params, searchParams]);
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const t = await getServerT("books");
  const locale = await getServerLocale();
  const currency = await orgCurrency(orgId);
  const fmt = moneyFormatter(locale, currency);
  const longDate = dateFormatter(locale, { month: "long", day: "numeric", year: "numeric" });

  const [{ data: inv }, { data: bankAccounts }] = await Promise.all([
    supabase
      .from("invoices")
      .select(`
        *,
        clients(first_name, last_name, company, email, phone),
        invoice_lines(id, description, quantity, unit_price, amount, sort_order,
          chart_of_accounts(code, name))
      `)
      .eq("id", id)
      .eq("organization_id", orgId)
      .single(),
    supabase
      .from("bank_accounts")
      .select("id, name, mask, coa_account_id")
      .eq("organization_id", orgId)
      .eq("is_active", true),
  ]);

  if (!inv) notFound();

  // Load uninvoiced time entries for this client (only for editable statuses)
  const clientRawEarly = inv.clients;
  const clientIdForEntries = (
    Array.isArray(clientRawEarly) ? clientRawEarly[0] : clientRawEarly
  )?.id ?? null;

  const uninvoicedEntries = (inv.status === "draft" || inv.status === "sent") && clientIdForEntries
    ? await supabase
        .from("time_entries")
        .select("id, description, project, started_at, duration_minutes, billable, hourly_rate, invoiced, ended_at, client_id, invoice_id, created_at")
        .eq("organization_id", orgId)
        .eq("client_id", clientIdForEntries)
        .eq("invoiced", false)
        .not("ended_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(50)
        .then((r) => r.data ?? [])
    : [];

  const clientRaw = inv.clients;
  const client = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as {
    first_name: string | null; last_name: string | null;
    company: string | null; email: string | null; phone: string | null;
  } | null;

  const linesRaw = Array.isArray(inv.invoice_lines) ? inv.invoice_lines : [];
  const lines = (linesRaw as {
    id: string; description: string; quantity: number; unit_price: number;
    amount: number; sort_order: number; chart_of_accounts: unknown;
  }[]).sort((a, b) => a.sort_order - b.sort_order);

  // `paid_at` is an instant, so it needs the org's zone to become a date: a
  // payment taken at 5 PM Pacific is already tomorrow in UTC.
  const tz = await orgTimezone(orgId);
  const today = calendarDate(tz);
  const effectiveStatus =
    inv.status === "sent" && inv.due_date < today ? "overdue" : inv.status;

  const clientName = client
    ? [client.first_name, client.last_name].filter(Boolean).join(" ") || client.company || "—"
    : "—";

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      {/* Stripe payment result banner */}
      {(stripe === "success" || stripe === "cancelled") && (
        <StripeResultBanner result={stripe} />
      )}

      {/* Back + header */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <Link
          href="/books/invoices"
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900 font-mono">{inv.invoice_number}</h1>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[effectiveStatus] ?? STATUS_COLORS.draft}`}>
              {t(`status.invoice.${effectiveStatus}`)}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">{clientName}</p>
        </div>
        {/* Import from timesheets */}
        <InvoiceTimesheetImport
          invoiceId={inv.id}
          currency={currency}
          uninvoicedEntries={uninvoicedEntries as Parameters<typeof InvoiceTimesheetImport>[0]["uninvoicedEntries"]}
        />

        {/* Print / PDF */}
        <Link
          href={`/books/invoices/${inv.id}/print`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Printer className="w-3.5 h-3.5" />
          {t("invoices.detail.print")}
        </Link>

        {/* Action buttons */}
        <InvoiceActions
          invoiceId={inv.id}
          status={effectiveStatus}
          clientEmail={client?.email ?? null}
          bankAccounts={(bankAccounts ?? []).filter((b) => b.coa_account_id) as {
            id: string; name: string; mask: string | null;
          }[]}
        />
      </div>

      {/* Invoice document */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {/* Invoice header */}
        <div className="px-4 sm:px-10 py-6 sm:py-8 border-b border-slate-100">
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{t("invoices.detail.documentLabel")}</p>
              <p className="text-3xl font-bold text-slate-900 font-mono">{inv.invoice_number}</p>
            </div>
            <div className="text-right text-sm text-slate-600 space-y-1">
              <p><span className="text-slate-400">{t("invoices.detail.issued")}</span> {longDate(inv.issue_date)}</p>
              <p><span className="text-slate-400">{t("invoices.detail.due")}</span> <span className={effectiveStatus === "overdue" ? "text-rose-600 font-medium" : ""}>
                {longDate(inv.due_date)}
              </span></p>
              {inv.paid_at && (
                <p><span className="text-slate-400">{t("invoices.detail.paid")}</span> <span className="text-emerald-600 font-medium">
                  {longDate(calendarDate(tz, new Date(inv.paid_at)))}
                </span></p>
              )}
            </div>
          </div>

          {client && (
            <div className="mt-8">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{t("invoices.detail.billTo")}</p>
              <p className="text-sm font-semibold text-slate-800">{clientName}</p>
              {client.email && <p className="text-sm text-slate-500">{client.email}</p>}
              {client.phone && <p className="text-sm text-slate-500">{client.phone}</p>}
            </div>
          )}
        </div>

        {/* Line items */}
        <div className="px-4 sm:px-10 py-6">
          {/* The line table keeps its columns and scrolls inside itself on a phone. */}
          <div className="overflow-x-auto">
          <div className="min-w-[30rem]">
          <div className="grid grid-cols-[1fr_80px_110px_110px] gap-4 mb-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <span>{t("invoices.detail.columns.description")}</span>
            <span className="text-right">{t("invoices.detail.columns.qty")}</span>
            <span className="text-right">{t("invoices.detail.columns.unitPrice")}</span>
            <span className="text-right">{t("invoices.detail.columns.amount")}</span>
          </div>

          <div className="divide-y divide-slate-50">
            {lines.map((line) => {
              const coaRaw = line.chart_of_accounts;
              const coa = (Array.isArray(coaRaw) ? coaRaw[0] : coaRaw) as { code: string; name: string } | null;
              return (
                <div key={line.id} className="grid grid-cols-[1fr_80px_110px_110px] gap-4 py-3 text-sm">
                  <div>
                    <p className="text-slate-800">{line.description}</p>
                    {coa && <p className="text-xs text-slate-400 mt-0.5">{coa.code} · {coa.name}</p>}
                  </div>
                  <span className="text-right text-slate-600 tabular-nums">{line.quantity}</span>
                  <span className="text-right text-slate-600 tabular-nums">{fmt(line.unit_price)}</span>
                  <span className="text-right text-slate-800 font-medium tabular-nums">{fmt(line.amount)}</span>
                </div>
              );
            })}
          </div>
          </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end mt-6">
            <div className="w-full max-w-64 space-y-2">
              <div className="flex justify-between text-sm text-slate-600">
                <span>{t("invoices.detail.subtotal")}</span>
                <span className="tabular-nums">{fmt(Number(inv.subtotal))}</span>
              </div>
              {Number(inv.tax_rate) > 0 && (
                <div className="flex justify-between text-sm text-slate-600">
                  <span>{t("invoices.detail.taxAt", { rate: (Number(inv.tax_rate) * 100).toFixed(2) })}</span>
                  <span className="tabular-nums">{fmt(Number(inv.tax_amount))}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>{t("invoices.detail.total")}</span>
                <span className="tabular-nums">{fmt(Number(inv.total))}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {inv.notes && (
            <div className="mt-6 pt-6 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t("invoices.detail.notes")}</p>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{inv.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
