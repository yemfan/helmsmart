import type { Metadata } from "next";
import SalesFormComponent from "../_components/sales-form";
import { getServerT } from "@/lib/i18n/server";
import { rich } from "../../_rich";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("site");
  return {
    title: t("sales.meta.title"),
    description: t("sales.meta.description"),
  };
}

const STATS = ["trial", "response", "refund"];

export default async function SalesPage() {
  const t = await getServerT("site");

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="border-b border-gray-100 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            {t("sales.hero.title")}
          </h1>
          <p className="mt-4 text-lg text-gray-500">
            {t("sales.hero.subtitle")}
          </p>
        </div>
      </section>

      {/* Sales Form */}
      <section className="mx-auto max-w-2xl px-6 py-20">
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <SalesFormComponent />
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-3 text-center">
          {STATS.map((key) => (
            <div key={key}>
              <p className="text-3xl font-bold text-indigo-600">{t(`sales.stats.${key}.value`)}</p>
              <p className="mt-2 text-sm text-gray-600">{t(`sales.stats.${key}.label`)}</p>
            </div>
          ))}
        </div>

        <p className="mt-12 text-center text-sm text-gray-500">
          {rich(t("sales.footerNote"), {
            links: [
              { href: "/pricing", className: "font-medium text-indigo-600 hover:text-indigo-700" },
              { href: "/signup", className: "font-medium text-indigo-600 hover:text-indigo-700" },
            ],
          })}
        </p>
      </section>
    </div>
  );
}
