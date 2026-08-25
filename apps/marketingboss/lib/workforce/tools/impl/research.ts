import "server-only";
import { defineTool, asObject, reqString, type ToolOutcome } from "../types";
import { getBusinessProfile, researchBusinessProfile } from "@/lib/businessProfile";
import { loadBrief, toFailure } from "./_shared";

/**
 * Oliver — Market Researcher. Wraps lib/businessProfile.ts and lib/research.ts.
 * These two tools are the intake gate: without a brief, the seasonal and trends
 * scouts skip entirely (see lib/discovery.ts) and every draft comes out generic.
 */

export const getBusinessProfileTool = defineTool<Record<string, never>>({
  name: "get_business_profile",
  worker: "market_researcher",
  description:
    "Read what we already know about this business: its name, what it does, its audience, and its recurring content topics. " +
    "ALWAYS call this first. If it returns known:false, the account has no brand knowledge yet — run research_business " +
    "before planning any content, and tell the owner that is what you are doing.",
  inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
  riskClass: "research",
  estimateCredits: () => 0,
  parseInput: () => ({ ok: true, value: {} }),
  async execute(ctx): Promise<ToolOutcome> {
    try {
      const [profile, brief] = await Promise.all([getBusinessProfile(ctx.userId), loadBrief(ctx.userId)]);
      if (!profile && !brief) {
        return {
          status: "completed",
          summary: "No business profile on file yet.",
          data: { known: false, hint: "Call research_business with the owner's website to build one." },
        };
      }
      return {
        status: "completed",
        summary: `Read the profile for ${profile?.name ?? "this business"}.`,
        data: {
          known: true,
          name: profile?.name ?? null,
          summary: profile?.summary ?? null,
          audience: profile?.audience ?? null,
          companyUrl: profile?.companyUrl ?? null,
          topicPresets: profile?.topicPresets ?? [],
          brief,
        },
      };
    } catch (e) {
      return toFailure(e, "I couldn't read the business profile.");
    }
  },
});

type ResearchInput = { url: string };

export const researchBusiness = defineTool<ResearchInput>({
  name: "research_business",
  worker: "market_researcher",
  description:
    "Research a business from its website: what it sells, who it serves, its tone, its content pillars, and its " +
    "competitors. Saves the result as the account's brand knowledge and generates recurring post topics. " +
    "Use this once per account before planning content, or when the owner says the business has changed. " +
    "Takes up to a minute — say so before calling it.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The business's website, e.g. https://example.com" },
    },
    required: ["url"],
    additionalProperties: false,
  },
  riskClass: "research",
  estimateCredits: () => 0,
  parseInput(raw) {
    const o = asObject(raw);
    const url = reqString(o, "url", 500);
    if (!url) return { ok: false, error: "I need the business's website address to research it." };
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: `"${url}" doesn't look like a web address — it should start with http:// or https://.` };
    return { ok: true, value: { url } };
  },
  async execute(ctx, input): Promise<ToolOutcome> {
    try {
      const profile = await researchBusinessProfile(ctx.userId, input.url);
      return {
        status: "completed",
        summary: `Researched ${profile.name ?? input.url} and saved the brand profile.`,
        artifactUrl: "/settings",
        data: {
          name: profile.name,
          summary: profile.summary,
          audience: profile.audience,
          topicPresets: profile.topicPresets,
        },
      };
    } catch (e) {
      return toFailure(e, `I couldn't research ${input.url}. The site may be unreachable or blocking automated readers.`);
    }
  },
});
