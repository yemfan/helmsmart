import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ANTHROPIC_API_URL, ANTHROPIC_MODEL, aiConfigured, anthropicJson } from "@/lib/ai";
import { getBusinessProfile } from "@/lib/businessProfile";
import { brandPromptContext, type BrandKit } from "@/lib/brandKit";

/**
 * Marketing Intelligence Engine (MVP) — the shared viral library.
 * See docs/marketing/marketing-intelligence-engine.md.
 *
 * Staging for cost: ONE web-research sweep per day discovers 5-8 items WITH
 * their creative DNA and per-component score estimates (Scout+Analyze merged);
 * only the top 3 new items get the extra Template-DNA call. All reads/writes
 * tolerate a pre-migration DB.
 *
 * Honesty: web-research metrics are ESTIMATES with the source noted — exact
 * platform metrics arrive with real connectors (YouTube API first).
 */

export type ScoreComponents = {
  momentum: number;
  engagement: number;
  acceleration: number;
  recency: number;
  replicability: number;
  industryFit: number;
  crossPlatform: number;
};

/** Adjustable — stored per-component so admins can see WHY a score happened. */
export const SCORE_WEIGHTS: Record<keyof ScoreComponents, number> = {
  momentum: 0.22,
  engagement: 0.18,
  acceleration: 0.15,
  recency: 0.15,
  replicability: 0.15,
  industryFit: 0.08,
  crossPlatform: 0.07,
};

export function computeViralScore(c: Partial<ScoreComponents>): number {
  let total = 0;
  let weight = 0;
  for (const [k, w] of Object.entries(SCORE_WEIGHTS) as [keyof ScoreComponents, number][]) {
    const v = c[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      total += Math.max(0, Math.min(100, v)) * w;
      weight += w;
    }
  }
  return weight > 0 ? Math.round(total / weight) : 0;
}

export type ViralItem = {
  id: string;
  source: string;
  url: string | null;
  title: string;
  description: string | null;
  platform: string | null;
  content_type: string | null;
  format: string | null;
  industries: string[] | null;
  metrics: Record<string, unknown> | null;
  score_components: Partial<ScoreComponents> | null;
  viral_score: number;
  velocity: string | null;
  status: string;
  analysis: { hookType?: string; emotionalTrigger?: string; structureNotes?: string; whyItWorks?: string[] } | null;
  created_at: string;
};

export type ViralTemplate = {
  id: string;
  viral_item_id: string | null;
  title: string;
  description: string | null;
  content_type: string | null;
  format: string | null;
  platforms: string[] | null;
  industries: string[] | null;
  objective: string | null;
  hook_type: string | null;
  emotional_trigger: string | null;
  structure: { slot: string; pattern: string }[] | null;
  variables: string[] | null;
  replicability: number | null;
  difficulty: string | null;
  usage_count: number;
};

function tableMissing(msg: string | undefined): boolean {
  const m = msg ?? "";
  return m.includes("viral_") && (m.includes("does not exist") || m.includes("schema cache"));
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listTrending(limit = 8): Promise<(ViralItem & { template: ViralTemplate | null })[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("viral_items")
    .select("*, viral_templates(*)")
    .is("user_id", null)
    .neq("status", "archived")
    .order("viral_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (tableMissing(error.message)) return [];
    throw new Error(error.message);
  }
  return ((data as Record<string, unknown>[]) ?? []).map((r) => {
    const t = r.viral_templates as ViralTemplate[] | null;
    return { ...(r as unknown as ViralItem), template: Array.isArray(t) && t.length ? t[0] : null };
  });
}

export async function searchViral(opts: {
  q?: string;
  platform?: string;
  contentType?: string;
  velocity?: string;
  limit?: number;
}): Promise<(ViralItem & { template: ViralTemplate | null })[]> {
  const admin = createAdminClient();
  let query = admin
    .from("viral_items")
    .select("*, viral_templates(*)")
    .is("user_id", null)
    .neq("status", "archived");
  if (opts.q?.trim()) query = query.or(`title.ilike.%${opts.q.trim()}%,description.ilike.%${opts.q.trim()}%`);
  if (opts.platform) query = query.eq("platform", opts.platform);
  if (opts.contentType) query = query.eq("content_type", opts.contentType);
  if (opts.velocity) query = query.eq("velocity", opts.velocity);
  const { data, error } = await query.order("viral_score", { ascending: false }).limit(opts.limit ?? 20);
  if (error) {
    if (tableMissing(error.message)) return [];
    throw new Error(error.message);
  }
  return ((data as Record<string, unknown>[]) ?? []).map((r) => {
    const t = r.viral_templates as ViralTemplate[] | null;
    return { ...(r as unknown as ViralItem), template: Array.isArray(t) && t.length ? t[0] : null };
  });
}

export async function latestGlobalItemAt(): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("viral_items")
    .select("created_at")
    .is("user_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as { created_at: string } | null)?.created_at ?? null;
}

// ── Scout + Analyze (merged; 1 research + 1 structured pass) ─────────────────

type Block = { type: string; text?: string };

async function scoutRaw(): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const system =
    "You are a marketing-intelligence analyst tracking what is gaining UNUSUAL momentum across social platforms " +
    "RIGHT NOW (TikTok, Reels, Shorts, LinkedIn, X). You care about EMERGING velocity, not all-time hits: a format " +
    "exploding this week beats one with 5M views over two years. Prefer formats a small business could replicate.";
  const messages: { role: string; content: unknown }[] = [
    {
      role: "user",
      content:
        "Find 5-8 pieces of content or content FORMATS that are currently gaining unusual traction and would be " +
        "valuable for small-business marketing. For each: what it is, the platform(s), why it's working (the " +
        "psychological mechanic), the hook style, roughly how fast it's growing (with your source), and how " +
        "replicable it is. Favor things trending within the last few weeks. Include source URLs when you can.",
    },
  ];
  const tools = [
    { type: "web_search_20260209", name: "web_search", max_uses: 6 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 },
  ];
  let text = "";
  for (let i = 0; i < 5; i++) {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 5000, system, messages, tools }),
    });
    const data = (await res.json().catch(() => ({}))) as { content?: Block[]; stop_reason?: string; error?: { message?: string } };
    if (!res.ok) throw new Error(data.error?.message || `Scout failed (${res.status}).`);
    text = (data.content ?? []).filter((b) => b.type === "text" && b.text).map((b) => b.text as string).join("\n\n");
    if (data.stop_reason === "pause_turn" && data.content) {
      messages.push({ role: "assistant", content: data.content });
      continue;
    }
    break;
  }
  if (!text.trim()) throw new Error("Scout came back empty.");
  return text;
}

