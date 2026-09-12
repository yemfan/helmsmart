/**
 * The URL segments `proxy.ts` guards — every route under `app/(dashboard)/`.
 *
 * A route in that group has no auth check of its own. It reads the active-org
 * cookie, or calls a server action that does, and trusts that something
 * upstream already established there is a signed-in member behind the request.
 * `proxy.ts` is that something: it is the only place a page route is sent to
 * `/login` when there is no user, or to `/onboarding` when there is no org
 * cookie (see the note at the top of `lib/auth/org-context.ts`).
 *
 * So the list below is not a convenience — it is the guard itself, and a route
 * missing from it is a route with no guard. The failure is quiet: the request
 * falls through to the page, the dashboard shell renders to a signed-out
 * visitor, and the page loads with `orgId` as the empty string. What happens
 * next depends on the page. The gentler ones bottom out in `getMemberOrgId()`,
 * get null and render an empty list — the shell of someone else's product with
 * nothing in it. The ones that read the cookie directly send `""` into a
 * `uuid` comparison and get back a Postgres cast error where a row was
 * expected. Neither is a login prompt, which is the only correct answer.
 *
 * It lives in its own module so that the list and the directories it stands
 * for can be checked against each other — `dashboard-segments.test.ts` fails
 * the build when a new `app/(dashboard)/…` route is added without a segment,
 * or when a segment outlives the directory it named. Adding a route is how
 * this list goes stale, and adding a route is not a moment anyone is thinking
 * about middleware.
 *
 * Matching is `pathname.startsWith(segment)`, so a segment covers its whole
 * subtree. That is deliberate: `/forms/[id]/submissions` needs the same guard
 * as `/forms`. It also reaches a few pages outside the group that share a
 * prefix — `/calendar/book`, `/books/invoices/[id]/print`,
 * `/clients/[id]/statement` — all of which are staff-only and want it.
 */
export const DASHBOARD_SEGMENTS = [
  "/ai-team", "/ask", "/automations", "/books", "/calendar", "/client-assistant",
  "/clients", "/command-center", "/forms", "/google", "/home", "/inbox",
  "/insights", "/marketing", "/pipeline", "/projects", "/reception", "/reports",
  "/settings", "/social", "/tasks", "/timesheets", "/voice", "/workflows",
] as const;
