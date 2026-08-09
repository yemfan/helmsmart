import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPerformanceSummary, type GroupPerf } from "@/lib/performance";

/**
 * Learning (migration 0017) — narrative "why it works" items synthesized from
 * the user's own engagement data. Deliberately PURE CODE, no AI call: every
 * insight is a deterministic comparison the evidence json can back verbatim,
 * so the system never claims a pattern it can't show. Honest gates: cohorts
 * need n >= MIN_N posts and a clear margin before we call a winner.
 *
 * All reads/writes tolerate a pre-migration DB (reads [], writes no-op).
 */

export type Learning = {
  id: string;
  campaign_id: string | null;
  insight: string;
  evidence: Record<string, unknown> | null;
  recommendation: string;
  applied_at: string | null;
  created_at: string;
};

const MIN_N = 3; // posts per cohort before a comparison counts
const MIN_MARGIN = 1.5; // winner must average >= 1.5x the runner-up

function tableMissing(message: string | undefined): boolean {
  const m = message ?? "";
  return m.includes("learnings") && (m.includes("does not exist") || m.includes("schema cache"));
}

export async function listLearnings(userId: string, limit = 20): Promise<Learning[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("learnings")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (tableMissing(error.message)) return [];
    throw new Error(error.message);
  }
  return (data as Learning[]) ?? [];
}

export async function latestLearningAt(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("learnings")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as { created_at: string } | null)?.created_at ?? null;
}

/** Apply a learning to a playbook — the planner folds it into future batches. */
export async function applyLearning(userId: string, id: string, campaignId: string | null): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("learnings")
    .update({ campaign_id: campaignId, applied_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  if (error && !tableMissing(error.message)) throw new Error(error.message);
}

/**
 * Applied learnings as planner guidance. Includes learnings applied to THIS
 * playbook and ones applied account-wide (campaign_id null after the playbook
 * was deleted also lands here — still valid guidance).
 */
export async function appliedLearningsHint(userId: string, campaignId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("learnings")
    .select("insight, recommendation, campaign_id")
    .eq("user_id", userId)
    .not("applied_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) return null;
  const rows = ((data as { insight: string; recommendation: string; campaign_id: string | null }[]) ?? []).filter(
    (r) => r.campaign_id === campaignId || r.campaign_id === null,
  );
  if (rows.length === 0) return null;
  return `Apply these proven learnings from this brand's own results:\n${rows
    .map((r) => `- ${r.insight} → ${r.recommendation}`)
    .join("\n")}`;
}

type Candidate = {
  insight: string;
  evidence: Record<string, unknown>;
  recommendation: string;
};

function avg(g: GroupPerf): number {
  return g.count > 0 ? g.score / g.count : 0;
}

/** Compare the top two cohorts of a grouping; emit a learning when the gap is real. */
function compare(kind: "angle" | "format" | "platform", groups: GroupPerf[], recommend: (winner: string, loser: string) => string): Candidate | null {
  const eligible = groups.filter((g) => g.count >= MIN_N);
  if (eligible.length < 2) return null;
  const sorted = [...eligible].sort((a, b) => avg(b) - avg(a));
  const [win, lose] = sorted;
  if (avg(lose) <= 0 || avg(win) / avg(lose) < MIN_MARGIN) return null;
  const ratio = (avg(win) / avg(lose)).toFixed(1);
  return {
    insight: `Your “${win.key}” ${kind === "angle" ? "posts" : kind === "format" ? "content" : "channel"} outperform${win.key.endsWith("s") ? "" : "s"} “${lose.key}” about ${ratio}:1 on engagement per post.`,
    evidence: {
      kind,
      winner: { key: win.key, posts: win.count, totalEngagement: win.score, avg: Math.round(avg(win) * 10) / 10 },
      runnerUp: { key: lose.key, posts: lose.count, totalEngagement: lose.score, avg: Math.round(avg(lose) * 10) / 10 },
      minPostsPerCohort: MIN_N,
    },
    recommendation: recommend(win.key, lose.key),
  };
}

/**
 * Synthesize new learnings from published-post engagement. Skips users with
 * too little data instead of inventing patterns. Dedupes on identical insight
 * text against ALL existing learnings. Returns how many were created.
 */
export async function synthesizeLearnings(userId: string): Promise<number> {
  const summary = await buildPerformanceSummary(userId);
  if (summary.totalPosts < MIN_N * 2 || summary.totalEngagement <= 0) return 0;

  const candidates: Candidate[] = [];

  const byAngle = compare("angle", summary.topAngles, (w) => `Weight this playbook's pillars toward “${w}” — plan more posts on it and fewer on the losers.`);
  if (byAngle) candidates.push(byAngle);

  const byFormat = compare(
    "format",
    summary.byType,
    (w) => `Shift your weekly mix toward ${w} posts — allow the type in every playbook and let the planner favor it.`,
  );
  if (byFormat) candidates.push(byFormat);

  // No platform comparison yet: the summary doesn't track posts-per-platform,
  // and we don't fabricate cohort sizes to force a verdict.

  if (candidates.length === 0) return 0;

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin.from("learnings").select("insight").eq("user_id", userId);
  if (readErr) {
    if (tableMissing(readErr.message)) return 0;
    throw new Error(readErr.message);
  }
  const seen = new Set(((existing as { insight: string }[]) ?? []).map((r) => r.insight));
  const fresh = candidates.filter((c) => !seen.has(c.insight));
  if (fresh.length === 0) return 0;

  const { error } = await admin.from("learnings").insert(
    fresh.map((c) => ({
      user_id: userId,
      insight: c.insight,
      evidence: c.evidence,
      recommendation: c.recommendation,
    })),
  );
  if (error) {
    if (tableMissing(error.message)) return 0;
    throw new Error(error.message);
  }
  return fresh.length;
}
