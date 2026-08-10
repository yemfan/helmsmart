import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { anthropicJson } from "@/lib/ai";
import { buildBrandBrief, type BrandBrief } from "@/lib/research";

/**
 * Business profile (migration 0021, lives on brand_kits): the user pastes
 * their company URL once; we research the business with the same engine as
 * playbook research, store the brief, and generate topic presets tailored to
 * that business. Empty Brand Kit fields (name / voice / audience) are filled
 * from the research — never overwriting anything the user typed.
 *
 * All reads/writes tolerate a pre-migration DB.
 */

export type BusinessProfile = {
  companyUrl: string | null;
  name: string | null;
  summary: string | null;
  audience: string | null;
  topicPresets: string[];
  /** The brand-kit fields as persisted after auto-fill (research only). */
  brand?: { brand_name: string | null; voice: string | null; audience: string | null };
};

const PROFILE_COLS = ["company_url", "business", "topic_presets"] as const;

function columnMissing(message: string | undefined): boolean {
  const m = message ?? "";
  return PROFILE_COLS.some((c) => m.includes(c));
}

export async function getBusinessProfile(userId: string): Promise<BusinessProfile | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("brand_kits").select("*").eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const business = (row.business ?? null) as BrandBrief | null;
  const presets = Array.isArray(row.topic_presets)
    ? (row.topic_presets as unknown[]).filter((t): t is string => typeof t === "string" && !!t.trim())
    : [];
  if (!row.company_url && !business && presets.length === 0) return null;
  return {
    companyUrl: (row.company_url as string | null) ?? null,
    name: business?.name ?? null,
    summary: business?.summary ?? null,
    audience: business?.audience ?? null,
    topicPresets: presets,
  };
}

const TOPICS_SCHEMA = {
  type: "object",
  properties: { topics: { type: "array", items: { type: "string" } } },
  required: ["topics"],
  additionalProperties: false,
};

/** One structured pass: the brief → 8-12 concrete, recurring post topics. */
async function generateTopicPresets(brief: BrandBrief): Promise<string[]> {
  const out = await anthropicJson<{ topics: string[] }>({
    system: [
      "You design a recurring social-content rotation for one business. From its brief, return 8-12 post TOPICS the",
      "business can post about again and again (each firing produces a fresh post on the topic).",
      "Rules: specific to THIS business and audience (name their products, niche, customer moments) — never generic",
      "filler like 'industry news'. Each topic is a short phrase (4-10 words), no numbering, no hashtags.",
      "Mix: proof/stories, education, product angles, behind-the-scenes, audience pain points, community.",
    ].join("\n"),
    user: `Business brief:\n${JSON.stringify(brief)}`,
    schema: TOPICS_SCHEMA,
    maxTokens: 900,
  });
  return out.topics
    .filter((t): t is string => typeof t === "string" && !!t.trim())
    .map((t) => t.trim().slice(0, 120))
    .slice(0, 12);
}

/**
 * Research the URL, generate tailored presets, persist everything. Returns
 * the fresh profile. Throws with a friendly message on research failure.
 */
export async function researchBusinessProfile(userId: string, url: string): Promise<BusinessProfile> {
  const brief = await buildBrandBrief(url);
  const topicPresets = await generateTopicPresets(brief).catch(() => brief.pillars?.slice(0, 10) ?? []);

  const admin = createAdminClient();
  const { data: existing } = await admin.from("brand_kits").select("*").eq("user_id", userId).maybeSingle();
  const cur = (existing ?? {}) as Record<string, unknown>;

  const values: Record<string, unknown> = {
    user_id: userId,
    company_url: url,
    business: brief,
    topic_presets: topicPresets,
    // Fill only what the user hasn't typed themselves.
    brand_name: (cur.brand_name as string) || brief.name || null,
    voice: (cur.voice as string) || [brief.tone, brief.summary].filter(Boolean).join(". ").slice(0, 600) || null,
    audience: (cur.audience as string) || brief.audience || null,
    updated_at: new Date().toISOString(),
  };

  const first = await admin.from("brand_kits").upsert(values, { onConflict: "user_id" });
  if (first.error) {
    if (!columnMissing(first.error.message)) throw new Error(first.error.message);
    // Pre-0021 DB: keep the Brand Kit auto-fill, drop the profile columns.
    for (const c of PROFILE_COLS) delete values[c];
    const retry = await admin.from("brand_kits").upsert(values, { onConflict: "user_id" });
    if (retry.error) throw new Error(retry.error.message);
  }

  return {
    companyUrl: url,
    name: brief.name ?? null,
    summary: brief.summary ?? null,
    audience: brief.audience ?? null,
    topicPresets,
    brand: {
      brand_name: (values.brand_name as string | null) ?? null,
      voice: (values.voice as string | null) ?? null,
      audience: (values.audience as string | null) ?? null,
    },
  };
}
