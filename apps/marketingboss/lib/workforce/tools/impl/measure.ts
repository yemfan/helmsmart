import "server-only";
import { defineTool, asObject, intIn, type ToolOutcome } from "../types";
import { buildPerformanceSummary } from "@/lib/performance";
import { listLearnings } from "@/lib/learnings";
import { toFailure } from "./_shared";

/**
 * Grace — Performance Analyst. Wraps lib/performance.ts and lib/learnings.ts.
 *
 * Both engines are deliberately honest: buildPerformanceSummary only sees posts
 * that actually carry metrics, and synthesizeLearnings refuses to name a pattern
 * it can't back with cohort evidence. The tools below preserve that — when
 * there isn't enough data they say so rather than handing the model numbers it
 * will happily over-read.
 */

type PerfInput = { topPosts: number };

export const getPerformance = defineTool<PerfInput>({
  name: "get_performance",
  worker: "performance_analyst",
  description:
    "Read what the account's published posts actually earned: totals, breakdowns by platform, format, and content " +
    "angle, and the best-performing posts. Call this before recommending what to do more of. If it reports too " +
    "little data, say so plainly instead of inferring a pattern.",
  inputSchema: {
    type: "object",
    properties: { topPosts: { type: "number", description: "How many top posts to include (0-10). Default 3." } },
    required: [],
    additionalProperties: false,
  },
  riskClass: "research",
  estimateCredits: () => 0,
  parseInput(raw) {
    return { ok: true, value: { topPosts: intIn(asObject(raw), "topPosts", 0, 10, 3) } };
  },
  async execute(ctx, input): Promise<ToolOutcome> {
    try {
      const s = await buildPerformanceSummary(ctx.userId);
      if (s.totalPosts === 0) {
        return {
          status: "completed",
          summary: "No published posts with metrics yet.",
          data: {
            enoughData: false,
            note: "Nothing has been published with readable metrics yet, so there is no performance signal to read. Say this plainly rather than guessing.",
          },
        };
      }
      return {
        status: "completed",
        summary: `Read performance across ${s.totalPosts} published post${s.totalPosts === 1 ? "" : "s"}.`,
        artifactUrl: "/learning",
        data: {
          // Three posts is the floor the learning engine itself uses before it
          // will call a winner; surface the same bar so the model doesn't
          // out-claim the evidence.
          enoughData: s.totalPosts >= 3,
          totalPosts: s.totalPosts,
          totals: { likes: s.totalLikes, comments: s.totalComments, views: s.totalViews, engagement: s.totalEngagement },
          byPlatform: s.byPlatform,
          byFormat: s.byType,
          byAngle: s.topAngles,
          topPosts: s.topPosts.slice(0, input.topPosts),
        },
      };
    } catch (e) {
      return toFailure(e, "I couldn't read the performance numbers.");
    }
  },
});

type LearningsInput = { limit: number };

export const getLearnings = defineTool<LearningsInput>({
  name: "get_learnings",
  worker: "performance_analyst",
  description:
    "Read the durable lessons already proven from this account's own results — each one backed by the posts and " +
    "engagement figures behind it. Use these to steer new plans. An empty list means the account has not published " +
    "enough for any pattern to be trustworthy yet; do not invent one.",
  inputSchema: {
    type: "object",
    properties: { limit: { type: "number", description: "How many to return (1-20). Default 5." } },
    required: [],
    additionalProperties: false,
  },
  riskClass: "research",
  estimateCredits: () => 0,
  parseInput(raw) {
    return { ok: true, value: { limit: intIn(asObject(raw), "limit", 1, 20, 5) } };
  },
  async execute(ctx, input): Promise<ToolOutcome> {
    try {
      const rows = await listLearnings(ctx.userId, input.limit);
      return {
        status: "completed",
        summary: rows.length ? `Read ${rows.length} proven learning${rows.length === 1 ? "" : "s"}.` : "No proven learnings yet.",
        artifactUrl: rows.length ? "/learning" : null,
        data: {
          learnings: rows.map((l) => ({
            insight: l.insight,
            recommendation: l.recommendation,
            evidence: l.evidence,
            applied: !!l.applied_at,
          })),
        },
      };
    } catch (e) {
      return toFailure(e, "I couldn't read the learnings.");
    }
  },
});
