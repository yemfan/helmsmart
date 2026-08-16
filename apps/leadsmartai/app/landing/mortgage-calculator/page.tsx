import DelayedLeadCapture from "@/components/DelayedLeadCapture";
import LocalSeoLeadForm from "@/components/LocalSeoLeadForm";
import TrafficTracker from "@/components/TrafficTracker";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Mortgage Payment Estimator",
  description: "Estimate your monthly mortgage payment and buying power with personalized lender-ready next steps.",
  keywords: ["mortgage calculator", "monthly payment", "buying power", "mortgage estimator"],
};

export default async function MortgageLandingPage() {
  const t = await getServerT();
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <TrafficTracker pagePath="/landing/mortgage-calculator" source="paid_mortgage_calc" />
      <section className="rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-50 p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Paid campaign landing</p>
        <h1 className="mt-2 text-4xl font-extrabold text-slate-900">
          Estimate your payment and buying power in minutes
        </h1>
        <p className="mt-3 max-w-2xl text-slate-700">
          Compare monthly payment scenarios and get personalized lender-ready next steps.
        </p>
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">What you get</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-700">
            <li>Scenario-based payment estimate</li>
            <li>Rate sensitivity summary</li>
            <li>Action plan to qualify faster</li>
          </ul>
        </div>
        <LocalSeoLeadForm title="Get My Mortgage Scenario" source="paid_mortgage_calc" />
      </section>

      <DelayedLeadCapture
        delayMs={9000}
        title="Get your customized mortgage follow-up"
        source="paid_mortgage_calc"
      />
    </main>
  );
}

