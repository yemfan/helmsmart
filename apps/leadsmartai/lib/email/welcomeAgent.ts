import { sendEmail } from "@/lib/email";

/**
 * Mobile app store URLs. The iOS App Store and Google Play URLs
 * link to the EAS-published LeadSmart AI app. If the app isn't
 * published on one platform yet, that link falls back to the
 * dashboard URL so agents don't hit a 404.
 *
 * IMPORTANT: Update these when each store listing goes live.
 * The bundle ID is `ai.leadsmart.mobile` on both platforms
 * (defined in `apps/leadsmart-mobile/app.json`).
 */
const DASHBOARD_URL = "https://www.closebossai.com/dashboard";
const APP_STORE_URL =
  process.env.LEADSMART_IOS_APP_STORE_URL?.trim() || DASHBOARD_URL;
const PLAY_STORE_URL =
  process.env.LEADSMART_ANDROID_PLAY_STORE_URL?.trim() || DASHBOARD_URL;

export async function sendAgentWelcomeEmail(params: {
  to: string;
  name: string;
}) {
  const firstName = params.name.trim().split(/\s+/)[0] || "there";

  const subject = "Welcome to LeadSmart AI — Get the Mobile App";

  const text = [
    `Hi ${firstName},`,
    "",
    "Welcome to LeadSmart AI! Your account is ready.",
    "",
    "Install the mobile app to get real-time lead alerts, respond to leads on the go, and never miss an opportunity:",
    "",
    `iOS: ${APP_STORE_URL}`,
    `Android: ${PLAY_STORE_URL}`,
    "",
    "What you can do right now:",
    "1. Check your dashboard for incoming leads",
    "2. Set up your AI assistant's tone and language",
    "3. Add your service areas so we match you with local leads",
    "4. Enable push notifications so you never miss a hot lead",
    "",
    `Go to your dashboard: ${DASHBOARD_URL}`,
    "",
    "Questions? Just reply to this email.",
    "",
    "— The LeadSmart AI Team",
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:32px;">
      <h1 style="font-size:22px;font-weight:700;color:#0f172a;margin:0 0 6px;">Welcome to LeadSmart AI</h1>
      <p style="font-size:14px;color:#64748b;margin:0 0 24px;">Your account is ready, ${firstName}.</p>

      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:20px;margin-bottom:24px;">
        <p style="font-size:15px;font-weight:600;color:#1e40af;margin:0 0 8px;">Get the Mobile App</p>
        <p style="font-size:13px;color:#3b82f6;margin:0 0 16px;">Respond to leads instantly, get push alerts for hot leads, and manage your pipeline from anywhere.</p>
        <div>
          <a href="${APP_STORE_URL}" style="display:inline-block;background:#0f172a;color:#fff;font-size:13px;font-weight:600;padding:10px 20px;border-radius:8px;text-decoration:none;margin-right:8px;">
            Download for iOS
          </a>
          <a href="${PLAY_STORE_URL}" style="display:inline-block;background:#0f172a;color:#fff;font-size:13px;font-weight:600;padding:10px 20px;border-radius:8px;text-decoration:none;">
            Download for Android
          </a>
        </div>
      </div>

      <p style="font-size:14px;font-weight:600;color:#334155;margin:0 0 12px;">Get started:</p>
      <table style="width:100%;font-size:13px;color:#475569;line-height:1.7;" cellpadding="0" cellspacing="0">
        <tr><td style="padding:4px 0;">1.</td><td style="padding:4px 8px;">Check your <a href="${DASHBOARD_URL}" style="color:#2563eb;text-decoration:none;font-weight:500;">dashboard</a> for incoming leads</td></tr>
        <tr><td style="padding:4px 0;">2.</td><td style="padding:4px 8px;">Set up your AI assistant's tone and language</td></tr>
        <tr><td style="padding:4px 0;">3.</td><td style="padding:4px 8px;">Add service areas so we match you with local leads</td></tr>
        <tr><td style="padding:4px 0;">4.</td><td style="padding:4px 8px;">Enable push notifications for hot lead alerts</td></tr>
      </table>

      <div style="margin-top:24px;">
        <a href="${DASHBOARD_URL}" style="display:inline-block;background:#2563eb;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;">
          Go to Dashboard
        </a>
      </div>
    </div>

    <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:24px;">
      LeadSmart AI &middot; <a href="https://www.closebossai.com" style="color:#94a3b8;">closebossai.com</a>
    </p>
  </div>
</body>
</html>`.trim();

  return sendEmail({ to: params.to, subject, text, html });
}
