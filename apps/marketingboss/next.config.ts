import type { NextConfig } from "next";

const config: NextConfig = {
  // fal.ai serves generated media from these hosts; allow next/image (and the
  // browser) to load previews from them.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.fal.media" },
      { protocol: "https", hostname: "**.fal.run" },
      { protocol: "https", hostname: "v3.fal.media" },
    ],
  },
  // Hardcode the PUBLIC Supabase URL + anon key so they're always inlined at
  // build (the auth middleware/client need them). The anon key is protected by
  // RLS and safe to commit — this removes a fragile manual Vercel env step, so
  // the only var that must live in Vercel is FAL_KEY (the server-only secret).
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://vsmeeydxkbrupzbnpcwq.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzbWVleWR4a2JydXB6Ym5wY3dxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MzcwMTksImV4cCI6MjEwMTExMzAxOX0.vwFuZPPjFf-yL2GZ78G4sKM8GWPXLgdwBru22IDksTc",
  },
};

export default config;
