/**
 * Request headers the proxy uses to carry a URL's locale into the render.
 *
 * Their own module because `proxy.ts` runs in the middleware bundle and the
 * pages run on the server: importing the names from anything that also pulls in
 * Supabase or `server-only` would drag that whole graph into middleware. Two
 * string constants have no dependencies and can be shared safely.
 */

/** The locale resolved from the path, e.g. "zh-Hans" for /zh/pricing. */
export const LOCALE_HEADER = "x-helmsmart-locale";

/** The path with the locale prefix removed, e.g. "/pricing" for /zh/pricing. */
export const LOCALE_PATH_HEADER = "x-helmsmart-path";
