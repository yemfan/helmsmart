import "server-only";
import { aiConfigured, anthropicJson } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPerformanceSummary } from "@/lib/performance";
import { findViralAds } from "@/lib/viral";
import { listCampaigns, type Campaign } from "@/lib/campaigns";
import { insertOpportunities, type Level, type OpportunityInput } from "@/lib/opportunities";

/**
 * Discovery scouts — each source produces OpportunityInput rows. Reuses the
 * engines that already exist: viral.ts (Trends), the campaign brief
 * (Competitors), and the engagement data (Performance). Every scout is
 * best-effort: a failing source never blocks the others.
 */

export type DiscoveryResult = { found: number; sources: Record<string, number | string> };

/** What we know about the business, for niche-aware scouts. */
async function nicheOf(userId: string, campaigns: Campaign[]): Promise<string | null> {
  const admin = createAdminClient();
  const { data: kit } = await admin
    .from("brand_kits")
    .select("brand_name, voice, audience")
    .eq("user_id", userId)
    .maybeSingle();
  const k = kit as { brand_name?: string; voice?: string; audience?: string } | null;
  if (k?.brand_name) {
    return [k.brand_name, k.voice, k.audience && `for ${k.audience}`].filter(Boolean).join(" — ");
  }
  const withBrief = campaigns.find((c) => c.brief);
  if (withBrief?.brief) {
    const b = withBrief.brief;
    return [b.name, b.summary].filter(Boolean).join(" — ");
  }
  return null;
}

/** PERFORMANCE — pure code, no AI: promote what's measurably working. */
async function scoutPerformance(userId: string): Promise<OpportunityInput[]> {
  const summary = await buildPerformanceSummary(userId);
  if (summary.totalPosts < 3 || summary.totalEngagement <= 0) return [];

  const out: OpportunityInput[] = [];
  const topAngle = summary.topAngles[0];
  const topType = summary.byType[0];

  if (topAngle && topAngle.score > 0) {
    const bestType = (topType?.key === "text" || topType?.key === "image" || topType?.key === "video" ? topType.key : "image") as
      | "text"
      | "image"
      | "video";
    out.push({
      source: "performance",
      title: `Double down on “${topAngle.key}”`,
      description: `Across your last ${summary.totalPosts} published posts, “${topAngle.key}” is your best-performing angle (${topAngle.score} engagement over ${topAngle.count} post${topAngle.count === 1 ? "" : "s"}).`,
      reasoning: `Your own audience has already voted: this angle earns ${topAngle.score} of your ${summary.totalEngagement} total engagement. Repeating a proven angle is the highest-confidence move available.`,
      business_value: "More of the engagement you're already winning — compounding reach on a proven theme.",
      reach: "medium",
      urgency: "medium",
      confidence: 0.85,
      recommended_action: {
        type: bestType,
        intent: `A new ${bestType === "text" ? "post" : bestType} on our proven angle: ${topAngle.key}. Fresh take, same theme that's been working.`,
      },
    });
  }

  if (topType && summary.byType.length > 1 && topType.score > 0) {
    const t = topType.key as "text" | "image" | "video";
    out.push({
      source: "performance",
      title: `${t === "video" ? "Video" : t === "image" ? "Image" : "Text"} posts are your best format`,
      description: `${t} posts average the most engagement of any format you publish (${topType.score} across ${topType.count}).`,
      reasoning: `Format beats topic more often than people expect — your ${t} posts outperform the rest of your mix, so shifting one more post per week into ${t} is a low-risk lift.`,
      business_value: "Higher average engagement per post at the same publishing effort.",
      reach: "medium",
      urgency: "low",
      confidence: 0.7,
      recommended_action: {
        type: t === "text" ? "text" : t,
        intent: `A ${t} post in our usual brand voice on our strongest current theme.`,
      },
    });
  }

  return out;
}

