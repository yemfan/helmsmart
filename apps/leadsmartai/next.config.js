import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Monorepo root (Propertytoolsai/) — fixes Next/Vercel inferring the wrong workspace root */
const monorepoRoot = path.join(__dirname, "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@repo/ui", "@repo/valuation", "@leadsmart/shared", "@leadsmart/api-client", "@helm/dna-communication", "@helm/pack-real-estate"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.youtube.com", pathname: "/**" },
      { protocol: "https", hostname: "i.ytimg.com", pathname: "/**" },
      { protocol: "https", hostname: "i.vimeocdn.com", pathname: "/**" },
    ],
  },
  // Repo-root Vercel deploys only (see root `build:vercel-*-root`). App deploys use default `.next` under this package.
  // Relative to this app dir — see `apps/propertytoolsai/next.config.js` (absolute distDir breaks Windows).
  ...(process.env.NEXT_DIST_IN_MONOREPO_ROOT === "1" && {
    distDir: "../../.next",
  }),
  // Trace serverless bundles from repo root (required for npm workspaces on Vercel)
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
  experimental: {
    // ~1500+ prerendered routes — lower peak RSS on Vercel CI
    staticGenerationMaxConcurrency: 1,
    staticGenerationMinPagesPerWorker: 1,
    webpackMemoryOptimizations: true,
  },
  /**
   * Legacy RealtorBoss → RealtyBoss compat (PR-1 rename, HANDOFF_BOSS_V2).
   * Shipped mobile builds still call /api/dashboard/realtorboss/* and old
   * kiosk PWA installs / emailed JSON-LD reference /brand/realtorboss/*.
   * Rewrites (not redirects) so POSTs and installed manifests keep working.
   */
  async rewrites() {
    return [
      // Two renames deep now: RealtorBoss -> RealtyBoss -> CloseBoss. BOTH old
      // spellings must keep resolving — shipped mobile builds and installed
      // kiosk PWAs call /api/dashboard/{realtorboss,realtyboss}/* and cannot be
      // updated retroactively. Each points straight at the current path, since
      // Next resolves a rewrite once against the filesystem rather than
      // re-running the table, so chaining old -> newer -> newest would not work.
      {
        source: "/api/dashboard/realtorboss/:path*",
        destination: "/api/dashboard/closeboss/:path*",
      },
      {
        source: "/api/dashboard/realtyboss/:path*",
        destination: "/api/dashboard/closeboss/:path*",
      },
      {
        source: "/brand/realtorboss/realtorboss-:file",
        destination: "/brand/closeboss/closeboss-:file",
      },
      {
        source: "/brand/realtyboss/realtyboss-:file",
        destination: "/brand/closeboss/closeboss-:file",
      },
      // The agent's public handle: closebossai.com/@michaelye
      //
      // A rewrite rather than a route folder because the App Router reserves a
      // leading "@" for parallel-route slots — `app/@[username]` is a slot, not
      // a page, and would never render. The page therefore lives at
      // /a/[username] and this makes the shareable URL the pretty one. It is a
      // rewrite, not a redirect, so what the agent puts on a business card is
      // what stays in the address bar.
      //
      // A bare /:username was not an option: there are 117 top-level routes
      // here, and any route added later would silently shadow whoever already
      // owned that name. The sigil makes collision impossible by construction.
      {
        source: "/@:username",
        destination: "/a/:username",
      },
      // Everything BELOW the handle — /@michaelye/p/<slug>, the per-post pages
      // the feed's titles link to. The rule above matches ONE segment, so
      // without this every content page 404s while the hub itself looks fine.
      // A second rule rather than widening the first: ":path*" also matches the
      // empty path on some Next versions, and a bare /@handle resolving through
      // the wildcard is a regression waiting to happen.
      {
        source: "/@:username/:path*",
        destination: "/a/:username/:path*",
      },
    ];
  },
  /** Short nav-style paths → `/dashboard/*` (app lives under dashboard) */
  async redirects() {
    const toDashboard = [
      ["/leads", "/dashboard/leads"],
      ["/leads/new", "/dashboard/leads"],
      ["/leads/assigned", "/dashboard/contacts"],
      ["/leads/activity", "/dashboard/automation"],
      ["/opportunities/marketplace", "/dashboard/opportunities"],
      ["/opportunities/purchased", "/dashboard/opportunities"],
      ["/opportunities/alerts", "/dashboard/notifications"],
      ["/pipeline/contacted", "/dashboard/contacts"],
      ["/pipeline/qualified", "/dashboard/contacts"],
      ["/pipeline/active-deal", "/dashboard/contacts"],
      ["/pipeline/closed-lost", "/dashboard/contacts"],
      ["/ai-tools/follow-up", "/dashboard/automation"],
      ["/ai-tools/property-comparison", "/dashboard/comparison-report"],
      ["/ai-tools/offer-assistant", "/deal-assistant"],
      ["/ai-tools/deal-closer", "/dashboard/tools"],
      ["/reports/performance", "/dashboard/performance"],
      ["/reports/lead-sources", "/dashboard/reports"],
      ["/reports/conversion", "/dashboard/growth"],
      ["/settings/profile", "/dashboard/settings"],
      ["/settings/team", "/dashboard/settings"],
      // Was "/pricing", which now redirects to /plans. Pointed straight
      // at the destination rather than making the browser take two hops.
      ["/settings/billing", "/plans"],
      ["/settings/notifications", "/dashboard/notifications"],
    ];
    /**
     * Canonical-slug redirects for marketing/calculator surfaces. TVR-011
     * found stale references to non-canonical paths in calculator FAQs:
     *   - /investment-analyzer  → /property-investment-analyzer (BF-036)
     *   - /loan-amortization-calculator → /mortgage-calculator (BF-035;
     *     mortgage calculator already includes the amortization schedule
     *     view, so consolidating avoids shipping a near-duplicate page)
     * Permanent (308) so external SEO inbound links carry through.
     */
    const canonicalSlug = [
      ["/investment-analyzer", "/property-investment-analyzer"],
      ["/loan-amortization-calculator", "/mortgage-calculator"],
    ];

    /**
     * Financial Services vertical — unpublished 2026-08-23. CloseBoss is
     * real-estate-agent only. The route files are retained on purpose: see
     * `app/financial-services/FROZEN.md` (extraction to
     * `@helm/pack-financial-services`, Extraction Plan Phase 5). These
     * redirects run before routing, so the pages are off the public site
     * without deleting the work.
     */
    const unpublishedFinancialServices = [
      ["/financial-services", "/"],
      ["/financial-services/:path*", "/"],
      ["/api/financial-services/:path*", "/"],
    ];

    /**
     * Retired vertical — mortgage / loan broker (removed 2026-08-23).
     * CloseBoss is real-estate-agent only. `/loan-broker/*` and
     * `/pricing/loan-broker` were indexable marketing pages, so they redirect
     * permanently to the agent equivalents instead of 404ing. These rules run
     * before routing, so they also make any leftover route files unreachable.
     */
    const retiredLoanBroker = [
      // These pointed at /agent/pricing, which now redirects to /plans.
      ["/loan-broker", "/plans"],
      ["/loan-broker/:path*", "/plans"],
      ["/pricing/loan-broker", "/plans"],
      ["/start-free/loan-broker", "/start-free/agent"],
      ["/api/loan-broker/:path*", "/plans"],
    ];

    return [
      ...toDashboard.map(([source, destination]) => ({
        source,
        destination,
        permanent: false,
      })),
      ...canonicalSlug.map(([source, destination]) => ({
        source,
        destination,
        permanent: true,
      })),
      ...retiredLoanBroker.map(([source, destination]) => ({
        source,
        destination,
        permanent: true,
      })),
      ...unpublishedFinancialServices.map(([source, destination]) => ({
        source,
        destination,
        permanent: true,
      })),
      /*
       * Retired price list -> the live one.
       *
       * /agent/pricing and /pricing advertised the feature-tier catalog
       * ($79 Pro / $199 Premium / $399 Signature) months after Stripe moved to
       * the usage catalog on /plans. They were not dead ends: both were linked
       * from the agent landing page, the compare page and a blog post, and
       * /agent/pricing is the CANCEL URL for Stripe checkout — so abandoning a
       * purchase landed you on prices we no longer sell.
       *
       * 302, not 301. A permanent redirect is cached by browsers effectively
       * forever, and these URLs may well come back as real marketing pages once
       * they carry the current numbers. Cheap to make permanent later;
       * expensive to undo.
       */
      { source: "/agent/pricing", destination: "/plans", permanent: false },
      { source: "/pricing", destination: "/plans", permanent: false },
    ];
  },
};

export default nextConfig;
