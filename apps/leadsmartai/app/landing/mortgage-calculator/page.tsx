import DelayedLeadCapture from "@/components/DelayedLeadCapture";
import LocalSeoLeadForm from "@/components/LocalSeoLeadForm";
import TrafficTracker from "@/components/TrafficTracker";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.landingMortgage.title", { ns: "web_marketing" });
  const description = t("routeMeta.landingMortgage.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["mortgage calculator", "monthly payment", "buying power", "mortgage estimator"],
};
}

export default async function MortgageLandingPage() {
  const t = await getServerT();
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <TrafficTracker pagePath="/landing/mortgage-calculator" source="paid_mortgage_calc" />
      <section className="rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-50 p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">{t("pages.campaignLandings.paidLanding", { ns: "dashboard" })}</p>
        <h1 className="mt-2 text-4xl font-extrabold text-slate-900">{t("pages.campaignLandings.mcTitle", { ns: "dashboard" })}</h1>
        <p className="mt-3 max-w-2xl text-slate-700">{t("pages.campaignLandings.mcSub", { ns: "dashboard" })}</p>
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">{t("pages.campaignLandings.mcWhat", { ns: "dashboard" })}</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-700">
            <li>{t("pages.campaignLandings.mcB1", { ns: "dashboard" })}</li>
            <li>{t("pages.campaignLandings.mcB2", { ns: "dashboard" })}</li>
            <li>{t("pages.campaignLandings.mcB3", { ns: "dashboard" })}</li>
          </ul>
        </div>
        <LocalSeoLeadForm title={t("pages.campaignLandings.mcFormAria", { ns: "dashboard" })} source="paid_mortgage_calc" />
      </section>

      <DelayedLeadCapture
        delayMs={9000}
        title={t("pages.campaignLandings.mcFollowUpAria", { ns: "dashboard" })}
        source="paid_mortgage_calc"
      />
    </main>
  );
}