const COMPONENT_PROPS = Object.fromEntries(
  Object.keys(SCORE_WEIGHTS).map((k) => [k, { type: "number" }]),
) as Record<string, { type: "number" }>;

const SCOUT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          url: { type: "string" },
          platform: { type: "string" },
          contentType: { type: "string", enum: ["video", "image", "carousel", "text"] },
          format: { type: "string" },
          industries: { type: "array", items: { type: "string" } },
          metricsNote: { type: "string" },
          velocity: { type: "string", enum: ["emerging", "rising", "exploding", "viral", "established", "declining", "evergreen"] },
          hookType: { type: "string" },
          emotionalTrigger: { type: "string" },
          whyItWorks: { type: "array", items: { type: "string" } },
          components: { type: "object", properties: COMPONENT_PROPS, required: Object.keys(SCORE_WEIGHTS), additionalProperties: false },
        },
        required: ["title", "description", "url", "platform", "contentType", "format", "industries", "metricsNote", "velocity", "hookType", "emotionalTrigger", "whyItWorks", "components"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

type ScoutedItem = {
  title: string;
  description: string;
  url: string;
  platform: string;
  contentType: "video" | "image" | "carousel" | "text";
  format: string;
  industries: string[];
  metricsNote: string;
  velocity: string;
  hookType: string;
  emotionalTrigger: string;
  whyItWorks: string[];
  components: ScoreComponents;
};

async function structureScout(briefing: string): Promise<ScoutedItem[]> {
  const out = await anthropicJson<{ items: ScoutedItem[] }>({
    system: [
      "You turn a trend-research briefing into structured viral-intelligence records. Only include items the",
      "briefing actually supports — never invent. For each item score EVERY component 0-100, honestly:",
      "momentum (current traction), engagement (interaction quality), acceleration (growth speeding up?),",
      "recency (how fresh), replicability (can a small business copy the FORMAT?), industryFit (breadth of",
      "business types it serves), crossPlatform (seen on multiple platforms?). Be conservative when the",
      "briefing is vague — estimates must be defensible. whyItWorks: 3-5 crisp mechanics. metricsNote: the",
      "growth/engagement evidence WITH its source. url: from the briefing or empty string.",
    ].join("\n"),
    user: `Research briefing:\n${briefing.slice(0, 12_000)}`,
    schema: SCOUT_SCHEMA,
    maxTokens: 4000,
  });
  return out.items.slice(0, 8);
}

// ── TemplateBuilder ──────────────────────────────────────────────────────────

const TEMPLATE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    objective: { type: "string" },
    structure: {
      type: "array",
      items: {
        type: "object",
        properties: { slot: { type: "string" }, pattern: { type: "string" } },
        required: ["slot", "pattern"],
        additionalProperties: false,
      },
    },
    variables: { type: "array", items: { type: "string" } },
    replicability: { type: "number" },
    difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
    estimatedDuration: { type: "string" },
  },
  required: ["title", "description", "objective", "structure", "variables", "replicability", "difficulty", "estimatedDuration"],
  additionalProperties: false,
};

