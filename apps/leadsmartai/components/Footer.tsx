import Link from "next/link";
import { CookieSettingsLink } from "@/components/cookie-consent/CookieConsent";
import { RealtorBossLogo } from "@/components/brand/RealtorBossLogo";

/**
 * Public-only product links. Removed `/dashboard`, `/client/dashboard`,
 * and `/dashboard/automation` because they're auth-gated — landing on
 * a 401/redirect from a footer click feels broken to anyone not signed
 * in. The same complaint led to dropping `Sign in` / `Get started`
 * from the marketing landing footer; applying it consistently here.
 *
 * `/features` is the canonical destination for "what does LeadSmart
 * actually do?" — see app/features/page.tsx.
 */
/**
 * "Mobile App" entry was removed: it pointed to `/start-free`, which
 * exists only as a role-gated redirect parent (`/start-free/agent`,
 * `/start-free/loan-broker`) — the bare `/start-free` route 404s for
 * everyone. Restore once a public Mobile App marketing page exists.
 */
const productLinks = [
  { label: "Features", href: "/features" },
  { label: "Live demo", href: "/try-demo" },
  { label: "Integrations", href: "/integrations" },
  { label: "AI Deal Assistant", href: "/deal-assistant" },
  { label: "AI CMA Analyzer", href: "/ai-cma-analyzer" },
];

const companyLinks = [
  { label: "About", href: "/about" },
  { label: "Pricing", href: "/pricing" },
  { label: "Contact", href: "/contact" },
  { label: "Blog", href: "/blog" },
  { label: "Help center", href: "/help" },
  { label: "Switch your CRM", href: "/switch-from" },
];

const resourceLinks = [
  { label: "All free tools", href: "/free-tools" },
  { label: "Mortgage Calculator", href: "/mortgage-calculator" },
  { label: "Cap Rate Calculator", href: "/cap-rate-calculator" },
  { label: "Cash Flow Calculator", href: "/cash-flow-calculator" },
  { label: "ROI Calculator", href: "/roi-calculator" },
  { label: "Home Value Estimator", href: "/home-value-estimator" },
];

const legalLinks = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
];

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200/80 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl px-6 py-12 lg:py-16">
        {/* Main grid */}
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Product */}
          <div>
            <h3 className="text-sm font-semibold tracking-wide text-slate-900 dark:text-white">
              Product
            </h3>
            <ul className="mt-4 space-y-2.5">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-slate-500 transition-colors hover:text-[#0072ce] dark:text-slate-400 dark:hover:text-[#4da3e8]"
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
                    className="text-sm text-slate-500 transition-colors hover:text-[#0072ce] dark:text-slate-400 dark:hover:text-[#4da3e8]"
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
                    className="text-sm text-slate-500 transition-colors hover:text-[#0072ce] dark:text-slate-400 dark:hover:text-[#4da3e8]"
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
                    className="text-sm text-slate-500 transition-colors hover:text-[#0072ce] dark:text-slate-400 dark:hover:text-[#4da3e8]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-200/80 pt-8 sm:flex-row dark:border-slate-800">
          {/* Brand — single horizontal lockup (TOM MN-002: the previous
              monogram-box + separate wordmark read as two logos). */}
          <Link href="/" aria-label="RealtorBoss home" className="inline-flex">
            <RealtorBossLogo />
          </Link>

          <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
            <CookieSettingsLink className="hover:text-[#0072ce] hover:underline dark:hover:text-[#4da3e8]" />
            <span>
              &copy; {new Date().getFullYear()} RealtorBoss (formerly LeadSmart AI). All rights reserved.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
