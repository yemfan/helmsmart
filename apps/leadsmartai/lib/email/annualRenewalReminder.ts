import { sendEmail } from "@/lib/email";
import { PLANS, type PlanSlug } from "@/lib/billing/plans";

const DASHBOARD_BILLING_URL = "https://www.closebossai.com/dashboard/billing";

function formatRenewalDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/**
 * 30-day annual renewal reminder. Required by California BPC §17602
 * and New York GBL §527-a for any auto-renewing subscription
 * exceeding one year — we send to every annual subscriber regardless
 * of state because (a) we don't reliably know the billing-address
 * state and (b) over-disclosure is harmless.
 *
 * The reminder must surface:
 *   - The renewal date
 *   - The amount that will be charged
 *   - A clear path to cancel before renewal
 *
 * Subject line must say "auto-renewal" — not buried in body text.
 */
export async function sendAnnualRenewalReminderEmail(params: {
  to: string;
  firstName: string;
  planSlug: PlanSlug;
  renewalDateIso: string;
}) {
  const plan = PLANS[params.planSlug];
  const renewAmount = plan.annualPrice ?? 0;
  const niceDate = formatRenewalDate(params.renewalDateIso);
  const niceAmount = formatUsd(renewAmount);
  const firstName = params.firstName.trim().split(/\s+/)[0] || "there";

  const subject = `Auto-renewal reminder: ${plan.displayName} renews ${niceDate}`;

  const text = [
    `Hi ${firstName},`,
    "",
    `Your LeadSmart AI ${plan.displayName} (annual) subscription is set to auto-renew on ${niceDate}.`,
    "",
    `You will be charged ${niceAmount} on that date unless you cancel before then.`,
    "",
    "Manage your subscription, switch cadence, or cancel auto-renewal:",
    DASHBOARD_BILLING_URL,
    "",
    "Nothing you need to do if you'd like to continue — your subscription will renew automatically.",
    "",
    "— The LeadSmart AI Team",
    "",
    "---",
    "You received this required reminder because you have an annual auto-renewing subscription.",
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:32px;">
      <h1 style="font-size:22px;font-weight:700;color:#0f172a;margin:0 0 6px;">Annual auto-renewal in 30 days</h1>
      <p style="font-size:14px;color:#64748b;margin:0 0 24px;">Hi ${firstName},</p>

      <p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 16px;">
        Your <strong>${plan.displayName} (annual)</strong> subscription auto-renews on
        <strong>${niceDate}</strong>. You'll be charged <strong>${niceAmount}</strong> on
        that date unless you cancel before then.
      </p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:20px 0;">
        <table style="width:100%;font-size:13px;color:#475569;line-height:1.7;" cellpadding="0" cellspacing="0">
          <tr><td style="padding:2px 0;width:140px;color:#64748b;">Plan</td><td style="font-weight:600;color:#0f172a;">${plan.displayName}</td></tr>
          <tr><td style="padding:2px 0;color:#64748b;">Cadence</td><td style="font-weight:600;color:#0f172a;">Annual</td></tr>
          <tr><td style="padding:2px 0;color:#64748b;">Renews on</td><td style="font-weight:600;color:#0f172a;">${niceDate}</td></tr>
          <tr><td style="padding:2px 0;color:#64748b;">Amount</td><td style="font-weight:600;color:#0f172a;">${niceAmount}</td></tr>
        </table>
      </div>

      <p style="font-size:14px;color:#334155;line-height:1.6;margin:0 0 20px;">
        Nothing to do if you'd like to continue — your subscription will renew automatically.
        Want to cancel, switch to monthly, or change your plan?
      </p>

      <div>
        <a href="${DASHBOARD_BILLING_URL}" style="display:inline-block;background:#2563eb;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;">
          Manage subscription
        </a>
      </div>
    </div>

    <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:24px;line-height:1.5;">
      You received this required reminder because you have an annual auto-renewing subscription.
      <br>LeadSmart AI &middot; <a href="https://www.closebossai.com" style="color:#94a3b8;">closebossai.com</a>
    </p>
  </div>
</body>
</html>`.trim();

  return sendEmail({ to: params.to, subject, text, html });
}
