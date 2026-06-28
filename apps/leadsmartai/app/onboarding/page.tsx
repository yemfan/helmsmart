import type { Metadata } from "next";
import Link from "next/link";
import OnboardingFunnel from "@/components/onboarding/OnboardingFunnel";

export const metadata: Metadata = {
  title: "Get started — RealtyBoss",
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
export default function OnboardingPage() {
  return (
    <>
      {/* Noscript fallback — fully static, no JS required. */}
      <noscript>
        <div className="mx-auto max-w-2xl px-4 py-16">
          <h1 className="text-3xl font-bold text-slate-900 mb-4">Get started with RealtyBoss</h1>
          <p className="text-slate-700 leading-relaxed mb-4">
            Our interactive onboarding tour requires JavaScript. To continue without JavaScript,
            you can create an account directly and skip the preview.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="inline-flex rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Create account
            </Link>
            <Link
              href="/pricing"
              className="inline-flex rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              See pricing
            </Link>
          </div>
          <p className="mt-6 text-xs text-slate-500">
            Questions?{" "}
            <a href="mailto:contact@realtybossai.com" className="text-blue-700 underline">
              contact@realtybossai.com
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
            <p className="mb-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.15em] text-slate-600">
              Onboarding
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
              Get your first AI-qualified leads in 10 minutes.
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-600">
              Tell us your market, preview AI-qualified leads for your area, then unlock full CRM
              and automation. No credit card required for the preview.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/signup"
                className="inline-flex rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Create account
              </Link>
              <Link
                href="/pricing"
                className="inline-flex rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              >
                See pricing
              </Link>
            </div>
            <p className="mt-6 text-xs text-slate-500" aria-live="polite">
              Loading interactive preview…
            </p>
          </section>
        }
      />
    </>
  );
}
