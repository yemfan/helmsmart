import { PageTitle } from "@/components/page-title";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { BooksNav } from "@/components/books-nav";
import { Plus, FileText, Send, CheckCircle2, Clock, XCircle, Download } from "lucide-react";
import { OverdueRemindersBanner } from "@/components/overdue-reminders";
import type { OverdueInvoiceRow } from "@/lib/overdue-reminders-plan";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { orgCurrency } from "@/lib/books-currency";
import { dateFormatter, moneyFormatter } from "@/lib/books-format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("books");
  return { title: t("invoices.list.metaTitle") };
}

/**
 * Status → chip. The label is a bundle key, not a string: the enum value is
 * what the database stores, `status.<value>` is what the owner reads.
 */
const STATUS_CONFIG = {
  draft:   { color: "bg-slate-100 text-slate-600",     icon: FileText },
  sent:    { color: "bg-blue-100 text-blue-700",       icon: Send },
  paid:    { color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  overdue: { color: "bg-rose-100 text-rose-700",       icon: Clock },
  void:    { color: "bg-slate-100 text-slate-400",     icon: XCircle },
} as const;

export default async function InvoicesPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const t = await getServerT("books");
  const locale = await getServerLocale();
  const currency = await orgCurrency(orgId);
  const fmt = moneyFormatter(locale, currency);
  const issuedDate = dateFormatter(locale, { month: "short", day: "numeric", year: "numeric" });
  const dueDate = dateFormatter(locale, { month: "short", day: "numeric" });

  const today = new Date().toISOString().slice(0, 10);

  const { data: invoices } = await supabase
    .from("invoices")
    .select(`
      id, invoice_number, status, issue_date, due_date, total, paid_at, last_reminder_sent_at,
      clients(first_name, last_name, company, email)
    `)
    .eq("organization_id", orgId)
    .neq("status", "void")
    .order("created_at", { ascending: false });

  // Compute summary stats
  const outstanding = (invoices ?? []).filter((i) => i.status === "sent" || i.status === "overdue");
  const overdue     = (invoices ?? []).filter((i) => i.status === "sent" && i.due_date < today);
  const paid30      = (invoices ?? []).filter(
    (i) => i.status === "paid" && i.paid_at &&
      new Date(i.paid_at) > new Date(Date.now() - 30 * 86400000)
  );

  const totalOutstanding = outstanding.reduce((s, i) => s + Number(i.total), 0);
  const totalOverdue     = overdue.reduce((s, i) => s + Number(i.total), 0);
  const totalPaid30      = paid30.reduce((s, i) => s + Number(i.total), 0);

  // What the overdue banner lists before the owner sends anything.
  const remindedOn = dateFormatter(locale, { month: "short", day: "numeric" });
  const overdueRows: OverdueInvoiceRow[] = overdue.map((inv) => {
    const c = (Array.isArray(inv.clients) ? inv.clients[0] : inv.clients) as {
      first_name: string | null; last_name: string | null; company: string | null; email: string | null;
    } | null;
    const lastSent = (inv.last_reminder_sent_at as string | null) ?? null;
    return {
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      clientName: (c && ([c.first_name, c.last_name].filter(Boolean).join(" ") || c.company)) || "—",
      email: c?.email ?? null,
      amount: fmt(Number(inv.total)),
      lastReminderSentAt: lastSent,
      lastReminderLabel: lastSent ? remindedOn(new Date(lastSent)) : null,
    };
  });

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <PageTitle base="Books" />
          <p className="text-sm text-slate-500 mt-0.5">{t("overview.subtitle")}</p>
        </div>
        <Link
          href="/api/export/invoices"
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          {t("invoices.list.export")}
        </Link>
        <Link
          href="/books/invoices/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t("invoices.list.newInvoice")}
        </Link>
      </div>

      <BooksNav />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          {
            label: t("invoices.list.outstanding"),
            value: fmt(totalOutstanding),
            sub: t("invoices.list.invoiceCount", { count: outstanding.length }),
            color: "text-slate-800",
          },
          {
            label: t("invoices.list.overdue"),
            value: fmt(totalOverdue),
            sub: t("invoices.list.pastDueCount", { count: overdue.length }),
            color: totalOverdue > 0 ? "text-rose-700" : "text-slate-800",
          },
          {
            label: t("invoices.list.collected30d"),
            value: fmt(totalPaid30),
            sub: t("invoices.list.paidCount", { count: paid30.length }),
            color: "text-emerald-700",
          },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">{label}</p>
            <p className={`text-2xl font-semibold font-mono ${color}`}>{value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      <OverdueRemindersBanner invoices={overdueRows} overdueTotal={fmt(totalOverdue)} today={today} />

      {/* Invoice list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {!invoices?.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
              <FileText className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600 mb-1">{t("invoices.list.emptyTitle")}</p>
            <p className="text-xs text-slate-400 max-w-xs mb-4">
              {t("invoices.list.emptyBody")}
            </p>
            <Link
              href="/books/invoices/new"
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4" /> {t("invoices.list.createInvoice")}
            </Link>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-[1fr_120px_100px_100px_120px] gap-4 px-6 py-3 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <span>{t("invoices.list.columns.client")}</span>
              <span>{t("invoices.list.columns.issued")}</span>
              <span>{t("invoices.list.columns.due")}</span>
              <span className="text-right">{t("invoices.list.columns.amount")}</span>
              <span className="text-right">{t("invoices.list.columns.status")}</span>
            </div>

            <div className="divide-y divide-slate-50">
              {invoices.map((inv) => {
                const clientRaw = inv.clients;
                const client = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as {
                  first_name: string | null; last_name: string | null; company: string | null;
                } | null;
                const clientName = client
                  ? [client.first_name, client.last_name].filter(Boolean).join(" ") || client.company || "—"
                  : "—";

                // Auto-detect overdue
                const effectiveStatus =
                  inv.status === "sent" && inv.due_date < today ? "overdue" : inv.status as keyof typeof STATUS_CONFIG;
                const cfg = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.draft;
                const StatusIcon = cfg.icon;

                return (
                  <Link
                    key={inv.id}
                    href={`/books/invoices/${inv.id}`}
                    className="grid grid-cols-[1fr_120px_100px_100px_120px] gap-4 px-6 py-4 hover:bg-slate-50 transition-colors items-center"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{clientName}</p>
                      <p className="text-xs text-slate-400 font-mono">{inv.invoice_number}</p>
                    </div>
                    <span className="text-sm text-slate-600">
                      {issuedDate(inv.issue_date)}
                    </span>
                    <span className={`text-sm ${effectiveStatus === "overdue" ? "text-rose-600 font-medium" : "text-slate-600"}`}>
                      {dueDate(inv.due_date)}
                    </span>
                    <span className="text-sm font-semibold text-slate-800 tabular-nums text-right">
                      {fmt(Number(inv.total))}
                    </span>
                    <div className="flex justify-end">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {t(`status.invoice.${effectiveStatus}`)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
