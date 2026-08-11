import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BrandBrief } from "@/lib/research";
import { engagementScore, type Metric } from "@/lib/metrics";

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
  /** Playbook fields (migration 0016; null/absent pre-migration). */
  objective?: string | null;
  template?: string | null;
  milestones?: { id: string; title: string; metric: "published" | "engagement"; target: number }[] | null;
  /** Cost-only autonomy dial (migration 0018): auto-run actions whose estimated
   * cost is <= this many credits; null = ask for everything. */
  auto_approve_max_credits?: number | null;
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
  metrics: Record<string, Metric> | null;
  metrics_at: string | null;
  scheduled_for: string | null;
  created_at: string;
  published_at: string | null;
  /** Why the planner proposed this action (migration 0014; null pre-migration). */
  reasoning?: string | null;
  /** Credits the user approves up front (migration 0014; null pre-migration / text posts). */
  estimated_credits?: number | null;
};

// select * so reads keep working whether or not migrations 0014 (post
// lifecycle) / 0016 (playbook fields) have been applied — MB migrations are
// user-applied.
const COLS = "*";
const POST_COLS = "*";

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

/** Draft posts awaiting review/approval across all campaigns, newest first. */
export async function listDrafts(userId: string, limit = 20): Promise<CampaignPost[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("campaign_posts")
    .select(POST_COLS)
    .eq("user_id", userId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as CampaignPost[]) ?? [];
}

/** Upcoming posts: approved (publishing soon) + scheduled, soonest first. */
export async function listScheduled(userId: string): Promise<CampaignPost[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("campaign_posts")
    .select(POST_COLS)
    .eq("user_id", userId)
    .in("status", ["approved", "publishing", "scheduled"])
    .order("scheduled_for", { ascending: true, nullsFirst: true });
  return (data as CampaignPost[]) ?? [];
}

/** Published + failed posts, most recent first. */
export async function listHistory(userId: string, limit = 40): Promise<CampaignPost[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("campaign_posts")
    .select(POST_COLS)
    .eq("user_id", userId)
    .in("status", ["published", "failed"])
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as CampaignPost[]) ?? [];
}

export type ScheduledPostInput = {
  type: "text" | "image" | "video";
  title: string | null;
  caption: string;
  hashtags: string[];
  link: string | null;
  mediaUrl: string | null;
  perPlatform: Record<string, string>;
  channels: string[];
  scheduledFor: string;
};

/** Store a standalone (no-campaign) post scheduled to go out later. */
export async function insertScheduledPost(userId: string, p: ScheduledPostInput): Promise<CampaignPost> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("campaign_posts")
    .insert({
      user_id: userId,
      campaign_id: null,
      status: "scheduled",
      type: p.type,
      title: p.title,
      caption: p.caption,
      hashtags: p.hashtags,
      link: p.link,
      media_url: p.mediaUrl,
      per_platform: p.perPlatform,
      channels: p.channels,
      scheduled_for: p.scheduledFor,
    })
    .select(POST_COLS)
    .single();
  if (error) throw new Error(error.message);
  return data as CampaignPost;
}

/**
 * A short "what's working" hint from this campaign's published posts, to bias the
 * planner. Returns null until there's enough engagement data to be meaningful.
 */
