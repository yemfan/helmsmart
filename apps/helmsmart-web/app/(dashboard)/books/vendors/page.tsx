import { PageTitle } from "@/components/page-title";
import type { Metadata } from "next";
import { BooksNav } from "@/components/books-nav";
import { listVendorsWithSpend } from "@/lib/actions/vendors";
import { getServerT } from "@/lib/i18n/server";
import { orgCurrency } from "@/lib/books-currency";
import { VendorsClient } from "./vendors-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("books");
  return { title: t("vendors.meta.list") };
}

export default async function VendorsPage() {
  const t = await getServerT("books");
  const currency = await orgCurrency();
  const vendors = await listVendorsWithSpend();

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <PageTitle base="Books" />
        <p className="text-sm text-slate-500 mt-0.5">{t("vendors.subtitle")}</p>
      </div>

      <BooksNav />

      <VendorsClient initialVendors={vendors} currency={currency} />
    </div>
  );
}
