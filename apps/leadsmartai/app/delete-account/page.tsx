import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.deleteAccount.title", { ns: "web_marketing" });
  const description = t("routeMeta.deleteAccount.description", { ns: "web_marketing" });
  return {
  ...pageMetadata({
    title,
    description,
    path: "/delete-account",
  }),
  robots: { index: true, follow: true },
};
}

export default async function DeleteAccountPage() {
  const t = await getServerT();
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">{t("pages.deleteAccount.h1", { ns: "web_pages" })}</h1>
      <p className="text-sm text-slate-500 mb-8">{t("pages.deleteAccount.intro", { ns: "web_pages" })}</p>

      <section className="mb-10 rounded-lg border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">{t("pages.deleteAccount.fromApp", { ns: "web_pages" })}</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-slate-700">
          <li>{t("pages.deleteAccount.step1", { ns: "web_pages" })}</li>
          <li>{t("pages.deleteAccount.step2", { ns: "web_pages" })} <strong>{t("pages.deleteAccount.settings", { ns: "web_pages" })}</strong> tab.
          </li>
          <li>{t("pages.deleteAccount.step3", { ns: "web_pages" })} <strong>{t("pages.deleteAccount.deleteAccount", { ns: "web_pages" })}</strong>.
          </li>
          <li>
            {t("pages.deleteAccount.confirmByTyping", { ns: "web_pages" })} <code>DELETE</code> {t("pages.deleteAccount.andTapping", { ns: "web_pages" })}
          </li>
        </ol>
        <p className="mt-3 text-sm text-slate-600">{t("pages.deleteAccount.immediate", { ns: "web_pages" })}</p>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">{t("pages.deleteAccount.noApp", { ns: "web_pages" })}</h2>
        <p className="text-sm text-slate-700 mb-3">{t("pages.deleteAccount.sendEmail", { ns: "web_pages" })}{" "}
          <a
            href="mailto:contact@closebossai.com?subject=Account%20deletion%20request"
            className="text-[#0072ce] hover:underline"
          >
            contact@closebossai.com
          </a>{" "}{t("pages.deleteAccount.fromAddress", { ns: "web_pages" })} <strong>&ldquo;Account deletion request&rdquo;</strong>.
          We will confirm receipt and complete the deletion within five business
          days.
        </p>
        <p className="text-sm text-slate-700">{t("pages.deleteAccount.verification", { ns: "web_pages" })}</p>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">{t("pages.deleteAccount.whatDeleted", { ns: "web_pages" })}</h2>
        <ul className="list-disc list-inside space-y-2 text-sm text-slate-700">
          <li>{t("pages.deleteAccount.d1", { ns: "web_pages" })}</li>
          <li>{t("pages.deleteAccount.d2", { ns: "web_pages" })}</li>
          <li>{t("pages.deleteAccount.d3", { ns: "web_pages" })}</li>
          <li>{t("pages.deleteAccount.d4", { ns: "web_pages" })}</li>
          <li>{t("pages.deleteAccount.d5", { ns: "web_pages" })}</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">{t("pages.deleteAccount.whatKept", { ns: "web_pages" })}</h2>
        <ul className="list-disc list-inside space-y-2 text-sm text-slate-700">
          <li>
            <strong>{t("pages.deleteAccount.k1", { ns: "web_pages" })}</strong> {t("pages.deleteAccount.k1Body", { ns: "web_pages" })}</li>
          <li>
            <strong>{t("pages.deleteAccount.k2", { ns: "web_pages" })}</strong> {t("pages.deleteAccount.k2Body", { ns: "web_pages" })}</li>
          <li>
            <strong>{t("pages.deleteAccount.k3", { ns: "web_pages" })}</strong> {t("pages.deleteAccount.k3Body", { ns: "web_pages" })}</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">{t("pages.deleteAccount.timing", { ns: "web_pages" })}</h2>
        <p className="text-sm text-slate-700">{t("pages.deleteAccount.timingBody", { ns: "web_pages" })}</p>
      </section>

      <div className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500">{t("pages.deleteAccount.seeAlso", { ns: "web_pages" })}{" "}
        <Link href="/privacy" className="text-[#0072ce] hover:underline">{t("pages.articleChrome.privacyPolicy", { ns: "web_pages" })}</Link>{" "}
        {t("conjunctions.and", { ns: "common" })}{" "}
        <Link href="/terms" className="text-[#0072ce] hover:underline">{t("pages.articleChrome.termsOfService", { ns: "web_pages" })}</Link>
        .
      </div>
    </div>
  );
}
