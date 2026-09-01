import { EMAIL_BRAND } from "@/lib/email";
/**
 * Pure renderers for offer-expiration alert messages. Both kinds of
 * offer share the same template shape; only the perspective language
 * differs (seller-side vs buyer-side).
 */

export type AlertInput = {
  offerKind: "buyer" | "listing";
  alertLevel: "warning" | "final";
  propertyAddress: string;
  counterpartyLabel: string | null; // buyer name OR buyer-agent for listing-side
  offerPrice: number;
  expiresAtIso: string;
  hoursUntilExpiration: number;
  appBaseUrl: string;
  offerUrl: string; // deep-link to the offer detail page
  /** Optional one-click extend URL (/offer-extend/<signed-token>). When
      present, an Extend button is rendered alongside Open offer. */
  extendUrl?: string | null;
  /** Hours this extend link will add. Shown on the button label. */
  extendHours?: number;
};

export function renderAlertEmail(input: AlertInput): {
  subject: string;
  html: string;
  text: string;
} {
  const headline = buildHeadline(input);
  const whenPhrase = buildWhenPhrase(input);
  const perspectiveLine = buildPerspectiveLine(input);

  const subject =
    input.alertLevel === "final"
      ? `⚠️ Final alert: offer expires in ${Math.max(1, Math.round(input.hoursUntilExpiration))}h — ${input.propertyAddress}`
      : `Offer expiring ${whenPhrase} — ${input.propertyAddress}`;

  const fullUrl = `${input.appBaseUrl}${input.offerUrl.startsWith("/") ? "" : "/"}${input.offerUrl}`;
  const priceLabel = formatMoney(input.offerPrice);
  const accent = input.alertLevel === "final" ? "#dc2626" : "#d97706";

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
    <div style="padding:14px 16px;background:${input.alertLevel === "final" ? "#fef2f2" : "#fef3c7"};border-left:4px solid ${accent};border-radius:10px;margin-bottom:20px;">
      <div style="font-size:11px;font-weight:700;color:${accent};letter-spacing:0.06em;text-transform:uppercase;">
        ${input.alertLevel === "final" ? "Final alert" : "Expiring soon"}
      </div>
      <div style="margin-top:4px;font-size:16px;font-weight:600;color:#0f172a;">
        ${escapeHtml(headline)}
      </div>
    </div>

    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;">
      <div style="font-size:14px;color:#334155;line-height:1.6;">
        ${escapeHtml(perspectiveLine)}
      </div>
      <dl style="margin-top:12px;font-size:14px;">
        ${renderDetailRow("Property", escapeHtml(input.propertyAddress))}
        ${input.counterpartyLabel ? renderDetailRow(input.offerKind === "buyer" ? "Your buyer" : "Offeror", escapeHtml(input.counterpartyLabel)) : ""}
        ${renderDetailRow("Offer price", priceLabel)}
        ${renderDetailRow("Expires", formatDateTime(input.expiresAtIso))}
      </dl>
      <div style="margin-top:16px;">
        <a href="${escapeHtml(fullUrl)}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#fff;font-size:14px;font-weight:600;border-radius:8px;text-decoration:none;margin-right:8px;">
          Open offer →
        </a>
        ${
          input.extendUrl
            ? `<a href="${escapeHtml(input.extendUrl)}" style="display:inline-block;padding:10px 18px;background:#10b981;color:#fff;font-size:14px;font-weight:600;border-radius:8px;text-decoration:none;">
              ⏰ Extend ${input.extendHours ?? 24}h
            </a>`
            : ""
        }
      </div>
      ${
        input.extendUrl
          ? `<p style="margin-top:12px;color:#64748b;font-size:11px;line-height:1.5;">
              Extend pushes the offer's expiration to ${(input.extendHours ?? 24)}h from now, no login needed. The link expires 72h after this email was sent and can only be used once.
            </p>`
          : ""
      }
    </div>

    <p style="margin-top:20px;color:#94a3b8;font-size:11px;">
      Offer-expiration alert. Sent 24h before expiration and again 2h before.
    </p>
  </div>
</body></html>`;

  const text = [
    input.alertLevel === "final" ? "FINAL ALERT — " + headline : headline,
    "",
    perspectiveLine,
    "",
    `Property: ${input.propertyAddress}`,
    input.counterpartyLabel
      ? `${input.offerKind === "buyer" ? "Buyer" : "Offeror"}: ${input.counterpartyLabel}`
      : "",
    `Offer price: ${priceLabel}`,
    `Expires: ${formatDateTime(input.expiresAtIso)}`,
    "",
    `Open offer: ${fullUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

export function renderAlertSms(input: AlertInput): string {
  const hours = Math.max(1, Math.round(input.hoursUntilExpiration));
  const priceLabel = formatMoney(input.offerPrice);
  const prefix = input.alertLevel === "final" ? "⚠️ FINAL ALERT:" : "⏰";
  const perspective =
    input.offerKind === "buyer"
      ? "your buyer's offer"
      : "the incoming offer";
  return (
    `${prefix} ${perspective} on ${input.propertyAddress} (${priceLabel}) expires in ${hours}h. ` +
    `Decide now or extend. ${EMAIL_BRAND}.`
  );
}

// ── helpers ──

function buildHeadline(input: AlertInput): string {
  const hours = Math.max(1, Math.round(input.hoursUntilExpiration));
  if (input.offerKind === "buyer") {
    return input.alertLevel === "final"
      ? `Your buyer's offer expires in ~${hours}h`
      : `Your buyer's offer on ${input.propertyAddress} expires tomorrow`;
  }
  return input.alertLevel === "final"
    ? `Incoming offer on ${input.propertyAddress} expires in ~${hours}h`
    : `An offer on ${input.propertyAddress} expires tomorrow`;
}

function buildWhenPhrase(input: AlertInput): string {
  const hours = Math.max(1, Math.round(input.hoursUntilExpiration));
  if (hours <= 24) return `in ${hours}h`;
  return "tomorrow";
}

function buildPerspectiveLine(input: AlertInput): string {
  if (input.offerKind === "buyer") {
    return input.alertLevel === "final"
      ? "Final countdown: your buyer's offer is about to expire. If the listing agent doesn't respond, we'll need to decide whether to extend or withdraw."
      : "Your buyer's offer is about to expire. Confirm with the listing agent whether they'll respond, or plan to extend.";
  }
  return input.alertLevel === "final"
    ? "Final countdown on this incoming offer. Respond with an acceptance or counter, or let it auto-expire."
    : "This incoming offer is about to expire. Review and counter/accept, or let the buyer know if you need more time.";
}

function renderDetailRow(label: string, value: string): string {
  return `
    <div style="display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid #f1f5f9;">
      <dt style="color:#64748b;">${label}</dt>
      <dd style="color:#0f172a;margin:0;"><strong>${value}</strong></dd>
    </div>`;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
