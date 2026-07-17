import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Creator area and internal APIs aren't for crawlers.
      disallow: ["/app", "/api/"],
    },
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
