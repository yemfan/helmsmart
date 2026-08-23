import type { Metadata } from "next";
import Link from "next/link";
import SmsOptInForm from "./SmsOptInForm";
import { pageMetadata } from "@/lib/seo";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.sms.title", { ns: "web_marketing" });
  const description = t("routeMeta.sms.description", { ns: "web_marketing" });
  return {
  ...pageMetadata({
    title,
    description,
    path: "/sms",
  }),
  // Publicly indexable so carrier reviewers can reach the opt-in flow directly.
  robots: { index: true, follow: true },
};
}

/**
 * Public SMS opt-in page — a carrier-reviewable URL (A2P 10DLC) showing the
 * full message-flow + the unchecked-by-default consent checkbox. The program
 * disclosures are server-rendered so they're in the initial HTML for reviewers
 * and crawlers. Persists each opt-in via /api/sms/opt-in (proof of consent).
 */
export default async function SmsOptInPage() {
  const t = await getServerT();
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{t("pages.smsOptIn.h1", { ns: "dashboard" })}</h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-slate-600">{t("pages.smsOptIn.sub", { ns: "dashboard" })}</p>
      </div>

      <div className="mt-10 grid gap-8 md:grid-cols-2">
        {/* Program disclosures — server-rendered (in the HTML for reviewers). */}
        <div className="space-y-4 text-sm leading-6 text-slate-700">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t("pages.smsOptIn.aboutProgram", { ns: "dashboard" })}</h2>
            <p className="mt-2">
              <strong>CloseBoss</strong> (a product of MAXY Investment Inc.)
              sends conversational and transactional text messages on behalf of
              your real estate agent: replies to your inquiry, showing and
              appointment confirmations, listing and home-search updates, and
              follow-ups.
            </p>
          </div>
          <ul className="space-y-2">
            <li>
              <strong>{t("pages.smsOptIn.frequency", { ns: "dashboard" })}</strong> {t("pages.smsOptIn.frequencyTail", { ns: "dashboard" })}</li>
            <li>
              <strong>{t("pages.smsOptIn.rates", { ns: "dashboard" })}</strong> (charged by your
              mobile carrier).
            </li>
            <li>{t("pages.smsOptIn.reply", { ns: "dashboard" })} <strong>{t("pages.smsOptIn.stop", { ns: "dashboard" })}</strong> {t("pages.smsOptIn.toUnsubscribe", { ns: "dashboard" })}{" "}
              <strong>{t("pages.smsOptIn.help", { ns: "dashboard" })}</strong> {t("pages.smsOptIn.forHelpOrEmail", { ns: "dashboard" })}{" "}
              <a href="mailto:contact@closebossai.com" className="text-[#0072ce] hover:underline">
                contact@closebossai.com
              </a>
              .
            </li>
            <li>{t("pages.smsOptIn.notACondition", { ns: "dashboard" })}</li>
          </ul>
          <p className="text-xs text-slate-500">{t("pages.smsOptIn.bySubmitting", { ns: "dashboard" })}{" "}
            <Link href="/privacy" className="text-[#0072ce] hover:underline">{t("pages.articleChrome.privacyPolicy", { ns: "dashboard" })}</Link>{" "}
            {t("conjunctions.and", { ns: "common" })}{" "}
            <Link href="/terms" className="text-[#0072ce] hover:underline">{t("pages.smsOptIn.termsLink", { ns: "dashboard" })}</Link>
            . Mobile information is never shared with third parties for their own
            marketing.
          </p>
        </div>

        {/* Opt-in form */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <SmsOptInForm />
        </div>
      </div>
    </div>
  );
}
