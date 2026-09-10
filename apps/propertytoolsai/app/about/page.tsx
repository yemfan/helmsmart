import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import JsonLd from "@/components/JsonLd";

export const metadata: Metadata = {
  title: "About PropertyTools AI",
  description:
    "Learn how PropertyTools AI empowers home buyers, sellers, and investors with intelligent real estate tools and insights.",
  alternates: {
    canonical: "/about",
  },
  keywords: [
    "about PropertyTools AI",
    "real estate tools",
    "property valuation",
    "investment analysis",
    "home buying tools",
  ],
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "PropertyTools AI",
          description:
            "PropertyTools AI empowers home buyers, sellers, and investors with intelligent real estate tools and insights. Our platform provides instant property valuations, financing analysis, and AI-powered property comparisons.",
          url: "https://propertytoolsai.com",
          logo: "https://propertytoolsai.com/logo.png",
          sameAs: [
            "https://twitter.com/propertytoolsai",
            "https://linkedin.com/company/propertytoolsai",
          ],
          contactPoint: {
            "@type": "ContactPoint",
            url: "https://propertytoolsai.com/contact",
            contactType: "Customer Service",
          },
        }}
      />
      {/* Hero */}
      <section className="px-6 py-20 text-center md:py-28">
        <div className="mx-auto max-w-4xl">
          <p className="mb-4 inline-flex rounded-full border border-slate-200/90 bg-slate-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.15em] text-slate-600 ring-1 ring-slate-900/[0.03]">
            About PropertyTools AI
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
            Smarter Tools for Smarter Real Estate Decisions
          </h1>

          <p className="mt-6 text-lg leading-relaxed text-slate-600 md:text-xl">
            PropertyTools AI helps you understand property value, financing, and investment potential — instantly.
          </p>
        </div>
      </section>

      {/* Intro */}
      <section className="border-t border-slate-100 px-6 py-16">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-lg leading-relaxed text-slate-700">
            Buying, selling, or investing in real estate can feel overwhelming. Information is scattered, tools are complicated, and
            decisions carry significant financial impact.
          </p>

          <p className="mt-6 text-lg leading-relaxed text-slate-700">
            PropertyTools AI was built to simplify that process — by giving you fast, intelligent tools that turn complex data into
            clear insights.
          </p>
        </div>
      </section>

      {/* What we do */}
      <section className="bg-slate-50/80 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">What We Do</h2>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm ring-1 ring-slate-900/[0.03]">
              <h3 className="text-lg font-semibold tracking-tight">Instant Property Insights</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Estimate home value, analyze market trends, and understand pricing instantly — without waiting or guesswork.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm ring-1 ring-slate-900/[0.03]">
              <h3 className="text-lg font-semibold tracking-tight">Smarter Financial Decisions</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Evaluate affordability, mortgage scenarios, and refinancing options with tools designed for clarity and speed.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm ring-1 ring-slate-900/[0.03]">
              <h3 className="text-lg font-semibold tracking-tight">AI-Powered Comparisons</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Compare properties, identify better opportunities, and discover insights that go beyond basic listings.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">The Problem We Solve</h2>

          <div className="mt-10 space-y-6 text-lg text-slate-700">
            <p>
              Most people rely on fragmented information when making real estate decisions — browsing listings, searching calculators,
              and trying to piece everything together.
            </p>

            <p>This leads to uncertainty, missed opportunities, and costly mistakes.</p>

            <p className="font-medium text-slate-900">PropertyTools AI replaces confusion with clarity.</p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-slate-50/80 px-6 py-20">
        <div className="mx-auto max-w-6xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">How It Works</h2>

          <div className="mt-12 grid gap-6 text-sm md:grid-cols-5">
            {["Enter Property", "Analyze Value", "Explore Financing", "Compare Options", "Make Decisions"].map((step, i) => (
              <div
                key={step}
                className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-900/[0.02]"
              >
                <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Step {i + 1}</div>
                <div className="mt-2 font-semibold text-slate-900">{step}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Difference */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Why PropertyTools AI Is Different</h2>

          <div className="mt-10 space-y-6 text-lg text-slate-700">
            <p>
              Most platforms give you data.
              <br />
              We give you direction.
            </p>

            <p>
              Instead of overwhelming you with numbers, PropertyTools AI helps you understand what those numbers actually mean — and
              what to do next.
            </p>

            <p className="font-medium text-slate-900">Every tool is designed to guide your next step.</p>
          </div>
        </div>
      </section>

      {/* Ecosystem */}
      <section className="bg-slate-900 px-6 py-20 text-white">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Part of a Smarter Real Estate Ecosystem</h2>

          <p className="mt-6 leading-relaxed text-slate-300">
            PropertyTools AI connects seamlessly with CloseBoss — enabling a smarter flow from user insights to real-world
            transactions.
          </p>

          <div className="mt-10 text-sm font-medium tracking-wide text-slate-400">
            Traffic → Insights → Qualified Leads → Agent Action → Closed Deals
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24 text-center">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Make Better Real Estate Decisions — Faster</h2>

        <p className="mt-4 text-slate-600">Start using PropertyTools AI and turn data into confidence.</p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Button href="/home-value" size="lg">
            Try Home Value Tool
          </Button>
          <Button href="/mortgage-calculator" variant="outline" size="lg">
            Explore Tools
          </Button>
        </div>

        <p className="mt-10">
          <Link href="/" className="text-sm font-medium text-[#0072ce] hover:text-[#005ca8]">
            ← Back to home
          </Link>
        </p>
      </section>
    </div>
  );
}
