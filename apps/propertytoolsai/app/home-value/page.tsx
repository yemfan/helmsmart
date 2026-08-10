import type { Metadata } from "next";
import Link from "next/link";
import HomeValueEstimatePage from "@/components/home-value/HomeValueEstimatePage";
import JsonLd from "@/components/JsonLd";

export const metadata: Metadata = {
  title: "Free Home Value Estimate",
  description:
    "Get a free AI-powered home value estimate with confidence range and comparable sales data instantly.",
  keywords: [
    "home value estimate",
    "home valuation",
    "property value",
    "home appraisal",
    "house value",
  ],
  openGraph: {
    title: "Free Home Value Estimate | PropertyTools AI",
    description: "Get a free AI-powered home value estimate with confidence range and comparable sales data instantly.",
    type: "website",
  },
};

export default function HomeValuePage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Free Home Value Estimator",
          applicationCategory: "FinanceApplication",
          operatingSystem: "Web",
          browserRequirements: "Requires JavaScript",
          url: "https://propertytoolsai.com/home-value",
          description:
            "Get a free AI-powered home value estimate with a confidence range and comparable sales — instantly, no agent required.",
          featureList: "Instant home value estimate, Confidence range, Comparable sales data, No sign-up required",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          provider: { "@type": "Organization", name: "PropertyTools AI", url: "https://propertytoolsai.com" },
        }}
      />
      {/* Trust / methodology link — per validation report UX-02. A persistent
          "How we calculate this" affordance needs to surface on every estimate;
          this banner is the first-touch version until the estimate component
          itself gets a per-result link. */}
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-center text-sm text-slate-600">
        <Link
          href="/methodology"
          className="font-medium text-[#0072ce] hover:text-[#005ca8] hover:underline"
        >
          How we calculate this estimate →
        </Link>
        <span className="ml-2 hidden text-slate-500 sm:inline">
          Data sources, accuracy, and known limits.
        </span>
      </div>
      {/* No Suspense here on purpose: the `useSearchParams()` call that
          seeds the address input lives in a null-rendering child with its
          own boundary inside HomeValueEstimatePage, so the hero/input/tool
          markup statically prerenders. Wrapping the whole tool at this
          level made the entire page client-render after hydration —
          footer shoved down, CLS ~0.32, failing the Lighthouse CI gate. */}
      <HomeValueEstimatePage />
    </>
  );
}
