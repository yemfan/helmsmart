import Link from "next/link";
import PropertyToolsLogo from "@/components/brand/PropertyToolsLogo";

// LeadSmart AI was renamed to CloseBoss (leadsmart-ai.com is retired / 404).
// Use a dedicated env var so a stale NEXT_PUBLIC_LEADSMART_URL can't repoint us
// back at the dead domain; default to the live CloseBoss host.
const CLOSEBOSS_URL = process.env.NEXT_PUBLIC_CLOSEBOSS_URL?.trim() || "https://www.closebossai.com";

const productLinks = [
  { label: "Mortgage Calculator", href: "/mortgage-calculator" },
  { label: "Home Value Estimator", href: "/home-value" },
  { label: "Cap Rate Calculator", href: "/cap-rate-calculator" },
  { label: "Affordability Calculator", href: "/affordability-calculator" },
  { label: "AI Deal Analyzer", href: "/ai-real-estate-deal-analyzer" },
  { label: "AI CMA Analyzer", href: "/ai-cma-analyzer" },
];

const companyLinks = [
  { label: "About", href: "/about" },
  { label: "Pricing", href: "/pricing" },
  { label: "Contact", href: "/contact" },
  { label: "Blog", href: "/blog" },
];

const resourceLinks = [
  { label: "Refinance Calculator", href: "/refinance-calculator" },
  { label: "Down Payment Calculator", href: "/down-payment-calculator" },
  { label: "Cash Flow Calculator", href: "/cash-flow-calculator" },
  { label: "ROI Calculator", href: "/roi-calculator" },
  { label: "Rent vs Buy", href: "/rent-vs-buy" },
  { label: "Closing Cost Estimator", href: "/closing-cost-estimator" },
];

const legalLinks = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Cookie Policy", href: "/privacy#cookies" },
  { label: "Do Not Sell My Info", href: "/privacy#ccpa" },
];

// Sibling businesses under MAXY Investment — cross-promoted in every footer.
// This app is Property Tools AI, so it links to the other three.
const PARTNERS = [
  { label: "HelmSmart", blurb: "AI operating system for business", href: "https://helmsmart.ai" },
  { label: "CloseBoss", blurb: "Your AI real estate team", href: "https://www.closebossai.com" },
  { label: "MarketingBoss", blurb: "AI marketing creative", href: "https://marketingbossai.com" },
];

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200/80 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl px-6 py-12 lg:py-16">
        {/* Main grid */}
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          {/* Product */}
          <div>
            <h3 className="text-sm font-semibold tracking-wide text-slate-900 dark:text-white">
              Tools
            </h3>
            <ul className="mt-4 space-y-2.5">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-slate-600 transition-colors hover:text-[#0072ce] dark:text-slate-400 dark:hover:text-[#4da3e8]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-sm font-semibold tracking-wide text-slate-900 dark:text-white">
              Company
            </h3>
            <ul className="mt-4 space-y-2.5">
              {companyLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-slate-600 transition-colors hover:text-[#0072ce] dark:text-slate-400 dark:hover:text-[#4da3e8]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="text-sm font-semibold tracking-wide text-slate-900 dark:text-white">
              Resources
            </h3>
            <ul className="mt-4 space-y-2.5">
              {resourceLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-slate-600 transition-colors hover:text-[#0072ce] dark:text-slate-400 dark:hover:text-[#4da3e8]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-sm font-semibold tracking-wide text-slate-900 dark:text-white">
              Legal
            </h3>
            <ul className="mt-4 space-y-2.5">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-slate-600 transition-colors hover:text-[#0072ce] dark:text-slate-400 dark:hover:text-[#4da3e8]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* For Agents — LeadSmart cross-promo. Demoted here from a hero-
              sized mid-page section per validation report UX-05 (the consumer
              homepage shouldn't route consumers to the agent product as a
              primary CTA). External link to a separate domain. */}
          <div>
            <h3 className="text-sm font-semibold tracking-wide text-slate-900 dark:text-white">
              For Agents
            </h3>
            <ul className="mt-4 space-y-2.5">
              <li>
                <a
                  href={CLOSEBOSS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-600 transition-colors hover:text-[#0072ce] dark:text-slate-400 dark:hover:text-[#4da3e8]"
                >
                  CloseBoss
                </a>
              </li>
              <li>
                <a
                  href={`${CLOSEBOSS_URL}/pricing`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-600 transition-colors hover:text-[#0072ce] dark:text-slate-400 dark:hover:text-[#4da3e8]"
                >
                  Pricing for agents
                </a>
              </li>
              <li>
                <a
                  href={`${CLOSEBOSS_URL}/signup`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-600 transition-colors hover:text-[#0072ce] dark:text-slate-400 dark:hover:text-[#4da3e8]"
                >
                  Sign up as an agent
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Business partners — our sibling products */}
        <div className="mt-10 border-t border-slate-200/80 pt-6 dark:border-slate-800">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Business partners
          </h3>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {PARTNERS.map((p) => (
              <li key={p.href}>
                <a
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-600 transition-colors hover:text-[#0072ce] dark:text-slate-400 dark:hover:text-[#4da3e8]"
                >
                  {p.label} <span className="text-slate-400 dark:text-slate-500">· {p.blurb}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-slate-200/80 pt-8 sm:flex-row dark:border-slate-800">
          {/* Brand — single horizontal lockup (TOM BF-021: the previous
              "PT" monogram stacked with the wordmark read as two logos).
              Tagline moved next to the lockup as a single visual unit. */}
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="PropertyTools AI home" className="inline-flex">
              <PropertyToolsLogo compact />
            </Link>
            <span className="hidden text-xs text-slate-500 sm:inline dark:text-slate-400">
              Smarter real estate decisions, powered by AI.
            </span>
          </div>

          {/* Legal-entity attribution. Naming the operating company +
              registered address on every page lets carriers / trust vendors
              verify the PropertyTools AI ↔ propertytoolsai.com association
              from the homepage (mirrors Privacy/Terms). */}
          <p className="text-sm text-slate-600 sm:text-right dark:text-slate-400">
            &copy; {new Date().getFullYear()} MAXY Investment Inc. All rights reserved.
            <br />
            <span className="text-xs text-slate-500 dark:text-slate-500">
              PropertyTools AI is a service of MAXY Investment Inc. &middot;{" "}
              6511 Parkriver Crossing, Sugar Land, TX 77479
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}
