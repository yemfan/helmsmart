/**
 * Single source of truth for the Pinterest API host.
 *
 * Pinterest API v5 (https://developers.pinterest.com/docs/api/v5/). The REST
 * base and OAuth server share the api.pinterest.com host; the authorize DIALOG
 * lives on www.pinterest.com. Unlike Meta/Threads, v5 is unversioned in the
 * path (the `/v5/` segment is the version), so there's no per-month version to
 * bump — Pinterest deprecates the whole vN with long notice.
 */

/** REST base, e.g. https://api.pinterest.com/v5 */
export const PINTEREST_API_BASE = "https://api.pinterest.com/v5";

/** OAuth token endpoint (Basic-auth app credentials). */
export const PINTEREST_OAUTH_TOKEN = "https://api.pinterest.com/v5/oauth/token";

/** OAuth authorize dialog — hosted on www.pinterest.com. */
export const PINTEREST_OAUTH_AUTHORIZE = "https://www.pinterest.com/oauth/";

/** Public Pin URL from a pin id. */
export function pinUrl(pinId: string): string {
  return `https://www.pinterest.com/pin/${pinId}/`;
}
