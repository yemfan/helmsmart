import "server-only";
import { cachedSystem, markTranscriptCached } from "@leadsmart/shared/utils/promptCache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ANTHROPIC_API_URL, ANTHROPIC_MODEL, aiConfigured, anthropicJson } from "@/lib/ai";
import { getBusinessProfile } from "@/lib/businessProfile";

/**
 * Community Intelligence Engine (MVP) — where should this business publish,
 * and how should it adapt? See docs/marketing/community-intelligence-engine.md.
 *
 * Discovery uses the licensed web-research idiom (Scout+Analyzer merged into
 * one research + one structured pass). Community facts are shared library
 * rows; per-user favorites live in community_saves. Estimates are honestly
 * labeled until real platform connectors exist. Pre-migration tolerant.
 */

export type CommunityScoreComponents = {
  audienceMatch: number;
  engagement: number;
  growth: number;
  competition: number;       // higher = LESS saturated (better)
  promotionTolerance: number;
  conversionPotential: number;
};

export const COMMUNITY_SCORE_WEIGHTS: Record<keyof CommunityScoreComponents, number> = {
  audienceMatch: 0.28,
  engagement: 0.18,
  growth: 0.12,
  competition: 0.12,
  promotionTolerance: 0.12,
  conversionPotential: 0.18,
};

export function computeOpportunityScore(c: Partial<CommunityScoreComponents>): number {
  let total = 0;
  let weight = 0;
  for (const [k, w] of Object.entries(COMMUNITY_SCORE_WEIGHTS) as [keyof CommunityScoreComponents, number][]) {
    const v = c[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      total += Math.max(0, Math.min(100, v)) * w;
      weight += w;
    }
  }
  return weight > 0 ? Math.round(total / weight) : 0;
}

export type Community = {
  id: string;
  source: string;
  platform: string;
  name: string;
  url: string | null;
  category: string | null;
  industry: string | null;
  language: string | null;
  description: string | null;
  audience: { membersEstimate?: string; targetAudience?: string; professionalLevel?: string; geography?: string } | null;
  activity: { level?: string; engagement?: string; note?: string } | null;
  culture: { tone?: string; formality?: string; technicalDepth?: string; friendliness?: string } | null;
  rules: { promotionAllowed?: string; selfPromotionPolicy?: string; moderationStrictness?: string; note?: string } | null;
  topics: { trending?: string[]; evergreen?: string[]; faqs?: string[] } | null;
  dna: { summary?: string; bestContent?: string[]; postingStyle?: string; bestTime?: string; recommendation?: string } | null;
  score_components: Partial<CommunityScoreComponents> | null;
  opportunity_score: number;
  created_at: string;
};

function tableMissing(msg: string | undefined): boolean {
  const m = msg ?? "";
  return m.includes("communit") && (m.includes("does not exist") || m.includes("schema cache"));
}

// ── Reads ────────────────────────────────────────────────────────────────────

export type CommunityWithSave = Community & { saved: boolean; collection: string | null };