export async function buildInsights(userId: string, campaignId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("campaign_posts")
    .select("type, angle, metrics")
    .eq("user_id", userId)
    .eq("campaign_id", campaignId)
    .eq("status", "published")
    .not("metrics", "is", null)
    .limit(50);

  const rows = (data as { type: string; angle: string | null; metrics: Record<string, Metric> | null }[]) ?? [];
  if (rows.length < 3) return null;

  const byAngle = new Map<string, number>();
  const byType = new Map<string, number>();
  for (const r of rows) {
    const s = engagementScore(r.metrics);
    if (r.angle) byAngle.set(r.angle, (byAngle.get(r.angle) ?? 0) + s);
    byType.set(r.type, (byType.get(r.type) ?? 0) + s);
  }
  const topAngles = [...byAngle.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([a]) => a);
  const topType = [...byType.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const parts: string[] = [];
  if (topAngles.length) parts.push(`your highest-engagement angles so far: ${topAngles.join("; ")}`);
  if (topType) parts.push(`the ${topType} format is performing best`);
  if (parts.length === 0) return null;
  return `Performance signal — favor what's working: ${parts.join("; ")}.`;
}

/** Edit a campaign's posting cadence. */
export async function setCampaignFrequency(userId: string, id: string, frequency: number): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("campaigns")
    .update({ frequency, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Edit a campaign's settings (name, cadence, content types, channels, budget, mode). */
export async function updateCampaignSettings(
  userId: string,
  id: string,
  fields: {
    name?: string;
    frequency?: number;
    media_types?: string[];
    channels?: string[];
    budget_credits?: number | null;
    mode?: CampaignMode;
    auto_approve_max_credits?: number | null;
  },
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("campaigns")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(error.message);
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
  reasoning?: string | null;
  estimated_credits?: number | null;
};

/** Columns added by migration 0014 — stripped and retried if the DB predates it. */
const LIFECYCLE_COLS = ["reasoning", "estimated_credits"] as const;

/**
 * Insert campaign_posts rows, tolerating a pre-0014 database: if the insert
 * fails because the lifecycle columns don't exist yet, retry without them.
 */
export async function insertPostRows(
  admin: ReturnType<typeof createAdminClient>,
  values: Record<string, unknown>[],
): Promise<CampaignPost[]> {
  const first = await admin.from("campaign_posts").insert(values).select(POST_COLS);
  if (!first.error) return (first.data as CampaignPost[]) ?? [];

  const msg = first.error.message || "";
  if (LIFECYCLE_COLS.some((c) => msg.includes(c))) {
    const stripped = values.map((v) => {
      const copy = { ...v };
      for (const c of LIFECYCLE_COLS) delete copy[c];
      return copy;
    });
    const retry = await admin.from("campaign_posts").insert(stripped).select(POST_COLS);
    if (!retry.error) return (retry.data as CampaignPost[]) ?? [];
    throw new Error(retry.error.message);
  }
  throw new Error(msg);
}

export async function insertPosts(userId: string, campaignId: string, rows: PlannedPostRow[]): Promise<CampaignPost[]> {
  const admin = createAdminClient();
  return insertPostRows(
    admin,
    rows.map((r) => ({ ...r, user_id: userId, campaign_id: campaignId, status: "draft" })),
  );
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
  /** Playbook fields (migration 0016) — stripped on insert if the DB predates it. */
  objective?: string | null;
  template?: string | null;
  milestones?: { id: string; title: string; metric: "published" | "engagement"; target: number }[] | null;
  /** Autonomy dial (migration 0018) — stripped on insert if the DB predates it. */
  autoApproveMaxCredits?: number | null;
};

/** Columns from later migrations (0016, 0018) — stripped one-by-one (only the
 * ones the error names) and retried, so a partially-migrated DB keeps every
 * column it does have. */
const OPTIONAL_CAMPAIGN_COLS = ["objective", "template", "milestones", "auto_approve_max_credits"] as const;

export async function createCampaign(userId: string, input: CreateCampaignInput): Promise<Campaign> {
  const admin = createAdminClient();
  const values: Record<string, unknown> = {
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
    objective: input.objective ?? null,
    template: input.template ?? null,
    milestones: input.milestones ?? null,
    auto_approve_max_credits: input.autoApproveMaxCredits ?? null,
  };

  // Retry, dropping only the optional columns the error actually names.
  for (let attempt = 0; attempt <= OPTIONAL_CAMPAIGN_COLS.length; attempt++) {
    const res = await admin.from("campaigns").insert(values).select(COLS).single();
    if (!res.error) return res.data as Campaign;
    const msg = res.error.message || "";
    const missing = OPTIONAL_CAMPAIGN_COLS.filter((c) => c in values && msg.includes(c));
    if (missing.length === 0) throw new Error(msg);
    for (const c of missing) delete values[c];
  }
  throw new Error("Could not save the playbook.");
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
