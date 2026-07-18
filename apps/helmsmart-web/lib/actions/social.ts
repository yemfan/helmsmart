"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { publishLinkedInPost } from "@/lib/linkedin";
import { canPublish, patchSocialPost, unsupportedReason } from "@/lib/social-platforms";
// NOTE: import types only — never RE-EXPORT a type from a "use server" file.
// It becomes a runtime value export and throws ReferenceError on every action
// in the module.
import type { Platform } from "@/lib/social-platforms";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
type Tone = "professional" | "casual" | "witty" | "promotional" | "educational";

const CHAR_LIMITS: Record<Platform, number> = {
  x: 280,
  linkedin: 3000,
  facebook: 63206,
  instagram: 2200,
};

const TONE_DESC: Record<Tone, string> = {
  professional: "formal and authoritative",
  casual: "friendly and conversational",
  witty: "clever, light-hearted with mild humour",
  promotional: "persuasive and action-oriented with a clear CTA",
  educational: "informative and helpful, teaches the reader something",
};

// ─── Generate post with AI ────────────────────────────────────────────────────

export async function generateSocialPost(
  platform: Platform,
  tone: Tone,
  topic: string,
  orgName: string
): Promise<string> {
  const limit = CHAR_LIMITS[platform];
  const platformLabel = platform === "x" ? "X (Twitter)" : platform.charAt(0).toUpperCase() + platform.slice(1);

  const prompt = `Write a ${platformLabel} post for "${orgName}" about: ${topic}

Tone: ${TONE_DESC[tone]}
Character limit: ${limit} characters (MUST stay under this limit)
Platform: ${platformLabel}

Rules:
- No hashtag spam — 1-3 relevant hashtags max for Instagram/LinkedIn, 0-2 for X, none for Facebook
- No emojis unless the tone warrants it
- Write the post text ONLY — no explanation, no quotation marks around it
- Stay under the character limit
- Make it feel authentic, not corporate
${platform === "instagram" ? "- Instagram works best with a short punchy opening line" : ""}
${platform === "linkedin" ? "- LinkedIn posts get more reach with a hook in the first line and line breaks" : ""}
${platform === "x" ? "- X posts should be punchy and direct — get to the point immediately" : ""}`;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (response.content[0] as { type: string; text: string }).text ?? "";
  // Truncate to platform limit
  return text.slice(0, limit);
}

// ─── Generate variants (Week 54) ──────────────────────────────────────────────

function parseStringArray(raw: string, max: number): string[] {
  let t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("[");
  const end = t.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) t = t.slice(start, end + 1);
  try {
    const arr = JSON.parse(t);
    if (Array.isArray(arr)) return arr.map((s) => String(s).trim()).filter(Boolean).slice(0, max);
  } catch {
    // fall through to paragraph splitting
  }
  return raw.split(/\n{2,}/).map((s) => s.replace(/^\s*[-*\d.)]+\s*/, "").trim()).filter(Boolean).slice(0, max);
}

export async function generateSocialVariants(
  platform: Platform,
  tone: Tone,
  topic: string,
  orgName: string,
  count = 3
): Promise<string[]> {
  const limit = CHAR_LIMITS[platform];
  const platformLabel = platform === "x" ? "X (Twitter)" : platform.charAt(0).toUpperCase() + platform.slice(1);

  const prompt = `Write ${count} DISTINCT ${platformLabel} post options for "${orgName}" about: ${topic}

Tone: ${TONE_DESC[tone]}
Each option MUST stay under ${limit} characters.
Make the ${count} genuinely different angles (e.g. a hook, a question, a benefit, a short story).
No hashtag spam; no surrounding quotes.

Respond with ONLY a JSON array of ${count} strings: ["option one", "option two", "option three"]`;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (response.content[0] as { type: string; text: string }).text ?? "";
  return parseStringArray(text, count).map((s) => s.slice(0, limit));
}

// ─── Refine post (Week 54) ────────────────────────────────────────────────────

export type SocialRefineMode = "shorter" | "punchier" | "cta" | "hashtags" | "grammar";

const SOCIAL_REFINE: Record<SocialRefineMode, string> = {
  shorter:  "Make it more concise and punchy without losing the core message.",
  punchier: "Strengthen the opening hook and make the writing more engaging.",
  cta:      "Add a clear, natural call to action.",
  hashtags: "Add 1–3 relevant, non-spammy hashtags (tidy any existing ones).",
  grammar:  "Fix spelling, grammar, and clarity without changing the meaning or tone.",
};