const COMP_SCHEMA = {
  type: "object",
  properties: {
    opportunities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          reasoning: { type: "string" },
          businessValue: { type: "string" },
          reach: { type: "string", enum: ["low", "medium", "high"] },
          urgency: { type: "string", enum: ["low", "medium", "high"] },
          confidence: { type: "number" },
          type: { type: "string", enum: ["text", "image", "video"] },
          intent: { type: "string" },
        },
        required: ["title", "description", "reasoning", "businessValue", "reach", "urgency", "confidence", "type", "intent"],
        additionalProperties: false,
      },
    },
  },
  required: ["opportunities"],
  additionalProperties: false,
};

type CompOpp = {
  title: string;
  description: string;
  reasoning: string;
  businessValue: string;
  reach: Level;
  urgency: Level;
  confidence: number;
  type: "text" | "image" | "video";
  intent: string;
};

/** COMPETITORS — one structured pass over the newest campaign brief. */
async function scoutCompetitors(userId: string, campaigns: Campaign[]): Promise<OpportunityInput[]> {
  if (!aiConfigured()) return [];
  const campaign = campaigns.find((c) => c.brief && (c.brief.competitors?.length ?? 0) > 0);
  if (!campaign?.brief) return [];

  const system = [
    "You are a growth strategist. From this brand brief (with competitor notes), find 1-2 concrete content OPPORTUNITIES the brand should act on now:",
    "an angle a competitor is winning with that the brand can counter, or a gap no competitor covers that the brand can own.",
    "For each: title (short, actionable), description (what it is), reasoning (ONE sentence business case addressed to the brand owner),",
    "businessValue (what it could earn), reach/urgency (low|medium|high), confidence (0-1 — be honest),",
    "type (best media format), intent (a ready instruction for an AI composer to create the post).",
    "Only propose what the brief actually supports — no inventions.",
  ].join("\n");

  const out = await anthropicJson<{ opportunities: CompOpp[] }>({
    system,
    user: `Brand brief:\n${JSON.stringify(campaign.brief)}`,
    schema: COMP_SCHEMA,
    maxTokens: 1500,
  });

  return out.opportunities.slice(0, 2).map((o) => ({
    source: "competitors" as const,
    title: o.title,
    description: o.description,
    reasoning: o.reasoning,
    business_value: o.businessValue,
    reach: o.reach,
    urgency: o.urgency,
    confidence: Math.max(0, Math.min(1, o.confidence)),
    recommended_action: { type: o.type, intent: o.intent },
  }));
}

const SEASONAL_SCHEMA = {
  type: "object",
  properties: {
    moments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          when: { type: "string" },
          description: { type: "string" },
          reasoning: { type: "string" },
          businessValue: { type: "string" },
          reach: { type: "string", enum: ["low", "medium", "high"] },
          urgency: { type: "string", enum: ["low", "medium", "high"] },
          confidence: { type: "number" },
          type: { type: "string", enum: ["text", "image", "video"] },
          intent: { type: "string" },
        },
        required: ["title", "when", "description", "reasoning", "businessValue", "reach", "urgency", "confidence", "type", "intent"],
        additionalProperties: false,
      },
    },
  },
  required: ["moments"],
  additionalProperties: false,
};

type SeasonalMoment = CompOpp & { when: string };

/**
 * SEASONAL — upcoming marketing moments (holidays, observances, retail
 * rhythms) relevant to the niche. One structured pass, no web search — the
 * calendar is stable knowledge; the model is told today's date and is allowed
 * to return NOTHING when no moment genuinely fits.
 */
