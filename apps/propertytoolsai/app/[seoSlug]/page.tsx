import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import { incrementSeoPageVisit } from "@/lib/seo-generator/db";
import { getGeneratedSeoPageBySlug } from "@/lib/seo-generator/service";
import { getSiteUrl } from "@/lib/siteUrl";
import { SeoLandingPage } from "@/components/seo/SeoLandingPage";

/*
 * This catch-all route was `force-dynamic`, so every crawler hit ran the full
 * pipeline against the database — and it dominated the whole instance:
 * 1.1M PostgREST requests, 300k calls on market_geographies, 392k on
 * seo_cluster_pages, enough to peg CPU and take the shared database down for
 * every other app.
 *
 * The content is generated copy that changes on the order of days, so serving
 * it live per request bought nothing. ISR renders once and serves everyone
 * else from cache; a stale page is regenerated in the background rather than
 * making a visitor wait.
 *
 * Safe here because this app's root layout reads no cookies() — the
 * DYNAMIC_SERVER_USAGE trap that bites revalidate elsewhere in this monorepo
 * doesn't apply.
 */
export const revalidate = 3600;

const SITE_URL = getSiteUrl().replace(/\/$/, "");

/**
 * generateMetadata and the page body both need the same page. Without this
 * they each ran the full lookup — doubling the database work for every render.
 * React.cache dedupes them into one call per request.
 */
const loadSeoPage = cache(getGeneratedSeoPageBySlug);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ seoSlug: string }>;
}): Promise<Metadata> {
  const { seoSlug } = await params;
  const page = await loadSeoPage(seoSlug);

  if (!page) {
    return { title: "Not found | PropertyToolsAI", robots: { index: false, follow: false } };
  }

  const url = `${SITE_URL}/${seoSlug}`;
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: { canonical: `/${seoSlug}` },
    openGraph: {
      title: page.metaTitle,
      description: page.metaDescription,
      url,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: page.metaTitle,
      description: page.metaDescription,
    },
  };
}

export default async function GeneratedSeoPage({
  params,
}: {
  params: Promise<{ seoSlug: string }>;
}) {
  const { seoSlug } = await params;
  const page = await loadSeoPage(seoSlug);

  if (!page) notFound();

  void incrementSeoPageVisit(seoSlug);

  const url = `${SITE_URL}/${seoSlug}`;
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: page.metaTitle,
          description: page.metaDescription,
          url,
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
            { "@type": "ListItem", position: 2, name: page.metaTitle, item: url },
          ],
        }}
      />
      <SeoLandingPage page={page} />
    </>
  );
}
