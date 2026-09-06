"use client";

/**
 * The hub's one-line analytics client.
 *
 * `keepalive` so a click that navigates away still lands; `catch(() => {})`
 * because analytics must never be the reason a public page shows an error.
 * The event name is validated server-side against an allowlist, so this
 * helper is deliberately dumb.
 */
export function trackHubEvent(
  username: string,
  type: string,
  meta?: Record<string, string | undefined>,
): void {
  try {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(meta ?? {})) if (v) clean[k] = v;
    void fetch(`/api/public/hub/${encodeURIComponent(username)}/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type,
        meta: clean,
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
      }),
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  } catch {
    /* never */
  }
}
