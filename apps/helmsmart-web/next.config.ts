import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: {},
  // sharp is a native module (libvips); mark it external so Next doesn't bundle it
  // and Vercel traces its platform binary, so it can dlopen at runtime (the cron's
  // ad-image transcode). Without this it fails with ERR_DLOPEN_FAILED.
  serverExternalPackages: ["sharp"],
  // HelmSmart Core packages are TS source — Next must transpile them.
  transpilePackages: [
    "@helm/data",
    "@helm/ai-workforce",
    "@helm/dna-finance",
    "@helm/dna-communication",
    "@helm/dna-operations",
    "@helm/dna-revenue",
    "@helm/dna-intelligence",
    "@helm/dna-people",
    "@helm/dna-marketing",
    "@helm/dna-service",
    "@helm/dna-knowledge",
    "@helm/pack-medical",
    "@helm/ui",
  ],
  // Hardcode public Supabase values so they are always embedded at build time.
  // The anon key is intentionally public (protected by RLS, safe to commit).
  env: {
    NEXT_PUBLIC_HELM_SUPABASE_URL: "https://vpmwsnoosuiknyzdxgtk.supabase.co",
    NEXT_PUBLIC_HELM_SUPABASE_ANON_KEY:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbXdzbm9vc3Vpa255emR4Z3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NDU5MTgsImV4cCI6MjA5NTQyMTkxOH0.eAn1vPTAHXj_4OMd9T50LcazrxnvMxkcfFs-de98SNg",
    // DoctorSmart AI (medical) — its OWN Supabase project (auth + PHI island, Slice 2).
    // Anon key is public / RLS-safe. Routed to when host = medical.* (see lib/pack-host).
    NEXT_PUBLIC_MEDICAL_SUPABASE_URL: "https://mxehimahbvxzmbvqhstm.supabase.co",
    NEXT_PUBLIC_MEDICAL_SUPABASE_ANON_KEY:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14ZWhpbWFoYnZ4em1idnFoc3RtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MDA5NTQsImV4cCI6MjA5NjA3Njk1NH0.AFbuz9yiQcyAXZ05y_kSaf41bavdt2KEHniXPPrCdic",
    // Legacy aliases — kept so anything still keyed NEXT_PUBLIC_SMBAI_* keeps resolving during the rename.
    NEXT_PUBLIC_SMBAI_SUPABASE_URL: "https://vpmwsnoosuiknyzdxgtk.supabase.co",
    NEXT_PUBLIC_SMBAI_SUPABASE_ANON_KEY:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbXdzbm9vc3Vpa255emR4Z3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NDU5MTgsImV4cCI6MjA5NTQyMTkxOH0.eAn1vPTAHXj_4OMd9T50LcazrxnvMxkcfFs-de98SNg",
  },
  /**
   * Cache the marketing pages at the edge.
   *
   * These answer `private, no-store` on every request because the root layout
   * reads the locale cookie, which makes every route in the app dynamic. The
   * pages hold nothing private — they are the same bytes for everyone.
   *
   * Setting this from the proxy did NOT work (#1789, reverted in #1791): for a
   * rewrite the rendered route supplies the response and its own `no-store`
   * wins. Headers declared here are applied by the platform routing layer
   * instead, which is a different mechanism and may outrank it. Measured on a
   * deployment, not assumed — a self-hosted `next start` already disagreed
   * with Vercel once on exactly this question.
   *
   * Safe only because of the work in #1789 that survived: the language of a
   * marketing response is fixed by its URL, and a reader who wants another
   * language is redirected to their own before the cache is consulted. One
   * shared copy per URL is therefore correct for everybody.
   *
   * The paths are listed one by one rather than matched by a wildcard. A
   * pattern here would be a standing invitation to cache something private the
   * next time a route is added under a path that happens to match.
   */
  async headers() {
    const MARKETING = [
      "/",
      "/features",
      "/pricing",
      "/faq",
      "/about",
      "/contact",
      "/contact/sales",
      "/privacy",
      "/terms",
    ];
    const localized = MARKETING.flatMap((p) => [
      p,
      p === "/" ? "/zh" : "/zh" + p,
      p === "/" ? "/es" : "/es" + p,
    ]);
    return localized.map((source) => ({
      source,
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
        },
      ],
    }));
  },
};

export default config;
