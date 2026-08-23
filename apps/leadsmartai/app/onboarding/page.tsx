import type { Metadata } from "next";
import Link from "next/link";
import OnboardingFunnel from "@/components/onboarding/OnboardingFunnel";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Get started — CloseBoss",
  description:
    "Interactive onboarding: personalize your market, preview AI leads, then unlock full CRM and automation.",
  robots: { index: false, follow: true },
};

/**
 * TOM report MJ-003: static fetch of /onboarding previously returned only
 * "Loading…" — no pre-JS content, no noscript fallback. That's an SEO +
 * accessibility hit and breaks the primary homepage CTA if JS fails.
 *
 * Fix: wrap the interactive client-side funnel in a server-rendered shell
 * with a real h1 + intro + product value props, plus a <noscript> block
 * with a plain-HTML path forward. The funnel hydrates on top of the shell;
 * when JS is absent the user still gets branded content, a working signup
 * link, and support contact info instead of a blank "Loading…" state.
 */
export default async function OnboardingPage() {
  const t = await getServerT();
  return (
    <>
      {/* Noscript fallback — fully static, no JS required. */}
      <noscript>
        <div className="mx-auto max-w-2xl px-4 py-16">
          <h1 className="text-3xl font-bold text-slate-900 mb-4">{t("pages.onboardingPage.getStarted", { ns: "dashboard" })}</h1>
          <p className="text-slate-700 leading-relaxed mb-4">{t("pages.onboardingPage.noJsBody", { ns: "dashboard" })}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="inline-flex rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >{t("pages.onboardingPage.createAccount", { ns: "dashboard" })}</Link>
            <Link
              href="/pricing"
              className="inline-flex rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >{t("pages.onboardingPage.seePricing", { ns: "dashboard" })}</Link>
          </div>
          <p className="mt-6 text-xs text-slate-500">{t("pages.onboardingPage.questions", { ns: "dashboard" })}{" "}
            <a href="mailto:contact@closebossai.com" className="text-blue-700 underline">
              contact@closebossai.com
            </a>
          </p>
        </div>
      </noscript>

      {/* Interactive funnel — hydrates on top; until hydration, the server-
          rendered shell below gives crawlers + slow connections real copy
          to chew on instead of a blank "Loading…" state. */}
      <OnboardingFunnel
        fallback={
          <section className="mx-auto max-w-3xl px-4 py-16 text-center">
            <p className="mb-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.15em] text-slate-600">{t("pages.onboardingPage.onboarding", { ns: "dashboard" })}</p>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">{t("pages.onboardingPage.h1", { ns: "dashboard" })}</h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-600">{t("pages.onboardingPage.sub", { ns: "dashboard" })}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/signup"
                className="inline-flex rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >{t("pages.onboardingPage.createAccount", { ns: "dashboard" })}</Link>
              <Link
                href="/pricing"
                className="inline-flex rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              >{t("pages.onboardingPage.seePricing", { ns: "dashboard" })}</Link>
            </div>
            <p className="mt-6 text-xs text-slate-500" aria-live="polite">
              {t("pages.onboardingPage.loadingPreview", { ns: "dashboard" })}
            </p>
          </section>
        }
      />
    </>
  );
}
