import type { Metadata } from "next";
import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";
import { rich } from "../_rich";

const LINK_CLASS = "text-indigo-600 hover:text-indigo-700";
const LEADSMART_LINK = {
  href: "https://leadsmart-ai.com",
  external: true,
  className: `${LINK_CLASS} font-medium`,
};
const PRIVACY_LINK = { href: "/privacy", className: LINK_CLASS };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("site");
  return {
    title: t("terms.meta.title"),
    description: t("terms.meta.description"),
  };
}

export default async function TermsPage() {
  const t = await getServerT("site");

  const prose = (key: string) => (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">{t(`terms.sections.${key}.title`)}</h2>
      <p className="text-gray-600 leading-relaxed">{t(`terms.sections.${key}.p`)}</p>
    </div>
  );

  const list = (key: string, items: string[]) => (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">{t(`terms.sections.${key}.title`)}</h2>
      <p className="text-gray-600 leading-relaxed mb-3">{t(`terms.sections.${key}.intro`)}</p>
      <ul className="list-disc list-inside space-y-2 text-gray-600">
        {items.map((i) => (
          <li key={i}>{t(`terms.sections.${key}.items.${i}`)}</li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="border-b border-gray-100 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            {t("terms.title")}
          </h1>
          <p className="mt-4 text-lg text-gray-500">
            {t("terms.lastUpdated")}
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <div className="prose prose-sm max-w-none space-y-8">
          {prose("acceptance")}
          {prose("license")}
          {list("responsibilities", ["i1", "i2", "i3", "i4", "i5"])}
          {prose("ip")}
          {list("payment", ["i1", "i2", "i3", "i4"])}
          {prose("liability")}
          {prose("warranty")}
          {prose("refund")}
          {prose("termination")}

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">{t("terms.sections.sms.title")}</h2>
            <p className="text-gray-600 leading-relaxed mb-3">{t("terms.sections.sms.intro")}</p>
            <ul className="list-disc list-inside space-y-2 text-gray-600">
              {["i1", "i2", "i3", "i4", "i5", "i6"].map((i) => (
                <li key={i}>{rich(t(`terms.sections.sms.items.${i}`))}</li>
              ))}
            </ul>
            <p className="text-gray-600 leading-relaxed mt-3">
              {rich(t("terms.sections.sms.outro"), { links: [PRIVACY_LINK] })}
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">{t("terms.sections.related.title")}</h2>
            <p className="text-gray-600 leading-relaxed">
              {rich(t("terms.sections.related.p"), { links: [LEADSMART_LINK] })}
            </p>
          </div>

          {prose("changes")}

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">{t("terms.sections.contact.title")}</h2>
            <p className="text-gray-600 leading-relaxed">{t("terms.sections.contact.p")}</p>
            <p className="text-gray-600 mt-3">
              <strong>{t("terms.sections.contact.emailLabel")}</strong> legal@helmsmart.ai<br />
              <strong>{t("terms.sections.contact.webLabel")}</strong>{" "}
              <Link href="/contact" className={LINK_CLASS}>helmsmart.ai/contact</Link>
            </p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            {rich(t("terms.footerNote"), {
              links: [PRIVACY_LINK, { ...LEADSMART_LINK, className: LINK_CLASS }],
            })}
          </p>
        </div>
      </section>
    </div>
  );
}
