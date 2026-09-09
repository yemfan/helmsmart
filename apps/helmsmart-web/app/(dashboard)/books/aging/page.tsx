import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { BooksNav } from "@/components/books-nav";
import { ArrowUpRight, AlertTriangle } from "lucide-react";
import { getServerT, getServerLocale } from "@/lib/i18n/server";
import { orgCurrency } from "@/lib/books-currency";
import { moneyFormatter, dateFormatter } from "@/lib/books-format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("books");
  return { title: t("aging.metaTitle") };
}

type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

interface AgingRow {
  id: string;
  label: string; // invoice # or bill #, or vendor/client name
  dueDate: string;
  amount: number;
  bucket: AgingBucket;
  daysOverdue: number;
  href: string;
}

function getBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "1-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

const BUCKET_ORDER: AgingBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];

const BUCKET_COLORS: Record<AgingBucket, string> = {
  "current": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "1-30":    "bg-amber-50  text-amber-700  border-amber-200",
  "31-60":   "bg-orange-50 text-orange-700 border-orange-200",
  "61-90":   "bg-rose-50   text-rose-700   border-rose-200",
  "90+":     "bg-rose-100  text-rose-800   border-rose-300",
};

async function AgingTable({
  rows,
  type,
}: {
  rows: AgingRow[];
  type: "ar" | "ap";
}) {
  const t = await getServerT("books");
  const locale = await getServerLocale();
  const currency = await orgCurrency();
  const fmt = moneyFormatter(locale, currency);
  const fmtDate = dateFormatter(locale, { month: "short", day: "numeric", year: "numeric" });

  const totals: Record<AgingBucket, number> = {
    "current": 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0,
  };
  for (const r of rows) totals[r.bucket] += r.amount;
  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);
  const pastDue = rows.filter((r) => r.bucket !== "current").reduce((s, r) => s + r.amount, 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{t(`aging.tables.${type}`)}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {t("aging.summary.open", { count: rows.length })} ·{" "}
            {t("aging.summary.total", { amount: fmt(grandTotal) })} ·{" "}
            {pastDue > 0 ? (
              <span className="text-rose-600 font-medium">
                {t("aging.summary.pastDue", { amount: fmt(pastDue) })}
              </span>
            ) : (
              <span className="text-emerald-600 font-medium">{t("aging.summary.nothingPastDue")}</span>
            )}
          </p>
        </div>
        <Link
          href={type === "ar" ? "/books/invoices" : "/books/bills"}
          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
        >
          {t("aging.viewAll")} <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Bucket summary bar */}
      <div className="grid grid-cols-5 gap-0 border-b border-slate-100">
        {BUCKET_ORDER.map((bucket) => (
          <div key={bucket} className={`p-4 text-center ${totals[bucket] > 0 ? "" : "opacity-40"}`}>
            <p className={`text-xs font-semibold px-2 py-0.5 rounded-full border inline-block ${BUCKET_COLORS[bucket]}`}>
              {t(`aging.buckets.${bucket}`)}
            </p>
            <p className="text-sm font-bold text-slate-800 mt-2 tabular-nums">
              {fmt(totals[bucket])}
            </p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-slate-400">
            {type === "ar" ? t("aging.empty.invoices") : t("aging.empty.bills")}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-50 bg-slate-50">
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {type === "ar" ? t("aging.columns.client") : t("aging.columns.vendor")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t("aging.columns.reference")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t("aging.columns.dueDate")}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t("aging.columns.amount")}
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t("aging.columns.status")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows
                .sort((a, b) => b.daysOverdue - a.daysOverdue)
                .map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3">
                      <Link
                        href={row.href}
                        className="font-medium text-slate-800 hover:text-indigo-600 transition-colors"
                      >
                        {row.label}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      —
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {fmtDate(row.dueDate)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">
                      {fmt(row.amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full border ${BUCKET_COLORS[row.bucket]}`}
                      >
                        {row.bucket === "current"
                          ? t("aging.status.current")
                          : t("aging.status.daysOverdue", { days: row.daysOverdue })}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default async function AgingPage() {
  const t = await getServerT("books");
  const locale = await getServerLocale();
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const currency = await orgCurrency(orgId);
  const fmt = moneyFormatter(locale, currency);
  const supabase = await createClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [invoicesRes, billsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, due_date, total, client:client_id(first_name, last_name, company)")
      .eq("organization_id", orgId)
      .in("status", ["sent", "overdue"])
      .order("due_date"),
    supabase
      .from("bills")
      .select("id, bill_number, vendor, due_date, amount")
      .eq("organization_id", orgId)
      .eq("status", "open")
      .order("due_date"),
  ]);

  // Build AR rows
  const arRows: AgingRow[] = (invoicesRes.data ?? []).map((inv) => {
    const due = new Date(inv.due_date + "T00:00:00");
    const daysOverdue = Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86_400_000));
    const clientRaw = inv.client as unknown as { first_name?: string; last_name?: string; company?: string } | null;
    const clientName = clientRaw
      ? [clientRaw.first_name, clientRaw.last_name].filter(Boolean).join(" ") || clientRaw.company || t("aging.unnamedClient")
      : t("aging.unnamedClient");
    return {
      id: inv.id,
      label: clientName,
      dueDate: inv.due_date,
      amount: Number(inv.total),
      bucket: getBucket(daysOverdue),
      daysOverdue,
      href: `/books/invoices/${inv.id}`,
    };
  });

  // Build AP rows
  const apRows: AgingRow[] = (billsRes.data ?? []).map((bill) => {
    const due = new Date(bill.due_date + "T00:00:00");
    const daysOverdue = Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86_400_000));
    return {
      id: bill.id,
      label: bill.vendor,
      dueDate: bill.due_date,
      amount: Number(bill.amount),
      bucket: getBucket(daysOverdue),
      daysOverdue,
      href: `/books/bills`,
    };
  });

  const totalAR = arRows.reduce((s, r) => s + r.amount, 0);
  const totalAP = apRows.reduce((s, r) => s + r.amount, 0);
  const overdueAR = arRows.filter((r) => r.bucket !== "current").reduce((s, r) => s + r.amount, 0);
  const overdueAP = apRows.filter((r) => r.bucket !== "current").reduce((s, r) => s + r.amount, 0);

  const asOf = dateFormatter(locale, { month: "long", day: "numeric", year: "numeric" });

  const cards = [
    {
      key: "totalReceivable",
      value: fmt(totalAR),
      sub: t("aging.cards.openInvoices", { count: arRows.length }),
      color: "text-indigo-600",
      warn: false,
    },
    {
      key: "arOverdue",
      value: fmt(overdueAR),
      sub: t("aging.cards.invoices", { count: arRows.filter((r) => r.bucket !== "current").length }),
      color: overdueAR > 0 ? "text-rose-600" : "text-emerald-600",
      warn: overdueAR > 0,
    },
    {
      key: "totalPayable",
      value: fmt(totalAP),
      sub: t("aging.cards.openBills", { count: apRows.length }),
      color: "text-slate-700",
      warn: false,
    },
    {
      key: "apOverdue",
      value: fmt(overdueAP),
      sub: t("aging.cards.bills", { count: apRows.filter((r) => r.bucket !== "current").length }),
      color: overdueAP > 0 ? "text-rose-600" : "text-emerald-600",
      warn: overdueAP > 0,
    },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{t("aging.title")}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {t("aging.subtitle", { date: asOf(new Date()) })}
        </p>
      </div>

      <BooksNav />

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {cards.map(({ key, value, sub, color, warn }) => (
          <div
            key={key}
            className={`rounded-xl border p-5 ${warn ? "bg-rose-50 border-rose-200" : "bg-white border-slate-200"}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                {t(`aging.cards.${key}`)}
              </span>
              {warn && <AlertTriangle className="w-4 h-4 text-rose-400" />}
            </div>
            <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      <div className="space-y-6">
        <AgingTable rows={arRows} type="ar" />
        <AgingTable rows={apRows} type="ap" />
      </div>
    </div>
  );
}
