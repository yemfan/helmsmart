import type { Metadata } from "next";

/**
 * Page-level metadata for SEO routes.
 *
 * Next.js *merges* a page's metadata over the root layout's rather than
 * replacing it, so a page that sets only `title` / `description` /
 * `alternates.canonical` still inherits the root layout's `openGraph` — which
 * points at the homepage (homepage title + `/`). Every programmatic-SEO page
 * then shares to social as the generic homepage card.
 *
 * Building metadata through this helper guarantees `openGraph` and `twitter`
 * are set to the page's own title/description/url. Relative `path` values are
 * resolved to absolute URLs against the root layout's `metadataBase`.
 */
export function pageMetadata(args: {
  title: string;
  description: string;
  /** Root-relative canonical path, e.g. "/sell-house/los-angeles-ca". */
  path: string;
  type?: "website" | "article";
}): Metadata {
  const { title, description, path, type = "website" } = args;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type },
    twitter: { title, description },
  };
}
