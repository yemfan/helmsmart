import type { Attention, MarketingRow } from "./marketing";

/**
 * Nudges — the pure half: who gets one, and what it says.
 *
 * A nudge is the broker's one click on an attention reason turned into one
 * short email per agent in that bucket. It says what is missing, why it
 * matters to the agent (not to the broker), and the one link that fixes it.
 * Each agent hears about a given reason at most once a week; a broker who
 * clicks twice on Tuesday does not send twice.
 */

export const NUDGE_COOLDOWN_DAYS = 7;
/** Upper bound per click, so one action stays inside a request. */
export const NUDGE_MAX_PER_CLICK = 500;

export type NudgePlan = {
  to: MarketingRow[];
  /** In the bucket, nudged about this reason within the cooldown. */
  skippedRecent: number;
  /** In the bucket, but we have no email for them. */
  noEmail: number;
};

export function planNudges(rows: readonly MarketingRow[], reason: Attention, recentlyNudged: ReadonlySet<string>): NudgePlan {
  const plan: NudgePlan = { to: [], skippedRecent: 0, noEmail: 0 };
  for (const r of rows) {
    if (!r.attention.includes(reason)) continue;
    if (recentlyNudged.has(r.agentId)) plan.skippedRecent += 1;
    else if (!r.email) plan.noEmail += 1;
    else if (plan.to.length < NUDGE_MAX_PER_CLICK) plan.to.push(r);
  }
  return plan;
}

export type NudgeContext = {
  /** The agent's first name, or null for a plain greeting. */
  first: string | null;
  /** Who is asking: the broker or manager's name, or null. */
  from: string | null;
  /** The brokerage name from the team brand, else the team name. */
  brokerage: string;
  /** Site origin for links, no trailing slash. */
  origin: string;
};

export type NudgeMessage = { subject: string; text: string; html: string };

const LINKS: Record<Attention, string> = {
  no_hub: "/dashboard/hub/editor",
  no_network: "/dashboard/leads/generate/connect",
  no_tracking: "/dashboard/hub/editor",
  failing: "/dashboard/leads/generate/scheduled",
  silent: "/dashboard/leads/generate",
};

const COPY: Record<Attention, { subject: string; lead: string; why: string; cta: string }> = {
  no_hub: {
    subject: "Your lead page is one click from live",
    lead: "Your CloseBoss lead page — your own address where buyers and sellers find you, ask questions and leave their number — is not published yet.",
    why: "Every post, ad and business card at {{brokerage}} can point at it, and the leads it collects are yours.",
    cta: "Publish your lead page",
  },
  no_network: {
    subject: "Connect a network and let the assistant post for you",
    lead: "None of your social accounts is connected to CloseBoss yet, so the marketing assistant has nowhere to post.",
    why: "Connect Facebook, Instagram, TikTok or LinkedIn once and it can keep your pages active every week without you writing a word.",
    cta: "Connect a network",
  },
  no_tracking: {
    subject: "See who visits your lead page",
    lead: "Your lead page is live, but it has no analytics or pixel on it, so you cannot see who visits or retarget them.",
    why: "Adding your GA4 measurement ID or Meta Pixel takes a minute in the page editor and works from then on.",
    cta: "Add tracking",
  },
  failing: {
    subject: "Some of your scheduled posts did not go out",
    lead: "One or more of your scheduled posts failed to publish. Usually a network needs reconnecting, or a post needs a quick edit.",
    why: "Your queue keeps running once it is fixed; until then those slots stay empty.",
    cta: "Check your queue",
  },
  silent: {
    subject: "Your networks are connected, but nothing is going out",
    lead: "Your social accounts are connected, but no post has gone out and nothing is scheduled.",
    why: "Turn the marketing assistant on, or queue a few posts, and your pages stay active while you work.",
    cta: "Schedule posts",
  },
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function nudgeMessage(reason: Attention, ctx: NudgeContext): NudgeMessage {
  const c = COPY[reason];
  const url = `${ctx.origin}${LINKS[reason]}`;
  const why = c.why.replace("{{brokerage}}", ctx.brokerage);
  const hi = ctx.first ? `Hi ${ctx.first},` : "Hi,";
  const sign = ctx.from ? `${ctx.from}\n${ctx.brokerage}` : ctx.brokerage;
  const text = [hi, "", c.lead, "", why, "", `${c.cta}: ${url}`, "", sign].join("\n");
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">
      <p>${esc(hi)}</p>
      <p>${esc(c.lead)}</p>
      <p>${esc(why)}</p>
      <p style="margin:24px 0"><a href="${url}" style="background:#0072ce;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">${esc(c.cta)}</a></p>
      <p style="color:#475569;font-size:13px">${esc(ctx.from ?? "")}${ctx.from ? "<br>" : ""}${esc(ctx.brokerage)}</p>
      <p style="color:#94a3b8;font-size:12px">Or paste this into your browser: ${url}</p>
    </div>`;
  return { subject: c.subject, text, html };
}
