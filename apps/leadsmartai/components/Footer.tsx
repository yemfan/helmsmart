"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import { CookieSettingsLink } from "@/components/cookie-consent/CookieConsent";
import { CloseBossLogo } from "@/components/brand/CloseBossLogo";

/**
 * Public-only product links. Removed `/dashboard`, `/client/dashboard`,
 * and `/dashboard/automation` because they're auth-gated — landing on
 * a 401/redirect from a footer click feels broken to anyone not signed
 * in. Labels resolve through the `web_marketing` bundle (`link.*` shared
 * with the top nav; `footer.*` for column headers + legal).
 */
const productLinks = [
  { key: "link.features", en: "Features", href: "/features" },
  { key: "link.live_demo", en: "Live demo", href: "/try-demo" },
  { key: "link.integrations", en: "Integrations", href: "/integrations" },
  { key: "link.ai_deal_assistant", en: "AI Deal Assistant", href: "/deal-assistant" },
  { key: "link.ai_cma_analyzer", en: "AI CMA Analyzer", href: "/ai-cma-analyzer" },
];

const companyLinks = [
  { key: "link.about", en: "About", href: "/about" },
  { key: "link.pricing", en: "Pricing", href: "/pricing" },
  { key: "link.contact", en: "Contact", href: "/contact" },
  { key: "link.blog", en: "Blog", href: "/blog" },
  { key: "link.help_center", en: "Help center", href: "/help" },
  { key: "link.switch_your_crm", en: "Switch your CRM", href: "/switch-from" },
];

const resourceLinks = [
  { key: "link.all_free_tools", en: "All free tools", href: "/free-tools" },
  { key: "link.mortgage_calculator", en: "Mortgage Calculator", href: "/mortgage-calculator" },
  { key: "link.cap_rate_calculator", en: "Cap Rate Calculator", href: "/cap-rate-calculator" },
  { key: "link.cash_flow_calculator", en: "Cash Flow Calculator", href: "/cash-flow-calculator" },
  { key: "link.roi_calculator", en: "ROI Calculator", href: "/roi-calculator" },
  { key: "link.home_value_estimator", en: "Home Value Estimator", href: "/home-value-estimator" },
];

const legalLinks = [
  { key: "link.privacy_policy", en: "Privacy Policy", href: "/privacy" },
  { key: "link.terms_of_service", en: "Terms of Service", href: "/terms" },
];

// Sibling businesses under MAXY Investment — cross-promoted in every footer.
// This app is CloseBoss, so it links to the other three.
const PARTNERS = [
  // Names stay; only the one-line description is copy.
  { label: "Property Tools AI", key: "propertyToolsAi", href: "https://www.propertytoolsai.com" },
  { label: "HelmSmart", key: "helmsmart", href: "https://helmsmart.ai" },
  { label: "MarketingBoss", key: "marketingboss", href: "https://marketingbossai.com" },
];

type FooterLink = { key: string; en: string; href: string };

export default function Footer() {
  const { t } = useTranslation("web_marketing");

  const column = (headingKey: string, headingEn: string, links: FooterLink[]) => (
    <div>
      <h3 className="text-sm font-semibold tracking-wide text-slate-900 dark:text-white">
        {t(headingKey, { defaultValue: headingEn })}
      </h3>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-slate-500 transition-colors hover:text-[#0072ce] dark:text-slate-400 dark:hover:text-[#4da3e8]"
            >
              {t(link.key, { defaultValue: link.en })}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <footer className="mt-16 border-t border-slate-200/80 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl px-6 py-12 lg:py-16">
        {/* Main grid */}
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {column("footer.product", "Product", productLinks)}
          {column("footer.company", "Company", companyLinks)}
          {column("footer.resources", "Resources", resourceLinks)}
          {column("footer.legal", "Legal", legalLinks)}
        </div>

        {/* Business partners — our sibling products */}
        <div className="mt-10 border-t border-slate-200/80 pt-6 dark:border-slate-800">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t("footer.partners", { defaultValue: "Business partners" })}
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
                  {p.label} <span className="text-slate-400 dark:text-slate-500">· {t(`footer.partnerBlurbs.${p.key}`)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-200/80 pt-8 sm:flex-row dark:border-slate-800">
          {/* Brand — single horizontal lockup (TOM MN-002: the previous
              monogram-box + separate wordmark read as two logos). */}
          <div className="flex items-center gap-4">
            <Link href="/" aria-label={t("aria.home")} className="inline-flex">
              <CloseBossLogo />
            </Link>
            <a
              href="https://www.linkedin.com/company/maxy-investment/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("aria.linkedin")}
              className="text-slate-400 transition-colors hover:text-[#0072ce] dark:text-slate-500 dark:hover:text-[#4da3e8]"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
              </svg>
            </a>
          </div>

          <div className="flex flex-col items-center gap-1.5 text-xs text-slate-400 sm:items-end dark:text-slate-500">
            <CookieSettingsLink className="hover:text-[#0072ce] hover:underline dark:hover:text-[#4da3e8]" />
            <span>
              &copy; {new Date().getFullYear()} MAXY Investment Inc.{" "}
              {t("footer.rights", { defaultValue: "All rights reserved." })}
            </span>
            {/* Legal-entity attribution. Surfacing the operating company +
                registered address on every page (not just /privacy + /terms)
                lets carriers / trust vendors verify the business-name ↔
                closebossai.com association from the homepage. */}
            <span className="text-center sm:text-right">
              {t("footer.entity_line", {
                defaultValue: "CloseBoss (formerly LeadSmart AI) is a product of MAXY Investment Inc.",
              })}{" "}
              &middot; 6511 Parkriver Crossing, Sugar Land, TX 77479
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
