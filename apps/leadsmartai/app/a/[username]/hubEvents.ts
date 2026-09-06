"use client";

/**
 * The hub's one-line analytics client.
 *
 * Two destinations for every event:
 *
 *   1. CloseBoss — the beacon the overview reads. `keepalive` so a click
 *      that navigates away still lands; the name is validated server-side
 *      against an allowlist, so this helper is deliberately dumb.
 *   2. The AGENT's own tags, when the page rendered them (see HubTags):
 *      GA4 via `gtag`, Meta Pixel via `fbq`. The hub already sends them a
 *      page view; sending the CTA clicks, assistant opens and leads too
 *      puts the hub's numbers next to the agent's other Google and Meta
 *      reports, in their own accounts, without CloseBoss reading either.
 *
 * `forwardOnly` events (a lead created, an appointment booked) reach the
 * tags but not the beacon — CloseBoss records those server-side, where the
 * fact is known for certain.
 *
 * Every failure is swallowed. Analytics must never be the reason a public
 * page shows an error.
 */

type Gtag = (command: "event", name: string, params?: Record<string, unknown>) => void;
type Fbq = (command: "track" | "trackCustom", name: string, params?: Record<string, unknown>) => void;

declare global {
  interface Window {
    gtag?: Gtag;
    fbq?: Fbq;
  }
}

/** Standard Pixel events where the hub's own names have an equivalent. */
const PIXEL_STANDARD: Record<string, string> = {
  lead_created: "Lead",
  appointment_booked: "Schedule",
  ai_open: "Contact",
  home_value_started: "InitiateCheckout",
  home_search_started: "Search",
};

function forwardToTags(type: string, meta: Record<string, string>): void {
  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", type, { ...meta, hub: true });
    }
    if (typeof window.fbq === "function") {
      const standard = PIXEL_STANDARD[type];
      if (standard) window.fbq("track", standard, meta);
      else window.fbq("trackCustom", type, meta);
    }
  } catch {
    /* the agent's tag is their concern, never the page's */
  }
}

export function trackHubEvent(
  username: string,
  type: string,
  meta?: Record<string, string | undefined>,
  opts: { forwardOnly?: boolean } = {},
): void {
  try {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(meta ?? {})) if (v) clean[k] = v;
    forwardToTags(type, clean);
    if (opts.forwardOnly) return;
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