async function scoutSeasonal(niche: string): Promise<OpportunityInput[]> {
  if (!aiConfigured()) return [];
  const today = new Date().toISOString().slice(0, 10);

  const system = [
    "You are a marketing strategist working the calendar. Given today's date and a business niche, pick the 1-2 most",
    "valuable marketing moments in the NEXT 45 days: holidays, observances, gifting windows, seasonal behavior shifts,",
    "or retail rhythms (back-to-school, BFCM, etc.).",
    "Only moments genuinely relevant to THIS niche — if nothing meaningful is coming up, return an empty list.",
    "For each: title (actionable, names the moment), when (the date or window, e.g. 'Sep 29 — National Coffee Day'),",
    "description (what the moment is and the angle to take), reasoning (ONE sentence business case addressed to the",
    "owner — why acting BEFORE the moment beats sitting it out), businessValue, reach/urgency (low|medium|high —",
    "urgency high only if the window opens within ~2 weeks), confidence (0-1, honest), type (best media format),",
    "intent (a ready instruction for an AI composer, mentioning the moment and the angle).",
  ].join("\n");

  const out = await anthropicJson<{ moments: SeasonalMoment[] }>({
    system,
    user: `Today's date: ${today}\nBusiness niche:\n${niche}`,
    schema: SEASONAL_SCHEMA,
    maxTokens: 1500,
  });

  return out.moments.slice(0, 2).map((m) => ({
    source: "seasonal" as const,
    title: m.title,
    description: `${m.when} — ${m.description}`,
    reasoning: m.reasoning,
    business_value: m.businessValue,
    reach: m.reach,
    urgency: m.urgency,
    confidence: Math.max(0, Math.min(1, m.confidence)),
    recommended_action: { type: m.type, intent: m.intent },
  }));
}

/** TRENDS — the viral scout (web search), mapped onto ride-this-format opportunities. */
async function scoutTrends(userId: string, niche: string): Promise<OpportunityInput[]> {
  if (!aiConfigured()) return [];
  const refs = await findViralAds(niche);
  return refs.slice(0, 2).map((r) => ({
    source: "trends" as const,
    title: `Ride the “${r.title}” format`,
    description: `${r.why} Trending on ${r.platform}.${r.url ? ` Example: ${r.url}` : ""}`,
    reasoning: `Formats spike and fade — this one is working on ${r.platform} right now, and early adopters in a niche capture most of its organic reach.`,
    business_value: "Outsized organic reach while the format is still hot in your niche.",
    reach: "high",
    urgency: "high",
    confidence: 0.55,
    recommended_action: {
      type: "video",
      intent: `A short ${r.platform} video in the "${r.title}" style. Hook: ${r.hook}. Style: ${r.styleNotes}. Subject: ${niche}.`,
    },
  }));
}

/**
 * Run every applicable scout for one user. Sources fail independently, cheap
 * scouts run first, and each source's finds are INSERTED AS SOON AS IT
 * COMPLETES — so if the function dies mid-run (the trends web research can
 * push a scan past the platform time budget), everything already discovered
 * is safely stored instead of lost.
 */
export async function discoverForUser(userId: string, opts?: { skipTrends?: boolean }): Promise<DiscoveryResult> {
  const campaigns = await listCampaigns(userId);
  const sources: Record<string, number | string> = {};
  let found = 0;

  const runScout = async (name: string, scout: () => Promise<OpportunityInput[]>) => {
    try {
      const items = await scout();
      sources[name] = items.length;
      if (items.length > 0) found += await insertOpportunities(userId, items);
    } catch (e) {
      sources[name] = `error: ${e instanceof Error ? e.message : "failed"}`;
    }
  };

  await runScout("performance", () => scoutPerformance(userId));
  await runScout("competitors", () => scoutCompetitors(userId, campaigns));

  const niche = await nicheOf(userId, campaigns).catch(() => null);
  if (niche) {
    await runScout("seasonal", () => scoutSeasonal(niche));
  } else {
    sources.seasonal = "skipped: no brand kit or campaign brief yet";
  }

  if (!opts?.skipTrends) {
    if (niche) {
      await runScout("trends", () => scoutTrends(userId, niche));
    } else {
      sources.trends = "skipped: no brand kit or campaign brief yet";
    }
  }

  return { found, sources };
}
