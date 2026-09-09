"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { useTranslation } from "react-i18next";

export default function HowCapRateChangesInDifferentMarketsPage() {
  const { t } = useTranslation("dashboard");
  const title = "How Cap Rate Changes in Different Markets";
  const url = "https://closebossai.com/how-cap-rate-changes-in-different-markets";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": ["Article", "FAQPage"],
          headline: title,
          url,
          description:
            "Understand how and why cap rates change across different real estate markets and cycles, and what that means for investors.",
          mainEntity: [
            {
              "@type": "Question",
              name: "Why do cap rates change between different markets?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Cap rates differ between markets because of variations in demand, supply, risk, growth expectations, and the amount of capital chasing deals in each area.",
              },
            },
            {
              "@type": "Question",
              name: "How do changing cap rates affect real estate investors?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "When cap rates compress, values rise for a given NOI; when cap rates expand, values fall. Investors need to monitor cap rate trends to time acquisitions, refinances, and sales.",
              },
            },
          ],
        }}
      />

      <Link
        href="/"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600 text-sm font-medium mb-6"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>{t("pages.articleChrome.backHome", { ns: "web_pages" })}</Link>

      <h1 className="text-3xl font-bold text-blue-600 mb-3">{title}</h1>
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.capRateMarkets.intro", { ns: "web_pages" })}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateMarkets.forces", { ns: "web_pages" })}</h2>
        <p>{t("pages.capRateMarkets.forcesBody", { ns: "web_pages" })}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="font-semibold">{t("pages.capRateMarkets.d1Label", { ns: "web_pages" })}</span>{t("pages.capRateMarkets.d1", { ns: "web_pages" })}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateMarkets.d2Label", { ns: "web_pages" })}</span>{t("pages.capRateMarkets.d2", { ns: "web_pages" })}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateMarkets.d3Label", { ns: "web_pages" })}</span>{t("pages.capRateMarkets.d3", { ns: "web_pages" })}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateMarkets.d4Label", { ns: "web_pages" })}</span>{t("pages.capRateMarkets.d4", { ns: "web_pages" })}</li>
        </ul>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateMarkets.cycle", { ns: "web_pages" })}</h2>
        <p>{t("pages.capRateMarkets.cycleBody", { ns: "web_pages" })}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="font-semibold">{t("pages.capRateMarkets.c1Label", { ns: "web_pages" })}</span>{t("pages.capRateMarkets.c1", { ns: "web_pages" })}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateMarkets.c2Label", { ns: "web_pages" })}</span>{t("pages.capRateMarkets.c2", { ns: "web_pages" })}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateMarkets.c3Label", { ns: "web_pages" })}</span>{t("pages.capRateMarkets.c3", { ns: "web_pages" })}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateMarkets.c4Label", { ns: "web_pages" })}</span>{t("pages.capRateMarkets.c4", { ns: "web_pages" })}</li>
        </ul>
        <p>{t("pages.capRateMarkets.cycleClose", { ns: "web_pages" })}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateMarkets.rates", { ns: "web_pages" })}</h2>
        <p>{t("pages.capRateMarkets.ratesBody", { ns: "web_pages" })}</p>
        <p>{t("pages.capRateMarkets.spread", { ns: "web_pages" })}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateMarkets.ownersVsBuyers", { ns: "web_pages" })}</h2>
        <p>{t("pages.capRateMarkets.ownersVsBuyersBody", { ns: "web_pages" })}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="font-semibold">{t("pages.capRateMarkets.o1Label", { ns: "web_pages" })}</span>{t("pages.capRateMarkets.o1", { ns: "web_pages" })}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateMarkets.o2Label", { ns: "web_pages" })}</span>{t("pages.capRateMarkets.o2", { ns: "web_pages" })}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateMarkets.o3Label", { ns: "web_pages" })}</span>{t("pages.capRateMarkets.o3", { ns: "web_pages" })}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateMarkets.o4Label", { ns: "web_pages" })}</span>{t("pages.capRateMarkets.o4", { ns: "web_pages" })}</li>
        </ul>
        <p>{t("pages.capRateMarkets.trackTrends", { ns: "web_pages" })}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateMarkets.monitor", { ns: "web_pages" })}</h2>
        <p>{t("pages.capRateMarkets.monitorBody", { ns: "web_pages" })}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.capRateMarkets.m1", { ns: "web_pages" })}</li>
          <li>{t("pages.capRateMarkets.m2", { ns: "web_pages" })}</li>
          <li>{t("pages.capRateMarkets.m3", { ns: "web_pages" })}</li>
          <li>{t("pages.dashFragments.usingThe")}{" "}
            <Link href="/cap-rate-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.capRateCalculator", { ns: "web_pages" })}</Link>{" "}{t("pages.dashFragments.analyzeNewListings")}</li>
        </ul>
        <p>{t("pages.capRateMarkets.monitorClose", { ns: "web_pages" })}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800 border-t border-gray-200 pt-6">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateMarkets.faqTitle", { ns: "web_pages" })}</h2>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateMarkets.q1", { ns: "web_pages" })}</h3>
        <p>{t("pages.capRateMarkets.a1", { ns: "web_pages" })}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateMarkets.q2", { ns: "web_pages" })}</h3>
        <p>{t("pages.capRateMarkets.a2", { ns: "web_pages" })}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateMarkets.q3", { ns: "web_pages" })}</h3>
        <p>{t("pages.capRateMarkets.a3", { ns: "web_pages" })}</p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.capRateMarkets.ctaTitle", { ns: "web_pages" })}</h2>
        <p className="mb-3">{t("pages.capRateMarkets.ctaBody", { ns: "web_pages" })}</p>
        <div className="flex flex-wrap gap-3 mb-4">
          <Link
            href="/cap-rate-calculator"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
          >{t("pages.articleChrome.openCapRate", { ns: "web_pages" })}</Link>
          <Link
            href="/property-investment-analyzer"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-white text-blue-600 border border-blue-200 hover:bg-blue-50"
          >{t("pages.articleChrome.openAnalyzer", { ns: "web_pages" })}</Link>
        </div>
        <p className="font-semibold">{t("pages.articleChrome.footerCta", { ns: "web_pages" })}</p>
      </section>
    </div>
  );
}

