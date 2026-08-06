"use server";

/**
 * Social topic pool — AI-generated (and manual) post topics stored as
 * first-class `social_topics` records, feeding post scheduling.
 *
 * Topics are generated from the org's OWN business profile (category /
 * description / location on `organizations`, plus `knowledge_base`), so they're
 * concrete to the business rather than generic. Mirrors the org-scoping +
 * Anthropic conventions in lib/actions/social.ts.
 */

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type TopicStatus = "suggested" | "approved" | "archived";

export type SocialTopic = {
  id: string;
  topic: string;
  theme: string | null;
  source: "ai" | "manual";
  status: TopicStatus;
  used_count: number;
  created_at: string;
};

const TOPIC_COLS = "id, topic, theme, source, status, used_count, created_at";

async function requireOrgId(): Promise<string> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error("No org");
  return orgId;
}

type Db = Awaited<ReturnType<typeof createClient>>;

/** Short, on-brand context assembled from the org's own profile + knowledge base. */
async function buildOrgContext(db: Db, orgId: string): Promise<string> {
  const lines: string[] = [];
  const { data: org } = await db
    .from("organizations")
    .select("name, business_category, business_description, business_location, website")
    .eq("id", orgId)
    .maybeSingle();
  const o = org as {
    name?: string;
    business_category?: string | null;
    business_description?: string | null;
    business_location?: string | null;
    website?: string | null;
  } | null;
  if (o?.name) lines.push(`Business name: ${o.name}.`);
  if (o?.business_category) lines.push(`Category: ${o.business_category}.`);
  if (o?.business_location) lines.push(`Location: ${o.business_location}.`);
  if (o?.business_description) lines.push(`About: ${o.business_description}`);
  if (o?.website) lines.push(`Website: ${o.website}`);
  try {
    const { data: kb } = await db
      .from("knowledge_base")
      .select("title, content")
      .eq("organization_id", orgId)
      .eq("active", true)
      .order("sort", { ascending: true })
      .limit(10);
    for (const row of (kb as { title: string; content: string }[]) ?? []) {
      lines.push(`${row.title}: ${row.content}`);
    }
  } catch {
    // knowledge_base is optional context
  }
  return lines.join("\n").trim();
}

/** All non-archived topics for the active org, newest first. */
export async function listSocialTopics(): Promise<SocialTopic[]> {
  const orgId = await requireOrgId();
  const db = await createClient();
  const { data } = await db
    .from("social_topics")
    .select(TOPIC_COLS)
    .eq("organization_id", orgId)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(100);
  return (data as SocialTopic[]) ?? [];
}

/** Generate `count` AI topics from the business profile; store as 'suggested'. */
export async function generateSocialTopics(
  count = 8,
): Promise<{ ok: boolean; error?: string; topics?: SocialTopic[] }> {
  const orgId = await requireOrgId();
  const db = await createClient();

  const context = await buildOrgContext(db, orgId);
  if (!context) {
    return {
      ok: false,
      error:
        "Tell us about your business first (category, description, location) so topics can be tailored.",
    };
  }

  const prompt = `You are a social media strategist. Based on the business below, suggest ${count} distinct social media POST TOPICS (not full posts) it could publish over the coming weeks.

Rules:
- Each topic is a short phrase (max ~10 words), specific to THIS business — not generic filler.
- Cover a mix: evergreen value/tips, local or community angles, behind-the-scenes, and the occasional promotion.
- No hashtags, no quotes, no numbering.

Business:
${context}

Respond with ONLY a JSON array of ${count} strings.`;

  let raw: string[] = [];
  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (response.content[0] as { type: string; text: string }).text ?? "";
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) raw = parsed;
    }
  } catch (e) {
    console.error("generateSocialTopics AI error:", e);
    return { ok: false, error: "Couldn't generate topics right now. Please try again." };
  }

  const clean = raw
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .map((t) => t.trim().replace(/^["'\s-]+|["'\s]+$/g, "").slice(0, 160))
    .filter(Boolean)
    .slice(0, count);

  if (clean.length === 0) {
    return { ok: false, error: "No topics came back — please try again." };
  }

  const { data, error } = await db
    .from("social_topics")
    .insert(
      clean.map((topic) => ({
        organization_id: orgId,
        topic,
        source: "ai",
        status: "suggested",
      })),
    )
    .select(TOPIC_COLS);

  if (error) {
    console.error("generateSocialTopics insert error:", error.message);
    return {
      ok: false,
      error: "Topics were generated but couldn't be saved. (Is migration 00086 applied?)",
    };
  }

  revalidatePath("/social");
  return { ok: true, topics: (data as SocialTopic[]) ?? [] };
}

/** Approve / re-suggest / archive a topic. */
export async function setTopicStatus(id: string, status: TopicStatus): Promise<void> {
  const orgId = await requireOrgId();
  const db = await createClient();
  const { error } = await db
    .from("social_topics")
    .update({ status })
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) console.error("setTopicStatus error:", error.message);
  revalidatePath("/social");
}

/**
 * Fill the weekly autopilot schedule from the approved topic pool. Assigns up to
 * 7 approved topics to weekdays (Mon→Sun) in org_social_autopilot.day_topics —
 * the same map the autopilot form + publish cron read. Does NOT force autopilot
 * on; reports back whether it's enabled so the UI can nudge.
 */
export async function applyApprovedTopicsToSchedule(): Promise<{
  ok: boolean;
  error?: string;
  scheduled?: number;
  enabled?: boolean;
}> {
  const orgId = await requireOrgId();
  const db = await createClient();

  const { data: approved } = await db
    .from("social_topics")
    .select("id, topic")
    .eq("organization_id", orgId)
    .eq("status", "approved")
    .order("created_at", { ascending: true })
    .limit(7);
  const list = (approved as { id: string; topic: string }[]) ?? [];
  if (list.length === 0) {
    return { ok: false, error: "Approve some topics first, then add them to the schedule." };
  }

  // Mon, Tue, … Sun — fill as many days as there are topics (max 7).
  const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const dayTopics: Record<string, string> = {};
  list.forEach((t, i) => {
    dayTopics[String(WEEKDAY_ORDER[i])] = t.topic.trim().slice(0, 120);
  });

  const { data: cur } = await db
    .from("org_social_autopilot")
    .select("enabled")
    .eq("organization_id", orgId)
    .maybeSingle();
  const enabled = Boolean((cur as { enabled?: boolean } | null)?.enabled);

  const { error } = await db.from("org_social_autopilot").upsert(
    { organization_id: orgId, day_topics: dayTopics, updated_at: new Date().toISOString() },
    { onConflict: "organization_id" },
  );
  if (error) {
    console.error("applyApprovedTopicsToSchedule error:", error.message);
    return { ok: false, error: "Couldn't update the schedule. Please try again." };
  }

  revalidatePath("/social");
  revalidatePath("/settings");
  return { ok: true, scheduled: list.length, enabled };
}

/** Add a manual topic (already approved). */
export async function addManualTopic(text: string): Promise<void> {
  const topic = text.trim().slice(0, 160);
  if (!topic) return;
  const orgId = await requireOrgId();
  const db = await createClient();
  const { error } = await db.from("social_topics").insert({
    organization_id: orgId,
    topic,
    source: "manual",
    status: "approved",
  });
  if (error) console.error("addManualTopic error:", error.message);
  revalidatePath("/social");
}
