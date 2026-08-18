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
      ["/settings/billing", "/pricing"],
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
    ];
  },
};

export default nextConfig;
