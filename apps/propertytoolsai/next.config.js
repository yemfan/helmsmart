import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Monorepo root (Propertytoolsai/) — fixes Next/Vercel inferring the wrong workspace root */
const monorepoRoot = path.join(__dirname, "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@repo/ui", "@repo/valuation", "@leadsmart/shared", "@leadsmart/api-client"],
  /** Nav-friendly URLs → existing tool routes */
  async redirects() {
    return [
      // ──────────────────────────────────────────────────────────────────
      // Canonical host — validation report SEO-05.
      // lib/siteUrl.ts + app/robots.ts both declare www.propertytoolsai.com
      // as canonical. Without a 301 from apex → www, Google splits link
      // equity + crawl budget across the two hosts. This rule is
      // defense-in-depth — Vercel's Domains UI typically handles this at
      // the edge, but the Next-level rule guarantees the behavior even if
      // the Vercel alias config drifts.
      // ──────────────────────────────────────────────────────────────────
      {
        source: "/:path*",
        has: [{ type: "host", value: "propertytoolsai.com" }],
        destination: "https://www.propertytoolsai.com/:path*",
        permanent: true, // 308 — preserve link equity
      },
      // TOM MJ-004: /home-value-estimator is a stub duplicate of the real
      // /home-value tool, flagged for SEO duplicate-content + user confusion.
      // Permanent 308 so accumulated SEO equity transfers.
      { source: "/home-value-estimator", destination: "/home-value", permanent: true },
      // ──────────────────────────────────────────────────────────────────
      // Calculator consolidation (2026-04). Both retired pages were
      // near-duplicates. /cap-rate-calculator now has an optional
      // "Include financing" toggle that subsumes the old
      // /cap-rate-roi-calculator. /cash-flow-calculator gained an
      // optional purchase-price input that subsumes the old
      // /property-investment-analyzer. 308 preserves SEO equity.
      // /investment-analyzer was a pre-existing misspelled FAQ link —
      // catch it here too.
      // ──────────────────────────────────────────────────────────────────
      { source: "/cap-rate-roi-calculator", destination: "/cap-rate-calculator", permanent: true },
      { source: "/property-investment-analyzer", destination: "/cash-flow-calculator", permanent: true },
      { source: "/investment-analyzer", destination: "/cash-flow-calculator", permanent: true },
      // Nav-friendly URLs → existing tool routes
      { source: "/cma-report", destination: "/smart-cma-builder", permanent: false },
      {
        source: "/market-value-trends",
        destination: "/market-report/los-angeles-ca",
        permanent: false,
      },
      { source: "/rent-estimator", destination: "/rental-property-analyzer", permanent: false },
      { source: "/roi-cash-flow", destination: "/cash-flow-calculator", permanent: false },
      // TOM BF-022: canonicalize on the shorter /rent-vs-buy path. The app
      // dir was renamed from rent-vs-buy-calculator → rent-vs-buy so the
      // canonical now returns 200; the longer path 308-redirects to it.
      // Permanent so accumulated SEO equity transfers.
      { source: "/rent-vs-buy-calculator", destination: "/rent-vs-buy", permanent: true },
      {
        source: "/ai-recommended-properties",
        destination: "/serp-hub",
        permanent: false,
      },
      { source: "/smart-next-steps", destination: "/guides", permanent: false },
    ];
  },
  // Relative to this app dir so Next's `path.join(dir, distDir)` resolves correctly on all platforms.
  // An absolute `distDir` breaks on Windows (nested `.../apps/<app>/C:/.../.next`) and can confuse builds.
  ...(process.env.NEXT_DIST_IN_MONOREPO_ROOT === "1" && {
    distDir: "../../.next",
  }),
  // Trace serverless bundles from repo root (required for npm workspaces on Vercel)
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
  experimental: {
    // ~2500+ prerendered routes — lower peak RSS on Vercel (avoids OOM during "Generating static pages")
    staticGenerationMaxConcurrency: 1,
    staticGenerationMinPagesPerWorker: 1,
    webpackMemoryOptimizations: true,
  },
};

export default nextConfig;
