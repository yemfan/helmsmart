/**
 * Compliance audit of what the team published — the pure half.
 *
 * A broker is liable for every agent's advertising. This reads each post
 * that went out in the window and names, with a quote, what a compliance
 * reviewer would circle:
 *
 *   fair_housing        wording HUD's advertising guidance warns about —
 *                       exclusions ("no children", "adults only") and
 *                       descriptors that select for a protected class
 *   outcome_promise     guarantees ("guaranteed sale", "will sell in 30 days")
 *   unsupported_claim   "#1 agent", "best team", "lowest commission" with
 *                       nothing behind it
 *   missing_brokerage   the brokerage name (and license, where given) appears
 *                       nowhere in the ad, where the brokerage requires it
 *   flagged_by_review   the pre-publish claim review flagged it and it went
 *                       out anyway
 *
 * Deterministic on purpose: the same posts produce the same audit, a broker
 * can point at the exact words, and 1,200 agents' posts cost nothing to
 * check. It is an audit, not a gate — a person decides what to do about
 * each line. The reading lives in audit.server.ts.
 */

export type AuditKind = "fair_housing" | "outcome_promise" | "unsupported_claim" | "missing_brokerage" | "flagged_by_review";
export type AuditSeverity = "high" | "medium" | "low";

export const AUDIT_KINDS: readonly AuditKind[] = ["fair_housing", "outcome_promise", "unsupported_claim", "missing_brokerage", "flagged_by_review"];

export const SEVERITY: Record<AuditKind, AuditSeverity> = {
  fair_housing: "high",
  outcome_promise: "high",
  flagged_by_review: "medium",
  unsupported_claim: "medium",
  missing_brokerage: "low",
};

export type AuditPost = {
  id: string;
  agentId: string;
  platform: string | null;
  caption: string;
  url: string | null;
  publishedAt: string | null;
};

export type AuditFinding = {
  postId: string;
  agentId: string;
  platform: string | null;
  url: string | null;
  publishedAt: string | null;
  kind: AuditKind;
  severity: AuditSeverity;
  /** The words at issue, short. */
  quote: string;
};

export type AuditContext = {
  brokerageName: string | null;
  license: string | null;
};

export type AuditReport = {
  postsReviewed: number;
  findings: AuditFinding[];
  byKind: Partial<Record<AuditKind, number>>;
  /** Agents with at least one finding. */
  agentsFlagged: number;
  postsFlagged: number;
};

// Exclusions and selections HUD's Fair Housing advertising guidance names
// or that courts have treated as steering. Word boundaries keep "adult
// education" and "single-family" out of it.
const FAIR_HOUSING: RegExp[] = [
  /\bno (?:children|kids|minors)\b/i,
  /\b(?:adults?|singles?|couples?|professionals?|students?) only\b/i,
  /\bno (?:section ?8|vouchers?|students|families)\b/i,
  /\b(?:christian|catholic|jewish|muslim|hindu) (?:family|home|community|neighbou?rhood)\b/i,
  /\b(?:white|black|asian|hispanic|latino|chinese|indian) (?:neighbou?rhood|community|area|family)\b/i,
  /\b(?:ideal|perfect|great) for (?:young )?(?:families|couples|singles|professionals|empty nesters|retirees)\b/i,
  /\bempty[- ]nesters?\b/i,
  /\bmature (?:persons?|adults?|couples?|community)\b/i,
  /\b(?:able[- ]bodied|no wheelchairs?)\b/i,
  /\b(?:exclusive|restricted|private) (?:neighbou?rhood|community)\b/i,
  /\bintegrated\b/i,
  /\bnear (?:a |the )?(?:church|mosque|synagogue|temple)\b/i,
];

const OUTCOME: RegExp[] = [
  /\bguarantee[ds]?\b/i,
  /\bwill (?:sell|close)(?: your home)? (?:in|within) \d+\b/i,
  /\bsold in \d+ days\b/i,
  /\brisk[- ]free\b/i,
  /\bno risk\b/i,
  /\b(?:can't|cannot|won't) lose\b/i,
  /\bwill (?:double|triple)\b/i,
];

const UNSUPPORTED: RegExp[] = [
  /(?:^|[^\w#])#\s?1\b/i,
  /\bnumber one\b/i,
  /\bbest (?:agent|realtor|broker|team|brokerage|in town|in the (?:city|area|valley|county))\b/i,
  /\btop (?:agent|producer|realtor|broker)\b/i,
  /\blowest (?:commission|fees?|rates?)\b/i,
  /\bhighest (?:price|offer)s?\b/i,
  /\bfastest (?:sale|closing)s?\b/i,
];

function quoteOf(text: string, m: RegExpExecArray): string {
  const start = Math.max(0, m.index - 20);
  const end = Math.min(text.length, m.index + m[0].length + 20);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

function firstHit(text: string, rules: RegExp[]): RegExpExecArray | null {
  for (const re of rules) {
    const m = re.exec(text);
    if (m) return m;
  }
  return null;
}

export function auditCaption(post: AuditPost, ctx: AuditContext): AuditFinding[] {
  const text = post.caption ?? "";
  const out: AuditFinding[] = [];
  const add = (kind: AuditKind, quote: string) =>
    out.push({ postId: post.id, agentId: post.agentId, platform: post.platform, url: post.url, publishedAt: post.publishedAt, kind, severity: SEVERITY[kind], quote });

  const fh = firstHit(text, FAIR_HOUSING);
  if (fh) add("fair_housing", quoteOf(text, fh));
  const oc = firstHit(text, OUTCOME);
  if (oc) add("outcome_promise", quoteOf(text, oc));
  const un = firstHit(text, UNSUPPORTED);
  if (un) add("unsupported_claim", quoteOf(text, un));

  // Brokerage identification: only where the brokerage set a name, and only
  // for a post long enough to be an advertisement rather than a caption.
  const name = ctx.brokerageName?.trim();
  if (name && text.length >= 80) {
    const lower = text.toLowerCase();
    const hasName = lower.includes(name.toLowerCase());
    const hasLicense = ctx.license ? lower.includes(ctx.license.toLowerCase()) : false;
    if (!hasName && !hasLicense) add("missing_brokerage", name);
  }
  return out;
}

export type AuditDirectory = Record<string, { name: string | null; email: string | null }>;

/** One stored run, as the page shows it. */
export type StoredAudit = {
  id: string;
  ranAt: string;
  ranBy: string;
  days: number;
  report: AuditReport;
  /** Names for the agent ids in the findings, resolved at read time. */
  directory: AuditDirectory;
};

export type ReviewFlag = { postId: string; agentId: string; platform: string | null; url: string | null; publishedAt: string | null; issue: string };

export function buildAuditReport(posts: readonly AuditPost[], reviewFlags: readonly ReviewFlag[], ctx: AuditContext): AuditReport {
  const findings: AuditFinding[] = [];
  for (const p of posts) findings.push(...auditCaption(p, ctx));
  for (const f of reviewFlags) {
    findings.push({ postId: f.postId, agentId: f.agentId, platform: f.platform, url: f.url, publishedAt: f.publishedAt, kind: "flagged_by_review", severity: SEVERITY.flagged_by_review, quote: f.issue });
  }
  const order: Record<AuditSeverity, number> = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));

  const byKind: AuditReport["byKind"] = {};
  const agents = new Set<string>();
  const flaggedPosts = new Set<string>();
  for (const f of findings) {
    byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
    agents.add(f.agentId);
    flaggedPosts.add(f.postId);
  }
  return { postsReviewed: posts.length, findings, byKind, agentsFlagged: agents.size, postsFlagged: flaggedPosts.size };
}
