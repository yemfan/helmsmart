import type { Metadata } from "next";
import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";
import { rich } from "../_rich";

const CLOSEBOSS_URL = "https://www.closebossai.com";

// Copy lives in `site.about.values.items.*`; the array holds only the key.
const VALUES = ["pain", "works", "clarity", "corner"];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("site");
  return {
    title: t("about.meta.title"),
    description: t("about.meta.description"),
  };
}

export default async function AboutPage() {
  const t = await getServerT("site");

  return (
    <div className="bg-white text-gray-900">

      {/* Hero */}
      <section className="border-b border-gray-100 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-4xl px-6 py-20 sm:py-28">
          <p className="mb-4 inline-flex rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-widest text-gray-500 shadow-sm">
            {t("about.hero.eyebrow")}
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl leading-tight">
            {t("about.hero.title")}
          </h1>
          <p className="mt-6 text-lg text-gray-600 leading-relaxed max-w-2xl">
            {t("about.hero.subtitle")}
          </p>
        </div>
      </section>

      {/* Origin story */}
      <section className="mx-auto max-w-4xl px-6 py-20">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl mb-6">
              {t("about.origin.title")}
            </h2>
            <div className="space-y-4 text-gray-600 leading-relaxed">
              <p>
                {rich(t("about.origin.p1"), {
                  links: [
                    {
                      href: CLOSEBOSS_URL,
                      external: true,
                      className: "font-semibold text-indigo-600 hover:text-indigo-700",
                    },
                  ],
                })}
              </p>
              <p>{t("about.origin.p2")}</p>
              <p>{t("about.origin.p3")}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-slate-50 p-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
              {t("about.sibling.eyebrow")}
            </p>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-lg">
                C
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-lg">{t("about.sibling.name")}</h3>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                  {t("about.sibling.description")}
                </p>
                <Link
                  href={CLOSEBOSS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  {t("about.sibling.link")}
                </Link>
              </div>
            </div>
            <div className="mt-6 border-t border-gray-200 pt-6">
              <p className="text-xs text-gray-400 leading-relaxed">
                {t("about.sibling.note")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="bg-gray-50 border-y border-gray-100 py-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl mb-6">{t("about.mission.title")}</h2>
          <p className="text-xl text-gray-600 leading-relaxed max-w-2xl mx-auto">
            {t("about.mission.body")}
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="mx-auto max-w-4xl px-6 py-20">
        <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl mb-12 text-center">{t("about.values.title")}</h2>
        <div className="grid gap-8 sm:grid-cols-2">
          {VALUES.map((key) => (
            <div key={key} className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
              <h3 className="font-semibold text-gray-900 text-base mb-2">
                {t(`about.values.items.${key}.title`)}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                {t(`about.values.items.${key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="mx-auto max-w-3xl rounded-3xl bg-gradient-to-r from-indigo-600 to-violet-600 px-8 py-16 text-center shadow-xl">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            {t("about.cta.title")}
          </h2>
          <p className="mt-4 text-lg text-indigo-100">
            {t("about.cta.subtitle")}
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center rounded-xl bg-white px-8 py-4 text-base font-semibold text-indigo-600 shadow-sm hover:bg-indigo-50 transition-colors"
            >
              {t("about.cta.primary")}
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center rounded-xl border border-white/30 px-8 py-4 text-base font-semibold text-white hover:bg-white/10 transition-colors"
            >
              {t("about.cta.secondary")}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
