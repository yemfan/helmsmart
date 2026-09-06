import Link from "next/link";
import { getPropertyToolsConsumerPostLoginUrl } from "@/lib/propertyToolsConsumerUrl";
import { getServerT } from "@/lib/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("dashboard");
  const title = t("pages.dashboardTitles.tools", { ns: "dashboard" });
  return {

  title,

  description: "Access calculators, analyzers, and AI-powered tools.",

  keywords: ["tools", "calculators", "AI tools"],

  robots: { index: false },

};
}

/** `key` indexes `dashboard:more.tools.items.*`; the label resolves at render. */
const tools = [
  { href: "/dashboard/seller-presentation", key: "sellerPresentation" },
  { href: getPropertyToolsConsumerPostLoginUrl(), key: "propertyToolsApp" },
  { href: "/deal-assistant", key: "dealCloser" },
  { href: "/home-value-estimator", key: "homeValue" },
  { href: "/smart-cma-builder", key: "smartCma" },
  { href: "/rental-property-analyzer", key: "rentalAnalyzer" },
  { href: "/ai-zillow-redfin-link-analyzer", key: "linkAnalyzer" },
  { href: "/mortgage-calculator", key: "mortgage" },
  { href: "/refinance-calculator", key: "refinance" },
  { href: "/affordability-calculator", key: "affordability" },
  { href: "/rent-vs-buy-calculator", key: "rentVsBuy" },
  { href: "/closing-cost-estimator", key: "closingCost" },
  { href: "/property-investment-analyzer", key: "investmentAnalyzer" },
  { href: "/ai-real-estate-deal-analyzer", key: "dealAnalyzer" },
  { href: "/ai-cma-analyzer", key: "cmaAnalyzer" },
  { href: "/down-payment-calculator", key: "downPayment" },
  { href: "/cash-flow-calculator", key: "cashFlow" },
  { href: "/cap-rate-calculator", key: "capRate" },
  { href: "/property-report", key: "propertyReport" },
];

export default async function ToolsPage() {
  const serverT = await getServerT("dashboard");
  const tr = (key: string) => serverT(key, { ns: "dashboard" });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="ui-page-title text-brand-text">{tr("more.tools.title")}</h1>
        <p className="ui-page-subtitle text-brand-text/80">{tr("more.tools.subtitle")}</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tools.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="rounded-xl border border-slate-200 bg-brand-surface hover:bg-white hover:border-brand-primary/40 p-4 transition-colors"
            >
              <div className="ui-card-title text-brand-text">{tr(`more.tools.items.${t.key}`)}</div>
              <div className="mt-2 text-xs font-semibold text-brand-primary">{tr("more.tools.open")}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
