import { PageTitle } from "@/components/page-title";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { BooksNav } from "@/components/books-nav";
import { TransactionReviewRow } from "@/components/transaction-review-row";
import { Download } from "lucide-react";
import { getServerT } from "@/lib/i18n/server";
import { orgCurrency } from "@/lib/books-currency";

/** The three states the filter tabs offer; also the `?filter=` values. */
const FILTERS = ["pending", "all", "reviewed"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("books");
  return { title: t("transactions.list.metaTitle") };
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const t = await getServerT("books");
  const params = await searchParams;
  const filter = params.filter ?? "pending"; // pending | all | reviewed
  const page = Math.max(1, Number(params.page ?? 1));
  const pageSize = 30;

  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const currency = await orgCurrency(orgId);

  const supabase = await createClient();

  // Fetch chart of accounts for the category dropdown
  const { data: coaRaw } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name, type")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("code");

  const coa = coaRaw ?? [];

  // Build transaction query
  let query = supabase
    .from("bank_transactions")
    .select(`
      id, date, name, merchant_name, amount, pending,
      personal_finance_category, reviewed, memo,
      ai_category_confidence, ai_suggested_memo,
      journal_entry_id,
      coa_account_id,
      bank_accounts!inner(name, mask, type)
    `, { count: "exact" })
    .eq("organization_id", orgId)
    .order("date", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (filter === "pending") {
    query = query.eq("reviewed", false).eq("pending", false);
  } else if (filter === "reviewed") {
    query = query.eq("reviewed", true);
  }
  // "all" = no extra filter

  const { data: txns, count } = await query;

  const totalPages = Math.ceil((count ?? 0) / pageSize);
  const pendingCount = await getPendingCount(supabase, orgId);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <PageTitle base="Books" />
          <p className="text-sm text-slate-500 mt-0.5">
            {t("transactions.list.subtitle")}
          </p>
        </div>
      </div>

      <BooksNav />

      {/* Filter tabs */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {FILTERS.map((f) => (
            <a
              key={f}
              href={`/books/transactions?filter=${f}`}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {f === "pending" ? (
                <span className="flex items-center gap-1.5">
                  {t("transactions.filters.pending")}
                  {pendingCount > 0 && (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
                      {pendingCount > 99 ? "99+" : pendingCount}
                    </span>
                  )}
                </span>
              ) : t(`transactions.filters.${f}`)}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            {t("transactions.list.count", { count: count ?? 0 })}
          </span>
          <Link
            href="/api/export/transactions"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {t("transactions.list.exportCsv")}
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[90px_1fr_160px_100px_90px] gap-4 px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
          <span>{t("transactions.list.columns.date")}</span>
          <span>{t("transactions.list.columns.description")}</span>
          <span>{t("transactions.list.columns.category")}</span>
          <span className="text-right">{t("transactions.list.columns.amount")}</span>
          <span className="text-right">{t("transactions.list.columns.action")}</span>
        </div>

        {!txns?.length ? (
          <div className="py-16 text-center text-sm text-slate-400">
            {filter === "pending"
              ? t("transactions.list.emptyPending")
              : t("transactions.list.empty")}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {txns.map((tx) => (
              <TransactionReviewRow key={tx.id} transaction={tx} coa={coa} currency={currency} />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          {page > 1 && (
            <a
              href={`/books/transactions?filter=${filter}&page=${page - 1}`}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
            >
              {t("transactions.list.previous")}
            </a>
          )}
          <span className="text-sm text-slate-500">
            {t("transactions.list.page", { page, total: totalPages })}
          </span>
          {page < totalPages && (
            <a
              href={`/books/transactions?filter=${filter}&page=${page + 1}`}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
            >
              {t("transactions.list.next")}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

async function getPendingCount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string
): Promise<number> {
  const { count } = await supabase
    .from("bank_transactions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("reviewed", false)
    .eq("pending", false);
  return count ?? 0;
}
