import Link from "next/link";
import { getPropertyToolsConsumerPostLoginUrl } from "@/lib/propertyToolsConsumerUrl";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tools",
  description: "Access calculators, analyzers, and AI-powered tools.",
  keywords: ["tools", "calculators", "AI tools"],
  robots: { index: false },
};

const tools = [
  { href: "/dashboard/seller-presentation", label: "Seller Presentation Generator" },
  { href: getPropertyToolsConsumerPostLoginUrl(), label: "PropertyTools app (buyer / seller)" },
  { href: "/deal-assistant", label: "AI Deal Closer" },
  { href: "/home-value-estimator", label: "Home Value Estimator" },
  { href: "/smart-cma-builder", label: "Smart CMA Builder" },
  { href: "/rental-property-analyzer", label: "Rental Property Analyzer" },
  { href: "/ai-zillow-redfin-link-analyzer", label: "Zillow / Redfin Link Analyzer" },
  { href: "/mortgage-calculator", label: "Mortgage Calculator" },
  { href: "/refinance-calculator", label: "Refinance Calculator" },
  { href: "/affordability-calculator", label: "Home Affordability Calculator" },
  { href: "/rent-vs-buy-calculator", label: "Rent vs Buy Calculator" },
  { href: "/closing-cost-estimator", label: "Closing Cost Estimator" },
  { href: "/property-investment-analyzer", label: "Property Investment Analyzer" },
  { href: "/ai-real-estate-deal-analyzer", label: "AI Deal Analyzer" },
  { href: "/ai-cma-analyzer", label: "AI CMA Analyzer" },
  { href: "/down-payment-calculator", label: "Down Payment Calculator" },
  { href: "/cash-flow-calculator", label: "Cash Flow Calculator" },
  { href: "/cap-rate-calculator", label: "Cap Rate & ROI Calculator" },
  { href: "/property-report", label: "Property Report Generator" },
];

export default function ToolsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="ui-page-title text-brand-text">Tools</h1>
        <p className="ui-page-subtitle text-brand-text/80">All CloseBoss tools in one place.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tools.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="rounded-xl border border-gray-200 bg-brand-surface hover:bg-white hover:border-brand-primary/40 p-4 transition-colors"
            >
              <div className="ui-card-title text-brand-text">{t.label}</div>
              <div className="mt-2 text-xs font-semibold text-brand-primary">Open →</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

