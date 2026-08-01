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
};

export default config;
