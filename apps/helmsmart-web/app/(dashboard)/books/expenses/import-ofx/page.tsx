import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ImportOFXForm } from "./import-form";
import { getServerT } from "@/lib/i18n/server";
import { orgCurrency } from "@/lib/books-currency";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("books");
  return { title: t("expenses.import.ofx.metaTitle") };
}

export default async function ImportOFXPage() {
  const t = await getServerT("books");
  const currency = await orgCurrency();

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t("expenses.import.ofx.title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t("expenses.import.ofx.subtitle")}
          </p>
        </div>
        <Link
          href="/books/expenses"
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("expenses.import.back")}
        </Link>
      </div>

      <ImportOFXForm currency={currency} />
    </div>
  );
}