type TemplateDna = {
  title: string;
  description: string;
  objective: string;
  structure: { slot: string; pattern: string }[];
  variables: string[];
  replicability: number;
  difficulty: "easy" | "medium" | "hard";
  estimatedDuration: string;
};

async function extractTemplateDna(item: ScoutedItem): Promise<TemplateDna> {
  return anthropicJson<TemplateDna>({
    system: [
      "You extract the reusable CREATIVE TEMPLATE DNA from a viral content pattern. Do NOT copy the original",
      "expression — abstract the underlying structure so ANY business/industry/topic can refill it.",
      "structure: ordered slots (HOOK, POINT_1, PAYOFF, CTA, ...), each with a pattern using {VARIABLES}",
      "(e.g. '3 things nobody tells you about {TOPIC}'). variables: every {VARIABLE} used.",
      "replicability 0-100 (production effort for a small business). Keep it tight and genuinely reusable.",
    ].join("\n"),
    user: JSON.stringify({
      title: item.title,
      description: item.description,
      format: item.format,
      contentType: item.contentType,
      hookType: item.hookType,
      emotionalTrigger: item.emotionalTrigger,
      whyItWorks: item.whyItWorks,
    }),
    schema: TEMPLATE_SCHEMA,
    maxTokens: 1500,
  });
}

// ── Daily refresh (the cron phase) ───────────────────────────────────────────

const ANALYSIS_VERSION = 1;
const TEMPLATE_TOP_N = 3;

/**
 * Once-per-~22h global library refresh: scout+analyze, dedupe, insert, then
 * Template-DNA for the top new items. No-ops pre-migration and without AI.
 */
export async function refreshViralLibrary(): Promise<{ found: number; templated: number } | null> {
  if (!aiConfigured()) return null;
  const latest = await latestGlobalItemAt();
  if (latest && Date.now() - Date.parse(latest) < 22 * 3600 * 1000) return null;

  const admin = createAdminClient();
  const briefing = await scoutRaw();
  const scouted = await structureScout(briefing);

  // Dedupe against live titles/urls (cheap; semantic clustering is a later phase).
  const { data: existing, error: readErr } = await admin
    .from("viral_items")
    .select("title, url")
    .is("user_id", null)
    .neq("status", "archived");
  if (readErr) {
    if (tableMissing(readErr.message)) return null;
    throw new Error(readErr.message);
  }
  const seenTitles = new Set(((existing as { title: string }[]) ?? []).map((r) => r.title.trim().toLowerCase()));
  const seenUrls = new Set(((existing as { url: string | null }[]) ?? []).map((r) => r.url).filter(Boolean));
  const fresh = scouted.filter(
    (s) => !seenTitles.has(s.title.trim().toLowerCase()) && (!s.url || !seenUrls.has(s.url)),
  );
  if (fresh.length === 0) return { found: 0, templated: 0 };

  const rows = fresh.map((s) => ({
    source: "web_research",
    url: s.url || null,
    title: s.title.slice(0, 300),
    description: s.description,
    platform: s.platform.toLowerCase().slice(0, 40),
    content_type: s.contentType,
    format: s.format.toLowerCase().slice(0, 60),
    industries: s.industries.slice(0, 8),
    metrics: { note: s.metricsNote, estimated: true },
    score_components: s.components,
    viral_score: computeViralScore(s.components),
    velocity: s.velocity,
    status: "analyzed",
    analysis: {
      hookType: s.hookType,
      emotionalTrigger: s.emotionalTrigger,
      whyItWorks: s.whyItWorks.slice(0, 6),
    },
    analysis_version: ANALYSIS_VERSION,
    rights: { sourceType: "reference", storage: "metadata_only", displayAllowed: true, remixAllowed: "concept_only" },
  }));

  const { data: inserted, error } = await admin.from("viral_items").insert(rows).select("id, title, viral_score");
  if (error) {
    if (tableMissing(error.message)) return null;
    throw new Error(error.message);
  }

  // Template-DNA only for the top new items (cost staging).
  const byScore = [...fresh].sort((a, b) => computeViralScore(b.components) - computeViralScore(a.components));
  let templated = 0;
  for (const s of byScore.slice(0, TEMPLATE_TOP_N)) {
    const row = ((inserted as { id: string; title: string }[]) ?? []).find((r) => r.title === s.title.slice(0, 300));
    if (!row) continue;
    try {
      const dna = await extractTemplateDna(s);
      const { error: tErr } = await admin.from("viral_templates").insert({
        viral_item_id: row.id,
        title: dna.title.slice(0, 200),
        description: dna.description,
        content_type: s.contentType,
        format: s.format.toLowerCase().slice(0, 60),
        platforms: [s.platform.toLowerCase()],
        industries: s.industries.slice(0, 8),
        objective: dna.objective,
        hook_type: s.hookType,
        emotional_trigger: s.emotionalTrigger,
        structure: dna.structure,
        variables: dna.variables,
        replicability: Math.round(Math.max(0, Math.min(100, dna.replicability))),
        difficulty: dna.difficulty,
        estimated_duration: dna.estimatedDuration,
        viral_score: computeViralScore(s.components),
      });
      if (!tErr) {
        templated++;
        await admin.from("viral_items").update({ status: "templated", updated_at: new Date().toISOString() }).eq("id", row.id);
      }
    } catch {
      /* per-item best effort */
    }
  }

  return { found: fresh.length, templated };
}

