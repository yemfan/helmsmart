import { PageTitle } from "@/components/page-title";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { BooksNav } from "@/components/books-nav";
import { listRecurringBills } from "@/lib/actions/recurring-bills";
import { listVendorNames } from "@/lib/actions/vendors";
import { getServerT } from "@/lib/i18n/server";
import { orgCurrency } from "@/lib/books-currency";
import { RecurringBillsClient } from "./recurring-bills-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("books");
  return { title: t("bills.meta.recurring") };
}

export default async function RecurringBillsPage() {
  const t = await getServerT("books");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const currency = await orgCurrency(orgId);
  const supabase = await createClient();

  const [recurring, expenseAccountsRes, vendorNames] = await Promise.all([
    listRecurringBills(),
    supabase
      .from("chart_of_accounts")
      .select("id, code, name")
      .eq("organization_id", orgId)
      .eq("type", "expense")
      .eq("is_active", true)
      .order("code"),
    listVendorNames(),
  ]);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <PageTitle base="Books" />
        <p className="text-sm text-slate-500 mt-0.5">{t("bills.subtitle")}</p>
      </div>

      <BooksNav />

      <RecurringBillsClient
        initialRecurring={recurring}
        expenseAccounts={(expenseAccountsRes.data ?? []) as { id: string; code: string; name: string }[]}
        vendorNames={vendorNames}
        currency={currency}
      />
    </div>
  );
}