export async function listCommunities(
  userId: string,
  opts: { q?: string; platform?: string; industry?: string; savedOnly?: boolean; limit?: number } = {},
): Promise<CommunityWithSave[]> {
  const admin = createAdminClient();
  let query = admin.from("communities").select("*").eq("status", "active");
  if (opts.q?.trim()) {
    const q = opts.q.trim();
    query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%,industry.ilike.%${q}%`);
  }
  if (opts.platform) query = query.eq("platform", opts.platform);
  if (opts.industry) query = query.ilike("industry", `%${opts.industry}%`);
  const { data, error } = await query.order("opportunity_score", { ascending: false }).limit(opts.limit ?? 30);
  if (error) {
    if (tableMissing(error.message)) return [];
    throw new Error(error.message);
  }
  const rows = (data as Community[]) ?? [];

  const { data: saves } = await admin.from("community_saves").select("community_id, collection").eq("user_id", userId);
  const saveMap = new Map(((saves as { community_id: string; collection: string }[]) ?? []).map((s) => [s.community_id, s.collection]));

  const withSaves = rows.map((r) => ({ ...r, saved: saveMap.has(r.id), collection: saveMap.get(r.id) ?? null }));
  return opts.savedOnly ? withSaves.filter((r) => r.saved) : withSaves;
}

export async function saveCommunity(userId: string, communityId: string, collection?: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("community_saves")
    .upsert({ user_id: userId, community_id: communityId, collection: collection?.trim().slice(0, 60) || "Favorites" });
  if (error && !tableMissing(error.message)) throw new Error(error.message);
}

export async function unsaveCommunity(userId: string, communityId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("community_saves").delete().eq("user_id", userId).eq("community_id", communityId);
}

// ── Scout + Analyzer (merged: 1 research + 1 structured pass) ────────────────

type Block = { type: string; text?: string };

async function scoutRaw(niche: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const system =
    "You are a community-marketing researcher. Find ONLINE COMMUNITIES (subreddits, Facebook groups, LinkedIn " +
    "groups, Discord servers, Slack communities, forums, Quora spaces) where a specific business's audience " +
    "actually gathers. For each: size, activity level, culture/tone, moderation and self-promotion rules " +
    "(check the community's own rules where findable), what content performs, and how promotable it is. " +
    "Prefer communities with real activity over big-but-dead ones. Cite what you find.";
  const messages: { role: string; content: unknown }[] = [
    {
      role: "user",
      content:
        `The business:\n${niche}\n\n` +
        "Find 5-8 online communities where this business's marketing could genuinely land. Cover several " +
        "platforms. For each: name, platform, URL, approximate size, how active it is, the culture, the " +
        "promotion/self-promotion rules, trending discussion topics, and what kind of content works there. " +
        "Work FAST — a tight briefing now beats a perfect one that never arrives.",
    },
  ];
  // Budgeted tightly: the whole discover request must fit Vercel's 300s cap.
  const tools = [
    { type: "web_search_20260209", name: "web_search", max_uses: 4 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 2 },
  ];
  let text = "";
  for (let i = 0; i < 3; i++) {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 3500, system: cachedSystem(system), messages, tools }),
    });
    const data = (await res.json().catch(() => ({}))) as { content?: Block[]; stop_reason?: string; error?: { message?: string } };
    if (!res.ok) throw new Error(data.error?.message || `Community scout failed (${res.status}).`);
    text = (data.content ?? []).filter((b) => b.type === "text" && b.text).map((b) => b.text as string).join("\n\n");
    if (data.stop_reason === "pause_turn" && data.content) {
      messages.push({ role: "assistant", content: data.content });
      // The turn just added holds the search results — cache it so the
      // next round reads them back instead of re-paying for them.
      markTranscriptCached(messages as never);
      continue;
    }
    break;
  }
  if (!text.trim()) throw new Error("Community scout came back empty.");
  return text;
}

function scoreSection(keys: string[]) {
  return {
    type: "object",
    properties: Object.fromEntries(keys.map((k) => [k, { type: "number" }])),
    required: keys,
    additionalProperties: false,
  };
}

function strSection(keys: string[]) {
  return {
    type: "object",
    properties: Object.fromEntries(keys.map((k) => [k, { type: "string" }])),
    required: keys,
    additionalProperties: false,
  };
}

const COMMUNITY_SCHEMA = {
  type: "object",
  properties: {
    communities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          platform: { type: "string" },
          url: { type: "string" },
          category: { type: "string" },
          industry: { type: "string" },
          language: { type: "string" },
          description: { type: "string" },
          audience: strSection(["membersEstimate", "targetAudience", "professionalLevel", "geography"]),
          activity: strSection(["level", "engagement", "note"]),
          culture: strSection(["tone", "formality", "technicalDepth", "friendliness"]),
          rules: strSection(["promotionAllowed", "selfPromotionPolicy", "moderationStrictness", "note"]),
          trending: { type: "array", items: { type: "string" } },
          evergreen: { type: "array", items: { type: "string" } },
          faqs: { type: "array", items: { type: "string" } },
          dna: strSection(["summary", "postingStyle", "bestTime", "recommendation"]),
          bestContent: { type: "array", items: { type: "string" } },
          components: scoreSection(Object.keys(COMMUNITY_SCORE_WEIGHTS)),
        },
        required: ["name", "platform", "url", "category", "industry", "language", "description", "audience", "activity", "culture", "rules", "trending", "evergreen", "faqs", "dna", "bestContent", "components"],
        additionalProperties: false,
      },
    },
  },
  required: ["communities"],
  additionalProperties: false,
};

type ScoutedCommunity = {
  name: string;
  platform: string;
  url: string;
  category: string;
  industry: string;
  language: string;
  description: string;
  audience: Record<string, string>;
  activity: Record<string, string>;
  culture: Record<string, string>;
  rules: Record<string, string>;
  trending: string[];
  evergreen: string[];
  faqs: string[];
  dna: Record<string, string>;
  bestContent: string[];
  components: CommunityScoreComponents;
};

async function structureScout(niche: string, briefing: string): Promise<ScoutedCommunity[]> {
  const out = await anthropicJson<{ communities: ScoutedCommunity[] }>({
    system: [
      "You turn a community-research briefing into structured Community Intelligence records. Only include",
      "communities the briefing actually supports — never invent. Score every component 0-100 HONESTLY for",
      "THIS business: audienceMatch (their audience?), engagement (interaction quality), growth, competition",
      "(higher = LESS saturated with similar marketers), promotionTolerance (higher = promotion-friendlier),",
      "conversionPotential (buyers, not just browsers). Be conservative when the briefing is vague.",
      "dna.recommendation: ONE actionable sentence on how to win in this community ('Teach first, sell later').",
      "membersEstimate keeps its source flavor ('~120k members per the sidebar'). platform: lowercase",
      "(reddit/facebook/linkedin/discord/slack/x/quora/forum). url: '' if not in the briefing.",
    ].join("\n"),
    user: `The business:\n${niche}\n\nResearch briefing:\n${briefing.slice(0, 10_000)}`,
    schema: COMMUNITY_SCHEMA,
    // Each community record is ~15 fields; 4.5k tokens truncated the JSON
    // mid-array (unparseable). The structured pass is a single fast call, so
    // headroom here costs seconds, not the 300s budget.
    maxTokens: 12_000,
  });
  return out.communities.slice(0, 8);
}

/** On-demand discovery for one user's business. Dedupes by (platform, name). */
export async function discoverCommunitiesForUser(userId: string): Promise<{ found: number; niche: string } | null> {
  if (!aiConfigured()) return null;
  const profile = await getBusinessProfile(userId).catch(() => null);
  const niche = profile?.summary
    ? `${profile.name ?? ""} — ${profile.summary} Audience: ${profile.audience ?? "small-business owners"}`
    : null;
  if (!niche) throw new Error("Fill in your business first (paste your company URL in the Brand Kit) — discovery searches for YOUR audience's communities.");

  const admin = createAdminClient();
  const scouted = await structureScout(niche, await scoutRaw(niche));

  const { data: existing, error: readErr } = await admin
    .from("communities")
    .select("platform, name")
    .eq("status", "active");
  if (readErr) {
    if (tableMissing(readErr.message)) return null;
    throw new Error(readErr.message);
  }
  const seen = new Set(((existing as { platform: string; name: string }[]) ?? []).map((r) => `${r.platform}|${r.name.trim().toLowerCase()}`));
  const fresh = scouted.filter((s) => !seen.has(`${s.platform.toLowerCase()}|${s.name.trim().toLowerCase()}`));
  if (fresh.length === 0) return { found: 0, niche };

  const { error } = await admin.from("communities").insert(
    fresh.map((s) => ({
      source: "web_research",
      platform: s.platform.toLowerCase().slice(0, 40),
      name: s.name.slice(0, 200),
      url: s.url || null,
      category: s.category || null,
      industry: s.industry || null,
      language: s.language || null,
      description: s.description || null,
      audience: s.audience,
      activity: s.activity,
      culture: s.culture,
      rules: s.rules,
      topics: { trending: s.trending.slice(0, 8), evergreen: s.evergreen.slice(0, 8), faqs: s.faqs.slice(0, 8) },
      dna: { ...s.dna, bestContent: s.bestContent.slice(0, 6) },
      score_components: s.components,
      opportunity_score: computeOpportunityScore(s.components),
    })),
  );
  if (error) {
    if (tableMissing(error.message)) return null;
    throw new Error(error.message);
  }
  return { found: fresh.length, niche };
}

/** Composer intent for "write a post for this community" — the CommunityWriter seed. */
export function communityWriteIntent(c: Community): string {
  const culture = [c.culture?.tone, c.culture?.formality, c.culture?.technicalDepth].filter(Boolean).join(", ");
  const best = c.dna?.bestContent?.slice(0, 3).join(" / ");
  return [
    `Write a post for the ${c.platform} community "${c.name}"${c.industry ? ` (${c.industry})` : ""}.`,
    culture ? `Match its culture: ${culture}.` : "",
    c.rules?.selfPromotionPolicy ? `Respect its rules: ${c.rules.selfPromotionPolicy}.` : "",
    best ? `Formats that work there: ${best}.` : "",
    c.dna?.recommendation ? `House advice: ${c.dna.recommendation}` : "",
    c.topics?.trending?.length ? `Currently discussed: ${c.topics.trending.slice(0, 3).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
