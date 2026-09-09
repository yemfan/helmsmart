import type { Metadata } from "next";
import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";
import { rich } from "../_rich";

const LEADSMART_URL = "https://leadsmart-ai.com";
const LEADSMART_LINK = {
  href: LEADSMART_URL,
  external: true,
  className: "text-indigo-600 hover:text-indigo-700 font-medium",
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("site");
  return {
    title: t("privacy.meta.title"),
    description: t("privacy.meta.description"),
  };
}

export default async function PrivacyPage() {
  const t = await getServerT("site");

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="border-b border-gray-100 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            {t("privacy.title")}
          </h1>
          <p className="mt-4 text-lg text-gray-500">
            {t("privacy.lastUpdated")}
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <div className="prose prose-sm max-w-none space-y-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">{t("privacy.sections.intro.title")}</h2>
            <p className="text-gray-600 leading-relaxed">{t("privacy.sections.intro.p")}</p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">{t("privacy.sections.collect.title")}</h2>
            <p className="text-gray-600 leading-relaxed mb-3">{t("privacy.sections.collect.intro")}</p>
            <ul className="list-disc list-inside space-y-2 text-gray-600">
              {["i1", "i2", "i3", "i4", "i5"].map((i) => (
                <li key={i}>{t(`privacy.sections.collect.items.${i}`)}</li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">{t("privacy.sections.use.title")}</h2>
            <p className="text-gray-600 leading-relaxed mb-3">{t("privacy.sections.use.intro")}</p>
            <ul className="list-disc list-inside space-y-2 text-gray-600">
              {["i1", "i2", "i3", "i4", "i5", "i6"].map((i) => (
                <li key={i}>{t(`privacy.sections.use.items.${i}`)}</li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">{t("privacy.sections.security.title")}</h2>
            <p className="text-gray-600 leading-relaxed">{t("privacy.sections.security.p")}</p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">{t("privacy.sections.thirdParty.title")}</h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              {rich(t("privacy.sections.thirdParty.intro"), { links: [LEADSMART_LINK] })}
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-600">
              {["i1", "i2", "i3", "i4"].map((i) => (
                <li key={i}>{t(`privacy.sections.thirdParty.items.${i}`)}</li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">{t("privacy.sections.sms.title")}</h2>
            <p className="text-gray-600 leading-relaxed mb-3">{t("privacy.sections.sms.p1")}</p>
            <p className="text-gray-600 leading-relaxed">
              <strong>{t("privacy.sections.sms.p2")}</strong>
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">{t("privacy.sections.rights.title")}</h2>
            <p className="text-gray-600 leading-relaxed">{t("privacy.sections.rights.p")}</p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">{t("privacy.sections.changes.title")}</h2>
            <p className="text-gray-600 leading-relaxed">{t("privacy.sections.changes.p")}</p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">{t("privacy.sections.contact.title")}</h2>
            <p className="text-gray-600 leading-relaxed">{t("privacy.sections.contact.p")}</p>
            <p className="text-gray-600 mt-3">
              <strong>{t("privacy.sections.contact.emailLabel")}</strong> privacy@helmsmart.ai<br />
              <strong>{t("privacy.sections.contact.webLabel")}</strong>{" "}
              <Link href="/contact" className="text-indigo-600 hover:text-indigo-700">helmsmart.ai/contact</Link>
            </p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            {rich(t("privacy.footerNote"), {
              links: [{ ...LEADSMART_LINK, className: "text-indigo-600 hover:text-indigo-700" }],
            })}
          </p>
        </div>
      </section>
    </div>
  );
}
