import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "Delete your CloseBoss account",
    description:
      "How to permanently delete your CloseBoss account and the personal data we hold about you. Required disclosure under Apple App Store and Google Play account-deletion policies.",
    path: "/delete-account",
  }),
  robots: { index: true, follow: true },
};

export default async function DeleteAccountPage() {
  const t = await getServerT();
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">{t("pages.deleteAccount.h1", { ns: "dashboard" })}</h1>
      <p className="text-sm text-slate-500 mb-8">{t("pages.deleteAccount.intro", { ns: "dashboard" })}</p>

      <section className="mb-10 rounded-lg border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">{t("pages.deleteAccount.fromApp", { ns: "dashboard" })}</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-slate-700">
          <li>{t("pages.deleteAccount.step1", { ns: "dashboard" })}</li>
          <li>{t("pages.deleteAccount.step2", { ns: "dashboard" })} <strong>{t("pages.deleteAccount.settings", { ns: "dashboard" })}</strong> tab.
          </li>
          <li>{t("pages.deleteAccount.step3", { ns: "dashboard" })} <strong>{t("pages.deleteAccount.deleteAccount", { ns: "dashboard" })}</strong>.
          </li>
          <li>
            {t("pages.deleteAccount.confirmByTyping", { ns: "dashboard" })} <code>DELETE</code> {t("pages.deleteAccount.andTapping", { ns: "dashboard" })}
          </li>
        </ol>
        <p className="mt-3 text-sm text-slate-600">{t("pages.deleteAccount.immediate", { ns: "dashboard" })}</p>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">{t("pages.deleteAccount.noApp", { ns: "dashboard" })}</h2>
        <p className="text-sm text-slate-700 mb-3">{t("pages.deleteAccount.sendEmail", { ns: "dashboard" })}{" "}
          <a
            href="mailto:contact@closebossai.com?subject=Account%20deletion%20request"
            className="text-[#0072ce] hover:underline"
          >
            contact@closebossai.com
          </a>{" "}{t("pages.deleteAccount.fromAddress", { ns: "dashboard" })} <strong>&ldquo;Account deletion request&rdquo;</strong>.
          We will confirm receipt and complete the deletion within five business
          days.
        </p>
        <p className="text-sm text-slate-700">{t("pages.deleteAccount.verification", { ns: "dashboard" })}</p>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">{t("pages.deleteAccount.whatDeleted", { ns: "dashboard" })}</h2>
        <ul className="list-disc list-inside space-y-2 text-sm text-slate-700">
          <li>{t("pages.deleteAccount.d1", { ns: "dashboard" })}</li>
          <li>{t("pages.deleteAccount.d2", { ns: "dashboard" })}</li>
          <li>{t("pages.deleteAccount.d3", { ns: "dashboard" })}</li>
          <li>{t("pages.deleteAccount.d4", { ns: "dashboard" })}</li>
          <li>{t("pages.deleteAccount.d5", { ns: "dashboard" })}</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">{t("pages.deleteAccount.whatKept", { ns: "dashboard" })}</h2>
        <ul className="list-disc list-inside space-y-2 text-sm text-slate-700">
          <li>
            <strong>{t("pages.deleteAccount.k1", { ns: "dashboard" })}</strong> {t("pages.deleteAccount.k1Body", { ns: "dashboard" })}</li>
          <li>
            <strong>{t("pages.deleteAccount.k2", { ns: "dashboard" })}</strong> {t("pages.deleteAccount.k2Body", { ns: "dashboard" })}</li>
          <li>
            <strong>{t("pages.deleteAccount.k3", { ns: "dashboard" })}</strong> {t("pages.deleteAccount.k3Body", { ns: "dashboard" })}</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">{t("pages.deleteAccount.timing", { ns: "dashboard" })}</h2>
        <p className="text-sm text-slate-700">{t("pages.deleteAccount.timingBody", { ns: "dashboard" })}</p>
      </section>

      <div className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500">{t("pages.deleteAccount.seeAlso", { ns: "dashboard" })}{" "}
        <Link href="/privacy" className="text-[#0072ce] hover:underline">{t("pages.articleChrome.privacyPolicy", { ns: "dashboard" })}</Link>{" "}
        and{" "}
        <Link href="/terms" className="text-[#0072ce] hover:underline">{t("pages.articleChrome.termsOfService", { ns: "dashboard" })}</Link>
        .
      </div>
    </div>
  );
}
