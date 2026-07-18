// AI fact-check of marketing copy against what the business actually does.
//
// Pure: builds the prompt, parses the reply, combines several reads. The app
// keeps the model wiring and feeds raw text through — same convention as
// campaigns.ts, and it keeps this package dependency-free.
//
// WHY THIS EXISTS: an LLM asked to write marketing about a product invents
// features. Two AI-written posts making false product claims reached a
// production content library before a human caught them. A third was caught by
// this checker. So was a false claim in HAND-WRITTEN copy that had shipped
// months earlier.
//
// THE SETTINGS BELOW ARE LOAD-BEARING. They were derived by measurement, not
// taste — see CLAIM_REVIEW_TEMPERATURE and CLAIM_REVIEW_SAMPLES.

/** What the business actually does. Per-tenant config — never hardcoded here. */
export type ProductFacts = {
  /** Everything the product genuinely does. The ONLY things copy may claim. */
  capabilities: string;
  /** Plausible-sounding things that are FALSE. Each entry should be earned. */
  notTrue: string;
};

export type ClaimIssue = {
  /** The exact words from the copy that make the unsupported claim. */
  quote: string;
  /** Why it isn't supported. */
  why: string;
};

export type ClaimReview = {
  verdict: "clean" | "flagged";
  issues: ClaimIssue[];
  /** Set when the check could not actually run — always paired with 'flagged'. */
  error?: string;
};

/**
 * A fact-check is a JUDGEMENT, not a generation — the same copy must get the
 * same verdict every time. Model APIs commonly default to temperature 1.0,
 * which is wrong for this: measured at the default, a known-false claim came
 * back clean on 1 of 30 reads.
 */
export const CLAIM_REVIEW_TEMPERATURE = 0;

/**
 * How many independent reads decide a post. ANY flag wins.
 *
 * Temperature 0 narrows the distribution but does not make an LLM
 * deterministic, and one sample of a stochastic judge is a coin flip you only
 * roll once. The costs are wildly asymmetric — a miss publishes a false claim
 * about your own business; a false alarm costs a human a few seconds — so the
 * tie-break is always "hold it". Any-veto across 3 reads turns a ~3% per-read
 * miss into ~0.003%.
 */
export const CLAIM_REVIEW_SAMPLES = 3;

/** Marketing copy about the business vs. cited third-party news. */
export type ClaimReviewKind = "product" | "news";

/**
 * Build the fact-check prompt. Returns { system, user } for the app to send.
 *
 * `kind: "news"` matters more than it looks. The rules are written for copy
 * ABOUT the business, where a dollar figure is almost always an invented claim.
 * Cited news is the opposite — specific figures are the point, and they came
 * from a source, not the model. Judging news by product rules flags a
 * legitimate post nearly every week, and a flag that is usually wrong is worse
 * than no flag: it teaches the reader to click through warnings without reading
 * them. Alarm fatigue quietly destroys the gate.
 */
export function buildClaimReviewPrompt(
  content: string,
  facts: ProductFacts,
  kind: ClaimReviewKind = "product",
): { system: string; user: string } {
  const system = `You are a fact-checker for a business's own marketing. A post is about to be published to its public feed. Your only job is to catch claims the business cannot actually back up.

THE COMPLETE LIST OF WHAT IT DOES. Nothing outside this list exists:
${facts.capabilities}

EXPLICITLY FALSE — these do not exist, flag any post that claims them:
${facts.notTrue}

HOW TO JUDGE:
- Try to REFUTE the post. You are not rating the writing, the tone, or whether it is persuasive. Only: does it assert something the list does not support?
- The most common failure is AUTONOMY INFLATION: a feature that runs WHEN ASKED described as one that "monitors", "watches", "runs in the background", "alerts you", or works "in real time". If the list does not say it happens on its own, claiming it does is FALSE.
- The second is INTEGRATION INFLATION: implying separate parts hand work to each other automatically, or that it integrates with systems it does not.
- Also flag: any statistic about the business or its users, pricing, competitor or franchise names, and guaranteed outcomes.
- Subjective claims about the INDUSTRY are fine ("most people don't have time to follow up"). Judge claims about THIS BUSINESS only.
- First-person history is fine ("I used to lose leads", "I built this because...") — it is not a product claim.
- WHEN IN DOUBT, FLAG IT. A false claim on your own feed is far more expensive than a human spending ten seconds approving a good post. Do not give the benefit of the doubt.

Return EXACTLY ONE fenced JSON code block and nothing after it:

\`\`\`json
{
  "verdict": "clean" | "flagged",
  "issues": [
    { "quote": "the exact words that overclaim", "why": "what the list actually says" }
  ]
}
\`\`\`

"issues" must be empty when the verdict is clean, and non-empty when flagged.`;

  const newsPreamble =
    kind === "news"
      ? `This post is CITED NEWS composed from a sourced digest — it is not marketing copy about the business. Specific figures (grant amounts, rates, prices, programme names, dates) are the POINT of this kind of post and are NOT violations; they came from a cited source, not from you. Judge ONLY whether it claims something about THIS BUSINESS that the list doesn't support. If the post doesn't mention the business at all, it is clean.\n\n`
      : "";

  return {
    system,
    user: `${newsPreamble}Fact-check this post against the list. Return the JSON block.\n\n---\n${content.trim()}\n---`,
  };
}

