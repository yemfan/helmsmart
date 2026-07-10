"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import { CookieSettingsLink } from "@/components/cookie-consent/CookieConsent";
import { RealtyBossLogo } from "@/components/brand/RealtyBossLogo";

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

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-200/80 pt-8 sm:flex-row dark:border-slate-800">
          {/* Brand — single horizontal lockup (TOM MN-002: the previous
              monogram-box + separate wordmark read as two logos). */}
          <Link href="/" aria-label="RealtyBoss home" className="inline-flex">
            <RealtyBossLogo />
          </Link>

          <div className="flex flex-col items-center gap-1.5 text-xs text-slate-400 sm:items-end dark:text-slate-500">
            <CookieSettingsLink className="hover:text-[#0072ce] hover:underline dark:hover:text-[#4da3e8]" />
            <span>
              &copy; {new Date().getFullYear()} MAXY Investment Inc.{" "}
              {t("footer.rights", { defaultValue: "All rights reserved." })}
            </span>
            {/* Legal-entity attribution. Surfacing the operating company +
                registered address on every page (not just /privacy + /terms)
                lets carriers / trust vendors verify the business-name ↔
                realtybossai.com association from the homepage. */}
            <span className="text-center sm:text-right">
              {t("footer.entity_line", {
                defaultValue: "RealtyBoss (formerly LeadSmart AI) is a product of MAXY Investment Inc.",
              })}{" "}
              &middot; 6511 Parkriver Crossing, Sugar Land, TX 77479
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
