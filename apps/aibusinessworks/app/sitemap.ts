import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { LEGAL_DOCUMENTS } from "@/content/legal";

const OWN_ROUTES = new Set(["partner-terms", "privacy", "marketing-guidelines"]);

export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE.url.replace(/\/$/, "");
  const now = new Date();

  const pages: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/how-it-works", priority: 0.9, changeFrequency: "monthly" },
    { path: "/compensation", priority: 0.9, changeFrequency: "monthly" },
    { path: "/leadership", priority: 0.85, changeFrequency: "monthly" },
    { path: "/solutions", priority: 0.85, changeFrequency: "monthly" },
    { path: "/academy", priority: 0.7, changeFrequency: "monthly" },
    { path: "/resources", priority: 0.6, changeFrequency: "monthly" },
    { path: "/success-stories", priority: 0.5, changeFrequency: "monthly" },
    { path: "/faq", priority: 0.7, changeFrequency: "monthly" },
    { path: "/partners", priority: 0.6, changeFrequency: "weekly" },
    { path: "/join", priority: 0.9, changeFrequency: "monthly" },
    { path: "/terms", priority: 0.4, changeFrequency: "yearly" },
    { path: "/privacy", priority: 0.4, changeFrequency: "yearly" },
    { path: "/marketing-guidelines", priority: 0.4, changeFrequency: "yearly" },
  ];

  const legal = LEGAL_DOCUMENTS.filter((d) => !OWN_ROUTES.has(d.key)).map((d) => ({
    path: `/legal/${d.key}`,
    priority: 0.3,
    changeFrequency: "yearly" as const,
  }));

  return [...pages, ...legal].map((page) => ({
    url: `${base}${page.path}`,
    lastModified: now,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
