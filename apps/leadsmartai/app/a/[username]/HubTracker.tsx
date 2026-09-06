"use client";

import { useEffect, useRef } from "react";

/**
 * Records one hub view, once.
 *
 * Renders nothing. It exists so the count reflects browsers rather than
 * crawlers — the page is force-dynamic, so the server could count during
 * render, and would then count every bot, preview fetch and uptime check as a
 * visitor. An agent shown a visitor number that is mostly Googlebot stops
 * trusting the whole dashboard.
 *
 * The ref guard matters in development, where React's strict mode mounts
 * effects twice and would otherwise double every view.
 *
 * Failure is silent by design. Analytics must never be the reason a public
 * page shows an error.
 */
export default function HubTracker({
  username,
  utmSource,
  utmCampaign,
}: {
  username: string;
  utmSource: string | null;
  utmCampaign: string | null;
}) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    // Referrer host only, never the full URL — the path someone came from can
    // carry search terms and other things that are theirs, not ours.
    let referrerHost: string | null = null;
    try {
      if (document.referrer) {
        const url = new URL(document.referrer);
        if (url.host !== window.location.host) referrerHost = url.host;
      }
    } catch {
      /* an unparseable referrer is simply unknown */
    }

    void fetch(`/api/public/hub/${encodeURIComponent(username)}/view`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // The page within the hub, so the overview can tell the home page from
      // /services or an area page. Validated server-side against the handle.
      body: JSON.stringify({ utmSource, utmCampaign, referrerHost, path: window.location.pathname }),
      keepalive: true,
credentials: "same-origin",
    }).catch(() => {});
  }, [username, utmSource, utmCampaign]);

  return null;
}
