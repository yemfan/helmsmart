import { PageTitle } from "@/components/page-title";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { BooksNav } from "@/components/books-nav";
import { listBills } from "@/lib/actions/bills";
import { listVendorNames } from "@/lib/actions/vendors";
import { getServerT } from "@/lib/i18n/server";
import { orgCurrency } from "@/lib/books-currency";
import { orgTimezone } from "@/lib/org-timezone";
import { BillsClient } from "./bills-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("books");
  return { title: t("bills.meta.list") };
}

export default async function BillsPage() {
  const t = await getServerT("books");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const [currency, timeZone] = await Promise.all([orgCurrency(orgId), orgTimezone(orgId)]);
  const supabase = await createClient();

  const [bills, expenseAccountsRes, bankAccountsRes, vendorNames] = await Promise.all([
    listBills(),
    supabase
      .from("chart_of_accounts")
      .select("id, code, name")
      .eq("organization_id", orgId)
      .eq("type", "expense")
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("bank_accounts")
      .select("id, name, mask, coa_account_id")
      .eq("organization_id", orgId)
      .eq("is_active", true),
    listVendorNames(),
  ]);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <PageTitle base="Books" />
        <p className="text-sm text-slate-500 mt-0.5">{t("bills.subtitle")}</p>
      </div>

      <BooksNav />

      <BillsClient
        initialBills={bills}
        expenseAccounts={(expenseAccountsRes.data ?? []) as { id: string; code: string; name: string }[]}
        bankAccounts={(bankAccountsRes.data ?? []) as { id: string; name: string; mask: string | null; coa_account_id: string | null }[]}
        vendorNames={vendorNames}
        currency={currency}
        timeZone={timeZone}
      />
    </div>
  );
}
