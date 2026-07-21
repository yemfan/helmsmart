"use client";

import Link from "next/link";

/** @deprecated Replaced by `@repo/ui` `PremiumSidebar` + `leadSmartMarketingNav`. Not mounted. */
export default function Sidebar() {
  return (
    <aside className="relative min-h-screen w-64 border-r bg-white p-6 shadow-sm">
      {/* Logo */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">CloseBoss</h1>
        <p className="text-sm text-gray-500">Real Estate AI Platform</p>
      </div>

      {/* Navigation */}
      <nav className="space-y-2">
        <Link href="/" className="block rounded-lg px-3 py-2 hover:bg-gray-100">
          Home
        </Link>

        <Link href="/mortgage-calculator" className="block rounded-lg px-3 py-2 hover:bg-gray-100">
          Mortgage Calculator
        </Link>

        <Link href="/refinance-calculator" className="block rounded-lg px-3 py-2 hover:bg-gray-100">
          Refinance Calculator
        </Link>

        <Link href="/affordability-calculator" className="block rounded-lg px-3 py-2 hover:bg-gray-100">
          Affordability Calculator
        </Link>

        <Link href="/rent-vs-buy-calculator" className="block rounded-lg px-3 py-2 hover:bg-gray-100">
          Rent vs Buy Calculator
        </Link>

        <Link href="/closing-cost-estimator" className="block rounded-lg px-3 py-2 hover:bg-gray-100">
          Closing Cost Estimator
        </Link>

        <Link href="/property-investment-analyzer" className="block rounded-lg px-3 py-2 hover:bg-gray-100">
          Property Investment Analyzer
        </Link>

        <Link href="/rental-property-analyzer" className="block rounded-lg px-3 py-2 hover:bg-gray-100">
          Rental Property Analyzer
        </Link>

        <Link href="/ai-real-estate-deal-analyzer" className="block rounded-lg px-3 py-2 hover:bg-gray-100">
          AI Deal Analyzer
        </Link>

        <Link href="/ai-cma-analyzer" className="block rounded-lg px-3 py-2 hover:bg-gray-100">
          AI CMA Analyzer
        </Link>

        <Link href="/down-payment-calculator" className="block rounded-lg px-3 py-2 hover:bg-gray-100">
          Down Payment Calculator
        </Link>

        <Link href="/cash-flow-calculator" className="block rounded-lg px-3 py-2 hover:bg-gray-100">
          Cash Flow Calculator
        </Link>

        <Link href="/home-value-estimator" className="block rounded-lg px-3 py-2 hover:bg-gray-100">
          Home Value Estimator
        </Link>

        <Link href="/cap-rate-calculator" className="block rounded-lg px-3 py-2 hover:bg-gray-100">
          Cap Rate & ROI Calculator
        </Link>

        <Link href="/property-report" className="block rounded-lg px-3 py-2 hover:bg-gray-100">
          Property Report Generator
        </Link>

        <Link href="/ai-zillow-redfin-link-analyzer" className="block rounded-lg px-3 py-2 hover:bg-gray-100">
          AI Zillow / Redfin Link Analyzer
        </Link>

        <Link href="/smart-cma-builder" className="block rounded-lg px-3 py-2 hover:bg-gray-100">
          Smart CMA Builder
        </Link>

        <Link href="/agent-home-value-leads" className="block rounded-lg px-3 py-2 hover:bg-gray-100">
          Home Value Leads
        </Link>

        <Link
          href="/dashboard/comparison-report"
          prefetch={false}
          className="block rounded-lg px-3 py-2 hover:bg-gray-100"
        >
          AI Comparison Report
        </Link>
      </nav>

      {/* Footer */}
      <div className="absolute bottom-6 text-xs text-gray-400">© 2026 CloseBoss</div>
    </aside>
  );
}
