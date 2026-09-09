import { PageTitle } from "@/components/page-title";
import type { Metadata } from "next";
import { BooksNav } from "@/components/books-nav";
import { get1099Report } from "@/lib/actions/vendors";
import { getServerT } from "@/lib/i18n/server";
import { orgCurrency } from "@/lib/books-currency";
import { Report1099Client } from "./report-1099-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("books");
  return { title: t("vendors.meta.report1099") };
}

export default async function Vendor1099Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const t = await getServerT("books");
  const { year: yearParam } = await searchParams;
  const currency = await orgCurrency();
  const currentYear = new Date().getFullYear();
  const year = Number(yearParam) || currentYear;
  const report = await get1099Report(year);
  const years = [currentYear, currentYear - 1, currentYear - 2];

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <PageTitle base="Books" />
        <p className="text-sm text-slate-500 mt-0.5">{t("vendors.subtitle")}</p>
      </div>

      <BooksNav />

      <Report1099Client report={report} years={years} currency={currency} />
    </div>
  );
}
