/**
 * Which half of the app a path belongs to, for the purpose of translations.
 *
 * The signed-in surfaces and the public site read almost disjoint copy: the
 * `dashboard` namespace is 364 KB that no marketing page renders, and the SEO
 * and calculator copy in `web_pages` is 300 KB no signed-in screen reads.
 * One bundle for both meant every visitor downloaded 904 KB of translations
 * to use a fraction of it.
 *
 * So the client bundle is split in two and chosen by path. Kept deliberately
 * dumb — a prefix test, no auth check, no async — because it runs during
 * render on both sides of hydration and has to give the same answer each time.
 *
 * `/account` is deliberately absent: it renders the dashboard shell, but no
 * client component under it reads a namespace the public group lacks. That is
 * a fact about the import graph rather than about the URL, so
 * `routeGroups.test.ts` proves it instead of this comment asserting it.
 */
export type RouteGroup = "app" | "web";

const APP_PREFIXES = ["/dashboard", "/admin", "/support", "/client"] as const;

export function routeGroupFor(pathname: string | null | undefined): RouteGroup {
  const path = pathname || "/";
  return APP_PREFIXES.some((p) => path === p || path.startsWith(p + "/")) ? "app" : "web";
}
