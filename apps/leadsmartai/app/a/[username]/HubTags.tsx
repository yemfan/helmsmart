import Script from "next/script";
import type { TrackingDecision } from "@/lib/marketing-hub/tracking";

/**
 * The agent's own analytics tags, on their own hub.
 *
 * A server component that emits nothing unless `decideTracking` already said
 * yes — plan, configuration and the visitor's privacy signal are all settled
 * before this renders. Deciding here would mean the script tag existed in the
 * tree before the answer did.
 *
 * `afterInteractive` for both: neither is needed to paint the page, and a hub
 * that renders slowly because it is loading someone's ad tracker is a hub that
 * converts worse — which defeats the point of the tracker.
 *
 * The ids interpolated below are validated against a strict pattern upstream
 * (digits only for Meta, `G-` plus alphanumerics for GA) and are additionally
 * constrained by a CHECK in the database, so neither can carry a quote or an
 * angle bracket into this markup.
 */
export function HubTags({ decision }: { decision: TrackingDecision }) {
  const { metaPixelId, gaMeasurementId } = decision;
  if (!metaPixelId && !gaMeasurementId) return null;

  return (
    <>
      {gaMeasurementId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
            strategy="afterInteractive"
          />
          <Script id="hub-ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaMeasurementId}');`}
          </Script>
        </>
      ) : null}

      {metaPixelId ? (
        <Script id="hub-meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${metaPixelId}');fbq('track','PageView');`}
        </Script>
      ) : null}
    </>
  );
}
