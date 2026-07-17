import type { NextConfig } from "next";

const config: NextConfig = {
  // pdf-parse / mammoth are server-only and pull in optional native/test assets.
  // Keep them external to the server bundle so the build doesn't try to trace them.
  serverExternalPackages: ["pdf-parse", "mammoth"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
};

export default config;
