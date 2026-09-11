/**
 * The "you're on this team" email — the pure half.
 *
 * Sent once per membership, however it was created (accepted invitation or a
 * direct add), never to the owner. It names the team, says what is on the
 * team page, links straight to it, and when the brokerage still needs the
 * agent's license, links to that too. Replies go to the team owner.
 */

export type MemberWelcomeInput = {
  first: string | null;
  /** The brokerage's name from its brand, else the team's name. */
  teamName: string;
  role: "member" | "manager";
  /** True when no license is on file for this agent yet. */
  needsLicense: boolean;
  /** The owner's name, for the reply line; null leaves the line generic. */
  ownerName: string | null;
  /** Site origin, no trailing slash. */
  origin: string;
};

export type MemberWelcomeEmail = { subject: string; text: string; html: string };

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export function memberWelcomeEmail(input: MemberWelcomeInput): MemberWelcomeEmail {
  const teamUrl = `${input.origin}/dashboard/team`;
  const licenseUrl = `${input.origin}/dashboard/team/license`;
  const hi = input.first ? `Hi ${input.first},` : "Hi,";
  const subject = `You're on ${input.teamName} on CloseBoss`;
  const lead = `You've been added to ${input.teamName} on CloseBoss.`;
  const what = "Your team page has the office billboard, the office board for listings and buyer needs, referrals, and the brokerage's approved library.";
  const manager = input.role === "manager" ? "You're a manager: you can invite agents, post to the billboard and run the team's onboarding." : null;
  const license = input.needsLicense ? `${input.teamName} needs your real estate license on file. It goes on every post you publish and on your lead page.` : null;
  const reply = input.ownerName ? `Questions? Reply to this email and it goes to ${input.ownerName}.` : "Questions? Reply to this email.";

  const text = [
    hi,
    "",
    lead,
    "",
    what,
    ...(manager ? ["", manager] : []),
    "",
    `Open your team: ${teamUrl}`,
    ...(license ? ["", license, `Add your license: ${licenseUrl}`] : []),
    "",
    reply,
  ].join("\n");

  const button = (href: string, label: string, primary: boolean) =>
    `<a href="${href}" style="${primary ? "background:#0072ce;color:#fff;" : "background:#fff;color:#0072ce;border:1px solid #0072ce;"}text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">${esc(label)}</a>`;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">
      <p>${esc(hi)}</p>
      <p>You've been added to <strong>${esc(input.teamName)}</strong> on CloseBoss.</p>
      <p>${esc(what)}</p>
      ${manager ? `<p>${esc(manager)}</p>` : ""}
      <p style="margin:24px 0">${button(teamUrl, "Open your team", true)}</p>
      ${license ? `<p>${esc(license)}</p><p style="margin:16px 0 24px 0">${button(licenseUrl, "Add your license", false)}</p>` : ""}
      <p style="color:#475569;font-size:13px">${esc(reply)}</p>
      <p style="color:#94a3b8;font-size:12px">Or paste this into your browser: ${teamUrl}</p>
    </div>`;

  return { subject, text, html };
}

/** Which rows the cron may send: queued, not an owner, recent, not given up on. */
export const WELCOME_MAX_ATTEMPTS = 3;
export const WELCOME_MAX_AGE_DAYS = 14;
