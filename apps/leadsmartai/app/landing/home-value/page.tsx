import DelayedLeadCapture from "@/components/DelayedLeadCapture";
import LocalSeoLeadForm from "@/components/LocalSeoLeadForm";
import TrafficTracker from "@/components/TrafficTracker";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Free Home Value Estimate",
  description: "Get a fast home value estimate, local demand score, and custom selling strategy in under 2 minutes.",
  keywords: ["home value estimate", "home worth", "property value", "selling strategy"],
};

export default async function HomeValueLandingPage() {
  const t = await getServerT();
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <TrafficTracker pagePath="/landing/home-value" source="paid_home_value" />
      <section className="rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-50 p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Paid campaign landing</p>
        <h1 className="mt-2 text-4xl font-extrabold text-slate-900">
          What is your home really worth in today’s market?
        </h1>
        <p className="mt-3 max-w-2xl text-slate-700">
          Get a fast estimate, local demand score, and a custom selling strategy in under 2 minutes.
        </p>
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">Why homeowners use this report</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-700">
            <li>Localized value range with market context</li>
            <li>Seller timing recommendations</li>
            <li>Action plan to improve net proceeds</li>
          </ul>
        </div>
        <LocalSeoLeadForm title="Get My Home Value Report" source="paid_home_value" />
      </section>

      <DelayedLeadCapture delayMs={10000} title="Unlock your full valuation report" source="paid_home_value" />
    </main>
  );
}

