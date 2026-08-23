import DelayedLeadCapture from "@/components/DelayedLeadCapture";
import LocalSeoLeadForm from "@/components/LocalSeoLeadForm";
import TrafficTracker from "@/components/TrafficTracker";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.landingHomeValue.title", { ns: "web_marketing" });
  const description = t("routeMeta.landingHomeValue.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["home value estimate", "home worth", "property value", "selling strategy"],
};
}

export default async function HomeValueLandingPage() {
  const t = await getServerT();
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <TrafficTracker pagePath="/landing/home-value" source="paid_home_value" />
      <section className="rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-50 p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">{t("pages.campaignLandings.paidLanding", { ns: "dashboard" })}</p>
        <h1 className="mt-2 text-4xl font-extrabold text-slate-900">{t("pages.campaignLandings.hvTitle", { ns: "dashboard" })}</h1>
        <p className="mt-3 max-w-2xl text-slate-700">{t("pages.campaignLandings.hvSub", { ns: "dashboard" })}</p>
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">{t("pages.campaignLandings.hvWhy", { ns: "dashboard" })}</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-700">
            <li>{t("pages.campaignLandings.hvB1", { ns: "dashboard" })}</li>
            <li>{t("pages.campaignLandings.hvB2", { ns: "dashboard" })}</li>
            <li>{t("pages.campaignLandings.hvB3", { ns: "dashboard" })}</li>
          </ul>
        </div>
        <LocalSeoLeadForm title={t("pages.campaignLandings.hvFormAria", { ns: "dashboard" })} source="paid_home_value" />
      </section>

      <DelayedLeadCapture delayMs={10000} title={t("pages.campaignLandings.hvUnlockAria", { ns: "dashboard" })} source="paid_home_value" />
    </main>
  );
}

