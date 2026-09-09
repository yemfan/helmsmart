import { PageTitle } from "@/components/page-title";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileText, Plus } from "lucide-react";
import { BooksNav } from "@/components/books-nav";
import { listEstimateTemplates } from "@/lib/actions/estimate-templates";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { moneyFormatter } from "@/lib/books-format";
import { orgCurrency } from "@/lib/books-currency";
import { DeleteTemplateButton } from "./delete-template-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("books");
  return { title: t("estimates.meta.templates") };
}

export default async function EstimateTemplatesPage() {
  const t = await getServerT("books");
  const locale = await getServerLocale();
  const currency = await orgCurrency();
  const fmt = moneyFormatter(locale, currency);
  const templates = await listEstimateTemplates();

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <PageTitle base="Books" />
          <p className="text-sm text-slate-500 mt-0.5">{t("estimates.subtitle")}</p>
        </div>
        <Link
          href="/books/estimates"
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("estimates.templates.back")}
        </Link>
      </div>

      <BooksNav />

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-slate-800">
          {t("estimates.templates.title")}
        </h2>
        <Link
          href="/books/estimates/new"
          className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800"
        >
          <Plus className="w-3.5 h-3.5" />
          {t("estimates.templates.newEstimate")}
        </Link>
      </div>

      {templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <FileText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">
            {t("estimates.templates.empty.title")}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {t("estimates.templates.empty.body")}
          </p>
          <Link
            href="/books/estimates/new"
            className="mt-4 inline-block text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            {t("estimates.templates.empty.cta")}
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-50">
          {templates.map((tpl) => {
            const subtotal = tpl.lines.reduce((s, l) => s + Number(l.amount), 0);
            // Facts about the template, each a whole phrase — never a sentence
            // welded out of halves, whose word order differs by language.
            const facts = [
              t("estimates.templates.lineCount", { count: tpl.lines.length }),
              t("estimates.templates.subtotalAmount", { amount: fmt(subtotal) }),
            ];
            if (tpl.tax_rate > 0) {
              facts.push(
                t("estimates.templates.taxRate", {
                  rate: (tpl.tax_rate * 100).toFixed(2),
                })
              );
            }
            return (
              <div key={tpl.id} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{tpl.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{facts.join(" · ")}</p>
                </div>
                <DeleteTemplateButton id={tpl.id} name={tpl.name} />
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-400 mt-4">
        {t("estimates.templates.footnote")}
      </p>
    </div>
  );
}
