import "server-only";

import { sendEmail } from "@/lib/email";
import { loadAgentSignatureProfile } from "@/lib/signatures/loadProfile";
import {
  appendHtmlSignature,
  appendTextSignature,
  composeSignature,
} from "@/lib/signatures/compose";
import type { MatchedListing } from "./listingSearch";

/**
 * Composer for the "new listings match your saved search" digest email.
 * Renders plain-text + minimal HTML. Every CTA link passes through the
 * tracking redirect (/api/alerts/click) so the scoring cron picks up
 * the listing_alert_clicked event on engagement.
 *
 * The saved search is owned by an agent; the digest now carries that
 * agent's signature block so the alert email feels personal rather
 * than like a generic system notification.
 */

export type SendDigestOpts = {
  to: string;
  contactFirstName: string | null;
  savedSearchId: string;
  savedSearchName: string;
  listings: MatchedListing[];
  publicBaseUrl: string;
  /** Owning agent — enables personalized signature on the digest email. */
  agentId?: string | number | null;
};

function money(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toFixed(0)}`;
}

function bedsBaths(l: MatchedListing): string {
  const parts: string[] = [];
  if (l.beds) parts.push(`${l.beds} bd`);
  if (l.baths) parts.push(`${l.baths} ba`);
  if (l.sqft) parts.push(`${l.sqft.toLocaleString()} sqft`);
  return parts.join(" · ");
}

function clickUrl(base: string, savedSearchId: string, listing: MatchedListing): string {
  const u = new URL(`${base.replace(/\/$/, "")}/api/alerts/click`);
  u.searchParams.set("s", savedSearchId);
  u.searchParams.set("l", listing.id);
  // Where the redirect should land. For v1 we point at propertytoolsai's
  // listing detail page; if that 404s the redirect still logs the click
  // event server-side first.
  const listingSlug = encodeURIComponent(listing.id);
  u.searchParams.set("to", `/listing/${listingSlug}`);
  return u.toString();
}

/**
 * 1×1 open-tracking pixel URL. Inline in the HTML body so Gmail /
 * Apple Mail image-caching makes a GET that we log as
 * listing_alert_opened.
 */
function openPixelUrl(base: string, savedSearchId: string): string {
  const u = new URL(`${base.replace(/\/$/, "")}/api/alerts/opened`);
  u.searchParams.set("s", savedSearchId);
  return u.toString();
}

export async function sendListingAlertDigest(opts: SendDigestOpts): Promise<{ id?: string } | undefined> {
  const { to, contactFirstName, savedSearchId, savedSearchName, listings, publicBaseUrl } = opts;
  const greeting = contactFirstName ? `Hi ${contactFirstName},` : "Hi there,";
  const countLabel = listings.length === 1 ? "1 new listing" : `${listings.length} new listings`;

  // Plain-text body — primary for spam filter signal + Gmail snippet.
  const textLines: string[] = [];
  textLines.push(greeting);
  textLines.push("");
  textLines.push(`${countLabel} matched your saved search "${savedSearchName}":`);
  textLines.push("");
  for (const l of listings) {
    textLines.push(`- ${money(l.price)} — ${l.address}`);
    const meta = bedsBaths(l);
    if (meta) textLines.push(`  ${meta}`);
    textLines.push(`  ${clickUrl(publicBaseUrl, savedSearchId, l)}`);
    textLines.push("");
  }
  textLines.push("To pause or update this search, visit your account:");
  textLines.push(`${publicBaseUrl.replace(/\/$/, "")}/account/saved-searches`);
  const text = textLines.join("\n");

  // HTML — simple, email-client safe. No external stylesheets, inline
  // styles only, no <img> for listing photos if missing (keeps the
  // email light and avoids broken-image squares).
  const listingCards = listings
    .map((l) => {
      const url = clickUrl(publicBaseUrl, savedSearchId, l);
      const metaLine = bedsBaths(l);
      const photo = l.photoUrl
        ? `<td width="120" style="padding-right:14px;vertical-align:top;"><a href="${url}" style="text-decoration:none;"><img src="${l.photoUrl}" width="120" height="90" alt="" style="display:block;border-radius:6px;object-fit:cover;"/></a></td>`
        : "";
      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee;">
            <table width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
              ${photo}
              <td style="vertical-align:top;">
                <div style="font-size:18px;font-weight:600;color:#0f172a;">
                  <a href="${url}" style="color:#0f172a;text-decoration:none;">${money(l.price)} — ${l.address}</a>
                </div>
                ${metaLine ? `<div style="font-size:13px;color:#475569;margin-top:4px;">${metaLine}</div>` : ""}
                <div style="margin-top:8px;">
                  <a href="${url}" style="font-size:12px;color:#0066b3;text-decoration:none;">View details &rarr;</a>
                </div>
              </td>
            </tr></table>
          </td>
        </tr>`;
    })
    .join("");

  const html = `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellspacing="0" cellpadding="0" border="0" style="background:white;border-radius:12px;padding:24px;max-width:600px;">
        <tr><td>
          <div style="font-size:14px;color:#64748b;">${greeting}</div>
          <h1 style="font-size:20px;color:#0f172a;margin:12px 0 4px;">${countLabel} for your search</h1>
          <div style="font-size:14px;color:#475569;">"${savedSearchName}"</div>
          <table width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px;">
            ${listingCards}
          </table>
          <div style="margin-top:20px;font-size:12px;color:#94a3b8;">
            You received this because you saved this search on PropertyTools AI.
            <a href="${publicBaseUrl.replace(/\/$/, "")}/account/saved-searches" style="color:#0066b3;text-decoration:none;">Manage your saved searches</a>.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
  <img src="${openPixelUrl(publicBaseUrl, savedSearchId)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;"/>
</body></html>
`.trim();

  // Append the agent's signature to both text + HTML bodies when the
  // saved search has a known owner. Silent no-op if agentId is missing
  // (unassigned search) or the profile can't be loaded.
  let finalText = text;
  let finalHtml = html;
  if (opts.agentId != null) {
    const sigProfile = await loadAgentSignatureProfile(opts.agentId);
    if (sigProfile) {
      const sig = composeSignature(sigProfile);
      finalText = appendTextSignature(text, sig);
      finalHtml = appendHtmlSignature(html, sig);
    }
  }

  return sendEmail({
    to,
    subject: `${countLabel} for "${savedSearchName}"`,
    text: finalText,
    html: finalHtml,
  });
}