export async function refineSocialPost(
  platform: Platform,
  tone: Tone,
  content: string,
  mode: SocialRefineMode,
  orgName: string
): Promise<string> {
  if (!content.trim()) throw new Error("Nothing to refine yet");
  const limit = CHAR_LIMITS[platform];
  const platformLabel = platform === "x" ? "X (Twitter)" : platform.charAt(0).toUpperCase() + platform.slice(1);

  const prompt = `Revise this ${platformLabel} post for "${orgName}".
Instruction: ${SOCIAL_REFINE[mode] ?? SOCIAL_REFINE.grammar}
Tone: ${TONE_DESC[tone]}

Rules:
- Stay under ${limit} characters.
- Return ONLY the revised post text — no quotes, no markdown, no commentary.

Post:
${content}`;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });

  let text = (response.content[0] as { type: string; text: string }).text ?? "";
  text = text.trim();
  const fence = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  return text.slice(0, limit);
}

// ─── Create draft ─────────────────────────────────────────────────────────────

export async function createSocialPost(data: {
  platform: Platform;
  content: string;
  tone: Tone;
  scheduledAt?: string | null;
  aiPrompt?: string | null;
  generatedByAi: boolean;
}) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error("No org");

  const supabase = await createClient();

  await supabase.from("social_posts").insert({
    organization_id: orgId,
    platform: data.platform,
    content: data.content,
    tone: data.tone,
    status: data.scheduledAt ? "scheduled" : "draft",
    scheduled_at: data.scheduledAt ?? null,
    generated_by_ai: data.generatedByAi,
    ai_prompt: data.aiPrompt ?? null,
  });

  revalidatePath("/social");
}

// ─── Update post ──────────────────────────────────────────────────────────────

export async function updateSocialPost(postId: string, data: {
  content?: string;
  status?: "draft" | "scheduled" | "published" | "failed";
  scheduledAt?: string | null;
  publishedUrl?: string | null;
}) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error("No org");

  const supabase = await createClient();
  await supabase.from("social_posts").update({
    ...data.content !== undefined    ? { content: data.content } : {},
    ...data.status !== undefined     ? { status: data.status }   : {},
    ...data.scheduledAt !== undefined ? { scheduled_at: data.scheduledAt } : {},
    ...data.publishedUrl !== undefined ? { published_url: data.publishedUrl, published_at: new Date().toISOString() } : {},
    updated_at: new Date().toISOString(),
  }).eq("id", postId).eq("organization_id", orgId);

  revalidatePath("/social");
}

// ─── Publish a post now (LinkedIn) ────────────────────────────────────────────

/**
 * Publish a saved post to its platform immediately and flip its status.
 *
 * LinkedIn is wired up (Share API). An unsupported platform now marks the post
 * FAILED with a reason rather than returning a soft error and leaving the row
 * untouched — the old behaviour left it sitting at 'scheduled' looking queued,
 * which is the same silent trap the cron had. See lib/social-platforms.ts.
 *
 * Scheduled posts are published by the /api/cron/social/publish cron.
 */
export async function publishSocialPost(
  postId: string,
): Promise<{ ok: boolean; error?: string; url?: string | null }> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error("No org");

  const supabase = await createClient();
  const { data: post } = await supabase
    .from("social_posts")
    .select("id, platform, content")
    .eq("id", postId)
    .eq("organization_id", orgId)
    .single();
  if (!post) return { ok: false, error: "Post not found" };

  const nowIso = new Date().toISOString();

  if (!canPublish(post.platform as string)) {
    const error = unsupportedReason(post.platform as string);
    await patchSocialPost(supabase, postId, {
      status: "failed",
      last_error: error,
      updated_at: nowIso,
    });
    revalidatePath("/social");
    return { ok: false, error };
  }

  const res = await publishLinkedInPost(orgId, post.content as string);
  await patchSocialPost(
    supabase,
    postId,
    res.ok
      ? {
          status: "published",
          published_url: res.url ?? null,
          published_at: nowIso,
          last_error: null,
          updated_at: nowIso,
        }
      : {
          status: "failed",
          last_error: res.error ?? "Publishing failed.",
          updated_at: nowIso,
        },
  );

  revalidatePath("/social");
  return { ok: res.ok, error: res.error, url: res.url };
}

// ─── Delete post ──────────────────────────────────────────────────────────────

export async function deleteSocialPost(postId: string) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error("No org");

  const supabase = await createClient();
  await supabase.from("social_posts").delete().eq("id", postId).eq("organization_id", orgId);
  revalidatePath("/social");
}

// ─── Save voice agent settings ────────────────────────────────────────────────

export async function saveVoiceSettings(data: {
  enabled: boolean;
  agentName: string;
  businessName: string;
  greeting: string;
  prompt: string;
}) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error("No org");

  const supabase = await createClient();
  await supabase.from("organizations").update({
    voice_agent_enabled: data.enabled,
    voice_agent_name: data.agentName.trim(),
    voice_agent_business_name: data.businessName.trim(),
    voice_agent_greeting: data.greeting,
    voice_agent_prompt: data.prompt,
  }).eq("id", orgId);

  revalidatePath("/voice");
}
