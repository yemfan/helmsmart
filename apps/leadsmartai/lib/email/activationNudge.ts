import { sendEmail } from "@/lib/email";

const DASHBOARD_URL = "https://www.realtybossai.com/dashboard";

/** Absolute URL for a checklist step's action (internal path or external link). */
function stepUrl(href?: string): string {
  if (!href) return DASHBOARD_URL;
  if (/^https?:\/\//i.test(href)) return href;
  return `https://www.realtybossai.com${href}`;
}

/**
 * Nudge email for an agent who signed up but hasn't finished setup. Focuses on
 * the single next step, framed as Boss checking in — mirrors the in-app Boss
 * onboarding conversation so the voice is consistent across channels.
 */
export async function sendActivationNudgeEmail(params: {
  to: string;
  name: string;
  nextStepTitle: string;
  nextStepDescription: string;
  nextStepHref?: string;
  doneCount: number;
  total: number;
}) {
  const firstName = params.name.trim().split(/\s+/)[0] || "there";
  const url = stepUrl(params.nextStepHref);
  const subject = `${firstName}, your AI team is ready — one quick step to go`;

  const text = [
    `Hi ${firstName},`,
    "",
    "It's Boss, your AI chief of staff at RealtyBoss. Your account is set up, but your AI team is still waiting on you to get going.",
    "",
    `You're ${params.doneCount} of ${params.total} steps in. Next up: ${params.nextStepTitle}.`,
    params.nextStepDescription,
    "",
    `Do it here: ${url}`,
    "",
    "Once this is done, your team can start answering calls, following up with leads, and booking appointments for you — automatically.",
    "",
    "Reply to this email if you'd like a hand.",
    "",
    "— Boss, RealtyBoss",
  ].join("\n");

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;color:#0f172a;">
    <p style="font-size:15px;">Hi ${firstName},</p>
    <p style="font-size:15px;line-height:1.5;">It's <strong>Boss</strong>, your AI chief of staff at RealtyBoss. Your account is set up, but your AI team is still waiting on you to get going.</p>
    <p style="font-size:13px;color:#64748b;margin-bottom:4px;">You're ${params.doneCount} of ${params.total} steps in. Next up:</p>
    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:8px 0 20px;">
      <p style="font-size:15px;font-weight:600;margin:0 0 6px;">${params.nextStepTitle}</p>
      <p style="font-size:13px;color:#475569;line-height:1.5;margin:0 0 14px;">${params.nextStepDescription}</p>
      <a href="${url}" style="display:inline-block;background:#0f172a;color:#fff;font-size:13px;font-weight:600;padding:10px 20px;border-radius:8px;text-decoration:none;">Do it now</a>
    </div>
    <p style="font-size:13px;color:#475569;line-height:1.5;">Once this is done, your team can start answering calls, following up with leads, and booking appointments for you — automatically.</p>
    <p style="font-size:13px;color:#94a3b8;">Reply to this email if you'd like a hand.<br/>— Boss, RealtyBoss</p>
  </div>`;

  return sendEmail({ to: params.to, subject, text, html });
}