/**
 * Parse one model reply into a verdict.
 *
 * FAILS CLOSED on every ambiguous path — unparseable output, a missing verdict,
 * or a "clean" that still lists issues (a self-contradiction) all return
 * flagged. A checker that reports clean when it is actually broken is worse
 * than no checker, because it launders unreviewed copy as reviewed.
 */
export function parseClaimReview(text: string): ClaimReview {
  const parsed = text.trim() ? extractJson(text) : null;
  if (!parsed) {
    return { verdict: "flagged", issues: [], error: "unparseable checker output" };
  }

  const issues = normalizeIssues((parsed as { issues?: unknown }).issues);
  const verdict = (parsed as { verdict?: unknown }).verdict;

  if (verdict === "clean" && issues.length === 0) return { verdict: "clean", issues: [] };
  if (verdict === "flagged") return { verdict: "flagged", issues };
  return {
    verdict: "flagged",
    issues,
    error:
      typeof verdict === "string" ? `unexpected verdict '${verdict}'` : "missing verdict",
  };
}

/**
 * Combine independent reads: ANY flag wins.
 *
 * Reasons are unioned and deduped — different reads often quote the same phrase
 * in slightly different words, and a review card full of near-duplicates is
 * noise. An empty input is treated as a failed check, not a pass.
 */
export function combineClaimReviews(reads: readonly ClaimReview[]): ClaimReview {
  if (reads.length === 0) {
    return { verdict: "flagged", issues: [], error: "no checker reads" };
  }

  const objections = reads.filter((r) => r.verdict === "flagged");
  if (objections.length === 0) return { verdict: "clean", issues: [] };

  const seen = new Set<string>();
  const issues: ClaimIssue[] = [];
  for (const r of objections) {
    for (const i of r.issues) {
      const key = i.quote.slice(0, 40).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push(i);
    }
  }
  return {
    verdict: "flagged",
    issues: issues.slice(0, 4),
    // Distinguish a checker outage from a genuine objection: all reads erroring
    // still holds the post, but the reason should say so.
    error: objections.every((r) => r.error) ? objections[0].error : undefined,
  };
}

// ─── JSON extraction ───────────────────────────────────────────────────────────

function normalizeIssues(raw: unknown): ClaimIssue[] {
  if (!Array.isArray(raw)) return [];
  const out: ClaimIssue[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const quote = typeof o.quote === "string" ? o.quote.trim() : "";
    const why = typeof o.why === "string" ? o.why.trim() : "";
    if (quote || why) out.push({ quote, why });
  }
  return out.slice(0, 6);
}

function extractJson(text: string): Record<string, unknown> | null {
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  const fences: string[] = [];
  for (let m = fenceRe.exec(text); m; m = fenceRe.exec(text)) {
    if (m[1] && m[1].includes("{")) fences.push(m[1].trim());
  }
  for (let i = fences.length - 1; i >= 0; i--) {
    const obj = tryParse(fences[i]);
    if (obj) return obj;
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return tryParse(text.slice(start, end + 1));
  return null;
}

function tryParse(raw: string): Record<string, unknown> | null {
  try {
    const obj = JSON.parse(raw.replace(/,\s*([}\]])/g, "$1"));
    return obj && typeof obj === "object" && !Array.isArray(obj)
      ? (obj as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
