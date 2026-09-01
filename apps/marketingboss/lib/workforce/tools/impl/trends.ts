import "server-only";
import { defineTool, asObject, reqString, intIn, type ToolOutcome } from "../types";
import { findViralAds } from "@/lib/viral";
import { listTrending } from "@/lib/viralIntelligence";
import { listOpenOpportunities } from "@/lib/opportunities";
import { toFailure } from "./_shared";

/**
 * Ruby — Trend Scout. Wraps the two discovery engines that already exist:
 * lib/viral.ts (live web search for what's spreading in a niche) and
 * lib/viralIntelligence.ts (the shared viral library, refreshed by the cron,
 * with why-it-worked templates attached).
 *
 * Also surfaces the stored opportunity feed, since "what should we do next" is
 * usually already answered by discovery rather than needing a fresh search.
 */

type FindTrendsInput = { niche: string };

export const findTrends = defineTool<FindTrendsInput>({
  name: "find_trends",
  worker: "trend_scout",
  description:
    "Search the live web for content formats and ad angles spreading in a niche right now. Returns each one with " +
    "its hook and why it works. Slower and more expensive than list_viral_library — use it when the niche is " +
    "specific or the library has nothing relevant. Borrow structure, never wording.",
  inputSchema: {
    type: "object",
    properties: {
      niche: { type: "string", description: "The business and audience, e.g. 'independent coffee roaster for local commuters'" },
    },
    required: ["niche"],
    additionalProperties: false,
  },
  riskClass: "research",
  estimateCredits: () => 0,
  parseInput(raw) {
    const niche = reqString(asObject(raw), "niche", 300);
    if (!niche) return { ok: false, error: "I need to know the niche before I can scout trends for it." };
    return { ok: true, value: { niche } };
  },
  async execute(_ctx, input): Promise<ToolOutcome> {
    try {
      const refs = await findViralAds(input.niche);
      if (refs.length === 0) {
        return { status: "completed", summary: "No clear trending formats surfaced for that niche.", data: { trends: [] } };
      }
      return {
        status: "completed",
        summary: `Found ${refs.length} trending format${refs.length === 1 ? "" : "s"} in ${input.niche}.`,
        data: { trends: refs },
      };
    } catch (e) {
      return toFailure(e, "The trend search didn't come back with anything usable this time.");
    }
  },
});

type LibraryInput = { limit: number };

export const listViralLibrary = defineTool<LibraryInput>({
  name: "list_viral_library",
  worker: "trend_scout",
  description:
    "Read the shared viral library — content the system has already collected and analysed, each scored and paired " +
    "with a template explaining the hook, format, and emotion that made it work. Free and instant. Prefer this over " +
    "find_trends unless you need something niche-specific.",
  inputSchema: {
    type: "object",
    properties: { limit: { type: "number", description: "How many to return (1-12). Default 6." } },
    required: [],
    additionalProperties: false,
  },
  riskClass: "research",
  estimateCredits: () => 0,
  parseInput(raw) {
    return { ok: true, value: { limit: intIn(asObject(raw), "limit", 1, 12, 6) } };
  },
  async execute(_ctx, input): Promise<ToolOutcome> {
    try {
      const items = await listTrending(input.limit);
      return {
        status: "completed",
        summary: `Pulled ${items.length} analysed example${items.length === 1 ? "" : "s"} from the viral library.`,
        data: {
          items: items.map((i) => ({
            title: i.title,
            platform: i.platform,
            format: i.format ?? i.template?.format ?? null,
            score: i.viral_score,
            // The "why it worked" analysis is the point of the library — a bare
            // list of trending titles would just invite copying.
            why: i.analysis?.whyItWorks ?? null,
            hookType: i.analysis?.hookType ?? i.template?.hook_type ?? null,
            emotion: i.analysis?.emotionalTrigger ?? i.template?.emotional_trigger ?? null,
            structure: i.template?.structure ?? null,
          })),
        },
      };
    } catch (e) {
      return toFailure(e, "I couldn't read the viral library just now.");
    }
  },
});

type OppInput = { limit: number };

export const listOpportunities = defineTool<OppInput>({
  name: "list_opportunities",
  worker: "trend_scout",
  description:
    "Read the account's open opportunity feed — things discovery already found and scored (trends, competitor gaps, " +
    "what's measurably working, upcoming seasonal moments), each with the reason it matters. Check this before " +
    "searching for anything new; the work may already be done.",
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
      const opps = await listOpenOpportunities(ctx.userId, input.limit);
      if (opps.length === 0) {
        return {
          status: "completed",
          summary: "No open opportunities on file yet.",
          data: { opportunities: [], hint: "Discovery runs daily once the account has a brand profile." },
        };
      }
      return {
        status: "completed",
        summary: `Read ${opps.length} open opportunit${opps.length === 1 ? "y" : "ies"}.`,
        artifactUrl: "/opportunities",
        data: {
          opportunities: opps.map((o) => ({
            id: o.id,
            source: o.source,
            title: o.title,
            description: o.description,
            why: o.reasoning,
            score: o.score,
            urgency: o.urgency,
            recommendedAction: o.recommended_action,
          })),
        },
      };
    } catch (e) {
      return toFailure(e, "I couldn't read the opportunity feed.");
    }
  },
});
