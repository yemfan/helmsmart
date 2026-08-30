/**
 * Single source of truth for the Pinterest API host.
 *
 * Pinterest API v5 (https://developers.pinterest.com/docs/api/v5/). The REST
 * base and OAuth server share one host; the authorize DIALOG always lives on
 * www.pinterest.com. Unlike Meta/Threads, v5 is unversioned in the path (the
 * `/v5/` segment is the version), so there's no per-month version to bump —
 * Pinterest deprecates the whole vN with long notice.
 *
 * SANDBOX
 * -------
 * An app on Trial access cannot create Pins against production at all:
 *
 *   403 code 29: Apps with Trial access may not create Pins in production
 *   https://api.pinterest.com - use API Sandbox https://api-sandbox.pinterest.com
 *
 * That gate is why no Pin has ever published from this app. Until Pinterest
 * grants Standard access the only way to exercise the publish path end-to-end
 * is the sandbox host, so the host is env-driven rather than hardcoded —
 * otherwise the first real test of the pipeline happens on approval day.
 *
 *   PINTEREST_API_BASE_URL=https://api-sandbox.pinterest.com
 *
 * Set it together with the sandbox app's PINTEREST_APP_ID / PINTEREST_APP_SECRET:
 * the token endpoint is derived from the same host, so credentials and API
 * calls stay on one side of the fence. Leave it unset for production.
 */

const DEFAULT_API_HOST = "https://api.pinterest.com";

/** API host, overridable for the sandbox. No trailing slash. */
function apiHost(): string {
  const override = process.env.PINTEREST_API_BASE_URL?.trim().replace(/\/+$/, "");
  return override || DEFAULT_API_HOST;
}

/** REST base, e.g. https://api.pinterest.com/v5 */
export const PINTEREST_API_BASE = `${apiHost()}/v5`;

/** OAuth token endpoint (Basic-auth app credentials). Same host as the REST base. */
export const PINTEREST_OAUTH_TOKEN = `${apiHost()}/v5/oauth/token`;

/**
 * OAuth authorize dialog — always www.pinterest.com. This is the page a human
 * sees and approves on, and it exists only on the real site; the sandbox has
 * no consent UI of its own.
 */
export const PINTEREST_OAUTH_AUTHORIZE = "https://www.pinterest.com/oauth/";

/** True when pointed at a non-production host. */
export function isPinterestSandbox(): boolean {
  return apiHost() !== DEFAULT_API_HOST;
}

/** Public Pin URL from a pin id. */
export function pinUrl(pinId: string): string {
  return `https://www.pinterest.com/pin/${pinId}/`;
}
