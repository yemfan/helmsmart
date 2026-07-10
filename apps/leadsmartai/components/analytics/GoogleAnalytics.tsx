"use client";

import { useEffect } from "react";
import Script from "next/script";

import { useCookieConsent } from "@/components/cookie-consent/CookieConsent";

/**
 * Consent-gated GA4 loader.
 *
 * Unlike an always-on GA tag, this component does NOT load
 * googletagmanager.com/gtag/js until the user has granted the **analytics**
 * cookie category (see CookieConsent). This matches the codebase philosophy
 * documented in `lib/marketing/landingTrack.ts`: "Without consent we skip the
 * network call entirely." No gtag script, no GA cookies, no beacons ship
 * until opt-in.
 *
 * Behaviour:
 *   - No consent (or undecided) → renders nothing; `window.gtag` stays undefined,
 *     and `trackLandingEvent` already no-ops its third-party calls.
 *   - Analytics granted → injects gtag.js + config (IP anonymized). `gtag` is
 *     then available so `trackLandingEvent` can forward events.
 *   - Granted-then-revoked in the same session → the loaded gtag library can't
 *     be un-downloaded, so we set the official `ga-disable-<id>` kill switch
 *     which stops all further hits. On the next page load the script simply
 *     isn't rendered again.
 *
 * Env: reads `NEXT_PUBLIC_GA_ID` (this app's own GA4 property — separate from
 * any sibling app's ID). When unset the component is inert, so preview / local
 * builds without the var are fine.
 */

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export function GoogleAnalytics() {
  const { state, ready } = useCookieConsent();
  const analyticsAllowed = ready && state?.categories.analytics === true;

  // Kill switch: whenever analytics is not allowed, flip GA's official
  // `ga-disable-<id>` global so any gtag library already loaded earlier in the
  // session stops sending hits. Setting it back to false re-enables on re-grant.
  useEffect(() => {
    if (!GA_ID) return;
    (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] =
      !analyticsAllowed;
  }, [analyticsAllowed]);

  if (!GA_ID || !analyticsAllowed) return null;

  return (
    <>
      <Script
        id="ga4-src"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          window['ga-disable-${GA_ID}'] = false;
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
}
