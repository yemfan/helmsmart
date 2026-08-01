import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BrandBrief } from "@/lib/research";

/**
 * Autopilot campaign storage. Rows are owner-RLS'd, but the server routes go
 * through the service-role client and scope every query by user_id explicitly —
 * same pattern as lib/social.ts.
 */

export type CampaignMode = "review" | "auto";
export type CampaignStatus = "active" | "paused";

export type Campaign = {
  id: string;
  link: string;
  name: string | null;
  brief: BrandBrief | null;
  media_types: string[];
  channels: string[];
  frequency: number;
  budget_credits: number | null;
  spent_credits: number;
  mode: CampaignMode;
  status: CampaignStatus;
  next_run_at: string | null;
  created_at: string;
};

export type PostStatus = "draft" | "approved" | "scheduled" | "publishing" | "published" | "failed" | "skipped";

export type CampaignPost = {
  id: string;
  campaign_id: string;
  status: PostStatus;
  type: "text" | "image" | "video";
  angle: string | null;
  title: string | null;
  caption: string | null;
  hashtags: string[];
  link: string | null;
  media_prompt: string | null;
  media_url: string | null;
  per_platform: Record<string, string> | null;
  channels: string[];
  results: { platform: string; ok: boolean; url?: string | null; error?: string }[] | null;
  scheduled_for: string | null;
  created_at: string;
  published_at: string | null;
};

const COLS =
  "id, link, name, brief, media_types, channels, frequency, budget_credits, spent_credits, mode, status, next_run_at, created_at";
const POST_COLS =
  "id, campaign_id, status, type, angle, title, caption, hashtags, link, media_prompt, media_url, per_platform, channels, results, scheduled_for, created_at, published_at";

export async function listCampaigns(userId: string): Promise<Campaign[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("campaigns")
    .select(COLS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data as Campaign[]) ?? [];
}

export async function getCampaign(userId: string, id: string): Promise<Campaign | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("campaigns").select(COLS).eq("user_id", userId).eq("id", id).maybeSingle();
  return (data as Campaign) ?? null;
}

export async function listPosts(userId: string, campaignId: string): Promise<CampaignPost[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("campaign_posts")
    .select(POST_COLS)
    .eq("user_id", userId)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });
  return (data as CampaignPost[]) ?? [];
}

export async function getPost(userId: string, id: string): Promise<CampaignPost | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("campaign_posts").select(POST_COLS).eq("user_id", userId).eq("id", id).maybeSingle();
  return (data as CampaignPost) ?? null;
}

export type PlannedPostRow = {
  type: "text" | "image" | "video";
  angle: string;
  title: string;
  caption: string;
  hashtags: string[];
  link: string | null;
  media_prompt: string;
  channels: string[];
};

export async function insertPosts(userId: string, campaignId: string, rows: PlannedPostRow[]): Promise<CampaignPost[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("campaign_posts")
    .insert(rows.map((r) => ({ ...r, user_id: userId, campaign_id: campaignId, status: "draft" })))
    .select(POST_COLS);
  if (error) throw new Error(error.message);
  return (data as CampaignPost[]) ?? [];
}

export async function updatePost(userId: string, id: string, fields: Record<string, unknown>): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("campaign_posts").update(fields).eq("user_id", userId).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deletePost(userId: string, id: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("campaign_posts").delete().eq("user_id", userId).eq("id", id);
}

/** Bump a campaign's spent-credit tally after a generation. */
export async function addSpentCredits(userId: string, campaignId: string, delta: number, current: number): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("campaigns")
    .update({ spent_credits: current + delta, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", campaignId);
}

export type CreateCampaignInput = {
  link: string;
  brief: BrandBrief;
  name: string;
  mediaTypes: string[];
  channels: string[];
  frequency: number;
  budgetCredits: number | null;
  mode: CampaignMode;
};

export async function createCampaign(userId: string, input: CreateCampaignInput): Promise<Campaign> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("campaigns")
    .insert({
      user_id: userId,
      link: input.link,
      name: input.name,
      brief: input.brief,
      media_types: input.mediaTypes,
      channels: input.channels,
      frequency: input.frequency,
      budget_credits: input.budgetCredits,
      mode: input.mode,
      status: "active",
    })
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  return data as Campaign;
}

export async function setCampaignStatus(userId: string, id: string, status: CampaignStatus): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("campaigns")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteCampaign(userId: string, id: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("campaigns").delete().eq("user_id", userId).eq("id", id);
}
