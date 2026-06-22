import "server-only";

import { sendEmail } from "@/lib/email";
import {
  appendHtmlSignature,
  appendTextSignature,
  composeSignature,
} from "@/lib/signatures/compose";
import { loadAgentSignatureProfile } from "@/lib/signatures/loadProfile";
import type { HouseListing } from "./types";

/**
 * Emails a buyer the homes surfaced by AI House Search. Plain-text +
 * email-client-safe HTML, signed with the sending agent's signature
 * block (silent no-op if no profile). No tracking pixels — this is a
 * one-off agent-initiated send, not an automated digest.
 */

export type SendBuyerListingsOpts = {
  to: string;
  buyerFirstName: string | null;
  listings: HouseListing[];
  /** The buyer's brief, echoed so the email has context. */
  query: string;
  agentId?: string | number | null;
  /** Optional agent note prepended above the listings. */
  note?: string | null;
};

function money(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "Price on request";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toFixed(0)}`;
}

function metaLine(l: HouseListing): string {
  const parts: string[] = [];
  if (l.beds != null) parts.push(`${l.beds} bd`);
  if (l.baths != null) parts.push(`${l.baths} ba`);
  if (l.sqft) parts.push(`${l.sqft.toLocaleString()} sqft`);
  if (l.propertyType) parts.push(l.propertyType);
  return parts.join(" · ");
}

export async function sendBuyerListings(
  opts: SendBuyerListingsOpts,
): Promise<{ id?: string } | undefined> {
  const { to, buyerFirstName, listings, query } = opts;
  const greeting = buyerFirstName ? `Hi ${buyerFirstName},` : "Hi there,";
  const count = listings.length === 1 ? "1 home" : `${listings.length} homes`;

  // ── Plain text ──
  const textLines: string[] = [greeting, ""];
  if (opts.note?.trim()) {
    textLines.push(opts.note.trim(), "");
  }
  textLines.push(`Here ${listings.length === 1 ? "is" : "are"} ${count} I found for you${query ? ` (${query})` : ""}:`, "");
  for (const l of listings) {
    textLines.push(`- ${money(l.price)} — ${l.address}`);
    const m = metaLine(l);
    if (m) textLines.push(`  ${m}`);
    if (l.matchReason) textLines.push(`  ${l.matchReason}`);
    if (l.listingUrl) textLines.push(`  ${l.listingUrl}`);
    textLines.push("");
  }
  const text = textLines.join("\n");

  // ── HTML ──
  const cards = listings
    .map((l) => {
      const m = metaLine(l);
      const title = l.listingUrl
        ? `<a href="${l.listingUrl}" style="color:#0f172a;text-decoration:none;">${money(l.price)} — ${escapeHtml(l.address)}</a>`
        : `${money(l.price)} — ${escapeHtml(l.address)}`;
      const cta = l.listingUrl
        ? `<div style="margin-top:8px;"><a href="${l.listingUrl}" style="font-size:12px;color:#047857;text-decoration:none;">View listing &rarr;</a></div>`
        : "";
      return `
        <tr><td style="padding:12px 0;border-bottom:1px solid #eee;">
          <div style="font-size:17px;font-weight:600;color:#0f172a;">${title}</div>
          ${m ? `<div style="font-size:13px;color:#475569;margin-top:4px;">${escapeHtml(m)}</div>` : ""}
          ${l.matchReason ? `<div style="font-size:13px;color:#64748b;margin-top:4px;">${escapeHtml(l.matchReason)}</div>` : ""}
          ${cta}
        </td></tr>`;
    })
    .join("");

  const note = opts.note?.trim()
    ? `<div style="font-size:14px;color:#334155;margin:12px 0;">${escapeHtml(opts.note.trim())}</div>`
    : "";

  const html = `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellspacing="0" cellpadding="0" border="0" style="background:white;border-radius:12px;padding:24px;max-width:600px;">
        <tr><td>
          <div style="font-size:14px;color:#64748b;">${greeting}</div>
          <h1 style="font-size:20px;color:#0f172a;margin:12px 0 4px;">${count} for you to consider</h1>
          ${query ? `<div style="font-size:13px;color:#94a3b8;">${escapeHtml(query)}</div>` : ""}
          ${note}
          <table width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:16px;">
            ${cards}
          </table>
          <div style="margin-top:20px;font-size:12px;color:#94a3b8;">Reply to this email with any you'd like to tour.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
`.trim();

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
    subject: `${count} that match what you're looking for`,
    text: finalText,
    html: finalHtml,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