// ── Remix ────────────────────────────────────────────────────────────────────

const REMIX_SCHEMA = {
  type: "object",
  properties: {
    hook: { type: "string" },
    outline: { type: "array", items: { type: "string" } },
    caption: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
    mediaPrompt: { type: "string" },
    suggestedType: { type: "string", enum: ["text", "image", "video"] },
    intent: { type: "string" },
  },
  required: ["hook", "outline", "caption", "hashtags", "mediaPrompt", "suggestedType", "intent"],
  additionalProperties: false,
};

export type Remix = {
  hook: string;
  outline: string[];
  caption: string;
  hashtags: string[];
  mediaPrompt: string;
  suggestedType: "text" | "image" | "video";
  intent: string;
};

/** Generate an ORIGINAL version of the pattern for THIS user's business. */
export async function remixForUser(userId: string, itemId: string): Promise<Remix> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("viral_items")
    .select("*, viral_templates(*)")
    .eq("id", itemId)
    .maybeSingle();
  if (error || !data) throw new Error("That trend wasn't found.");
  const item = data as unknown as ViralItem & { viral_templates: ViralTemplate[] | null };
  const template = Array.isArray(item.viral_templates) && item.viral_templates.length ? item.viral_templates[0] : null;

  const [profile, { data: kit }] = await Promise.all([
    getBusinessProfile(userId).catch(() => null),
    admin.from("brand_kits").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  const brand = brandPromptContext((kit as BrandKit) ?? null);

  const remix = await anthropicJson<Remix>({
    system: [
      "You adapt a viral content PATTERN into an ORIGINAL piece for one specific business. Preserve the creative",
      "STRUCTURE (hook mechanic, pacing, slots) — never reproduce the original's exact expression.",
      brand ? `\n${brand}` : "",
      "Return: hook (ready to use), outline (the slots filled for THIS business, one line each), caption",
      "(ready to post), hashtags (4-8, no #), mediaPrompt (if visual), suggestedType, and intent — ONE",
      "self-contained instruction for an AI composer to produce this post (mention format + hook + angle).",
    ].join("\n"),
    user: JSON.stringify({
      pattern: {
        title: item.title,
        description: item.description,
        format: item.format,
        hookType: item.analysis?.hookType,
        whyItWorks: item.analysis?.whyItWorks,
        template: template ? { structure: template.structure, variables: template.variables } : null,
      },
      business: profile
        ? { name: profile.name, summary: profile.summary, audience: profile.audience }
        : "No business profile yet — keep it adaptable and ask-nothing generic for a small business.",
    }),
    schema: REMIX_SCHEMA,
    maxTokens: 1800,
  });

  if (template) {
    await admin
      .from("viral_templates")
      .update({ usage_count: template.usage_count + 1, updated_at: new Date().toISOString() })
      .eq("id", template.id);
  }
  return remix;
}

// ── Admin pipeline stats ─────────────────────────────────────────────────────

export async function pipelineStats(): Promise<Record<string, unknown>> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("viral_items").select("status, velocity, viral_score, created_at").is("user_id", null);
  if (error) {
    if (tableMissing(error.message)) return { migrated: false };
    throw new Error(error.message);
  }
  const rows = (data as { status: string; velocity: string | null; viral_score: number; created_at: string }[]) ?? [];
  const { count: templates } = await admin.from("viral_templates").select("id", { count: "exact", head: true });
  const byStatus: Record<string, number> = {};
  const byVelocity: Record<string, number> = {};
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (r.velocity) byVelocity[r.velocity] = (byVelocity[r.velocity] ?? 0) + 1;
  }
  const newest = rows.map((r) => r.created_at).sort().at(-1) ?? null;
  return {
    migrated: true,
    items: rows.length,
    templates: templates ?? 0,
    byStatus,
    byVelocity,
    lastDiscoveredAt: newest,
    avgScore: rows.length ? Math.round(rows.reduce((s, r) => s + Number(r.viral_score), 0) / rows.length) : 0,
    weights: SCORE_WEIGHTS,
  };
}
