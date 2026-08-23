import { permanentRedirect } from "next/navigation";

/**
 * `/what-is-cap-rate` had a `layout.tsx` and no page, so the route 404'd.
 *
 * The layout arrived in an SEO metadata pass, which says the slug was meant to
 * rank — the article that answers the question just ended up one directory
 * over. Nothing links here and it is not in the sitemap, so deleting the
 * directory would also have been defensible; a permanent redirect is better,
 * because this is exactly the URL someone types or pastes, and it hands any
 * accumulated link equity to the page that actually has the answer.
 */
export default function WhatIsCapRatePage(): never {
  permanentRedirect("/what-is-cap-rate-in-real-estate-investing");
}
