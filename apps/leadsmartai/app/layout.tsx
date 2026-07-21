import "./globals.css";
import { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import AuthProvider from "@/components/AuthProvider";
import AppShell from "@/components/AppShell";
import { CookieConsentProvider } from "@/components/cookie-consent/CookieConsent";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { ReferralCodeCapture } from "@/components/referrals/ReferralCodeCapture";
import { AttributionCapture } from "@/components/attribution/AttributionCapture";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { getSiteUrl } from "@/lib/siteUrl";

/**
 * Typography — Geist Sans (display + body) + Geist Mono (data/tabular).
 *
 * Single variable family handles every weight via `font-weight`, so the
 * heading / body CSS variables both point at it. Existing classes like
 * `.font-heading` / `.font-body` in globals.css keep working — they
 * resolve through the same vars, just with a sharper, more modern face
 * than Montserrat + Roboto. Mono is used for stat values + tabular
 * numbers (see `.font-mono` and `.tabular-nums` in globals.css).
 */
const fontHeading = Geist({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const fontBody = Geist({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

import type { Metadata } from "next";

const SITE_URL = getSiteUrl().replace(/\/$/, "");
// CloseBoss rebrand on the same domain (closebossai.com stays the URL).
const SITE_NAME = "CloseBoss";
// SEO brand: lead <title>/OG/schema with the "CloseBoss AI" variant. We own
// the exact-match domain (closebossai.com) for the winnable "realtyboss ai"
// query, and it disambiguates us from realtyboss.com / realtyboss.ng. SITE_NAME
// stays the wordmark; SITE_BRAND / SITE_TITLE drive search-facing metadata.
const SITE_BRAND = "CloseBoss AI";
// Homepage title per HANDOFF_BOSS_V2 PR-1. Subpages keep the `%s | CloseBoss AI`
// template for the exact-match "realtyboss ai" query.
const SITE_TITLE = "CloseBoss — Your AI Real Estate Team. Close More Deals.";
const SITE_DESCRIPTION =
  "CloseBoss is an AI-powered real estate team that answers every call, follows up with every lead, coordinates every transaction, and helps agents close more deals without hiring additional staff.";

/**
 * Tab + Apple + JSON-LD all use the CloseBoss icons in
 * `public/brand/realtyboss/` (regenerated via scripts/generate-brand-icons.mjs).
 * Explicit entries ensure correct absolute URLs with `metadataBase` on Vercel previews.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_BRAND}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "AI real estate team",
    "AI real estate assistant",
    "AI receptionist for realtors",
    "real estate agent software",
    "AI lead follow-up",
    "real estate transaction coordination",
    "AI ISA for real estate",
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_BRAND,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    // `images` is intentionally omitted: Next.js App Router auto-detects
    // `app/opengraph-image.tsx` and wires it as the og:image for this
    // route. Previously this hardcoded `/images/og-default.png` which
    // never existed on disk, so every social share had a broken preview
    // (same bug that existed on PropertyTools AI until PR #17).
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    // Same as openGraph.images — Next auto-picks up opengraph-image.tsx
    // for twitter:image as well. No creator handle until a CloseBoss
    // account exists (the old @leadsmartai handle would misattribute).
  },
  // Favicon/app icons come from Next's file conventions: app/icon.png (the
  // CloseBoss hexagon mark on a white tile) and app/apple-icon.png. No explicit
  // `icons` overrides, so app/icon.png is the canonical favicon.
  // NOTE: Do NOT set a root-level canonical here. Next.js merges root
  // layout metadata into every child page that doesn't override it,
  // which causes all subpages (e.g. /about, /pricing, /blog) to emit
  // <link rel="canonical" href="https://www.closebossai.com/"> —
  // telling Google every page is a duplicate of the homepage.
  // Individual pages should set their own canonical via generateMetadata.
  alternates: {},
};

/**
 * JSON-LD structured data for Google rich results. Three graphs:
 *
 *   1. Organization — brand identity, logo, name. Surfaces as the
 *      knowledge panel + logo in search results.
 *
 *   2. WebSite with SearchAction — enables the "Sitelinks search box"
 *      in Google SERPs pointing at /dashboard/leads for quick agent
 *      access.
 *
 *   3. SoftwareApplication — describes CloseBoss as a real estate
 *      CRM product with an offer ladder (Free / Pro / Elite / Team).
 *      AggregateRating is intentionally omitted because we don't yet
 *      have real review data — adding fake ratings gets penalized.
 *
 * Injected as inline <script type="application/ld+json"> tags in the
 * document <head> via Next.js App Router layout.
 */
const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    // Registered alias so Google ties both "CloseBoss" and "CloseBoss AI"
    // (our exact-match domain query) to this entity.
    alternateName: SITE_BRAND,
    url: SITE_URL,
    logo: `${SITE_URL}/brand/realtyboss/realtyboss-icon-512.png`,
    description: SITE_DESCRIPTION,
    // Populate with verified profile URLs (LinkedIn / X / Instagram /
    // Crunchbase / G2 / Capterra) as they're created — strengthens the
    // brand entity + knowledge panel.
    sameAs: ["https://www.linkedin.com/company/maxy-investment/"] as string[],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/dashboard/leads?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    alternateName: SITE_BRAND,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    // LinkedIn product page — ties this product entity to its LinkedIn profile.
    sameAs: ["https://www.linkedin.com/products/maxy-investment-realtyboss-ai/"],
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: "0",
      highPrice: "199",
      offerCount: "4",
    },
  },
];

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Resolve the agent's locale on the server (cookie → Accept-
  // Language → English) so SSR + the first client render match
  // and we avoid a hydration flicker.
  const locale = await getServerLocale();
  const t = await getServerT();
  // BCP-47 → HTML lang attribute. "zh-Hans" is valid HTML so we
  // pass it through unchanged.
  const htmlLang = locale === "zh-Hans" ? "zh-Hans" : "en";

  // `suppressHydrationWarning` on <html>/<body> only: browser extensions
  // (Grammarly, password managers, dark-mode) and the locale script inject
  // attributes onto these two elements *before* React hydrates, which
  // otherwise surfaces as React #418 on first load in production. This flag is
  // one level deep — it ignores attribute diffs on these tags alone and never
  // masks mismatches in the page content below.
  return (
    <html lang={htmlLang} suppressHydrationWarning>
      <head>
        {jsonLd.map((schema, i) => (
          <script
            key={`ld-json-${i}`}
            type="application/ld+json"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          />
        ))}
      </head>
      <body
        suppressHydrationWarning
        className={`${fontHeading.variable} ${fontBody.variable} ${fontMono.variable} bg-brand-surface text-brand-text font-body`}
      >
        {/*
         * Skip-to-content link — WCAG 2.4.1 "Bypass Blocks".
         * Hidden by default with `sr-only`, becomes visible on
         * keyboard focus via `focus:not-sr-only` so sighted
         * keyboard users can jump past the nav. Points at
         * `#main-content` which lives on the `<main>` element
         * in `LeadSmartLanding.tsx` and `DashboardShell.tsx`.
         */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[999] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#0072ce] focus:shadow-lg focus:ring-2 focus:ring-[#0072ce]/40 dark:focus:bg-slate-900 dark:focus:text-[#4da3e8]"
        >
          {t("skip_to_content", { ns: "common" })}
        </a>
        <I18nProvider locale={locale}>
          <AuthProvider>
            <CookieConsentProvider>
              <GoogleAnalytics />
              <ReferralCodeCapture />
              <AttributionCapture />
              <AppShell>{children}</AppShell>
            </CookieConsentProvider>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
