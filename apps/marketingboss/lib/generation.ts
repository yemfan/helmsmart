import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generate, type GenType } from "@/lib/fal";
import type { Campaign, CampaignPost } from "@/lib/campaigns";

/**
 * Shared generation pipeline: reserve credits → generate on fal.ai → persist the
 * media to Storage → record a `generations` row → return the durable URL(s).
 * Used by the Studio (/api/generate) and by autopilot (per campaign post).
 */

export class CreditError extends Error {
  cost: number;
  constructor(cost: number) {
    super(`Not enough credits — this costs ${cost}.`);
    this.name = "CreditError";
    this.cost = cost;
  }
}

export class BudgetError extends Error {
  constructor() {
    super("This campaign has reached its credit budget.");
    this.name = "BudgetError";
  }
}

/** fal credit cost, weighted by model. */
export function creditCost(type: GenType, hasReference: boolean): number {
  return type === "video" ? 20 : hasReference ? 2 : 1;
}

function extFrom(url: string, type: GenType): { ext: string; contentType: string } {
  const m = url.split("?")[0].match(/\.(\w{2,4})$/);
  const ext = (m?.[1] || (type === "video" ? "mp4" : "jpg")).toLowerCase();
  const contentType =
    type === "video" ? "video/mp4" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return { ext, contentType };
}

export type GenParams = {
  type: GenType;
  prompt: string;
  aspect: string;
  model?: string;
  imageUrl?: string;
  imageUrls?: string[];
  videoUrls?: string[];
  /** Source clip for a video-to-video edit / swap. */
  videoUrl?: string;
  keepAudio?: boolean;
};

/** UGC (Seedance) clips cost more than a Kling clip. */
export const UGC_CREDIT = 35;
/** Video-to-video edit / swap (Kling O1) — heavier than a plain clip. */
export const SWAP_CREDIT = 25;

function costFor(params: GenParams): number {
  if (params.videoUrl) return SWAP_CREDIT;
  if (params.model?.startsWith("bytedance/seedance")) return UGC_CREDIT;
  return creditCost(params.type, !!params.imageUrl);
}

/**
 * Reserve credits, generate on fal, persist to Storage + `generations`. The
 * credit reserve/refund is injected so the same core serves a user session
 * (consume_credits, keyed on auth.uid()) and the cron (deduct_credits by id).
 */
async function generateCore(
  client: SupabaseClient,
  userId: string,
  params: GenParams,
  reserve: (cost: number) => Promise<number>,
  refund: (cost: number) => Promise<void>,
): Promise<{ urls: string[]; model: string; credits: number; cost: number }> {
  const cost = costFor(params);

  const remaining = await reserve(cost);
  if (remaining < 0) throw new CreditError(cost);

  try {
    const result = await generate(params);
    const savedUrls: string[] = [];
    for (const src of result.urls) {
      const media = await fetch(src);
      if (!media.ok) throw new Error(`Could not fetch rendered media (${media.status}).`);
      const bytes = new Uint8Array(await media.arrayBuffer());
      const { ext, contentType } = extFrom(src, params.type);
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await client.storage.from("media").upload(path, bytes, { contentType, upsert: false });
      if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);
      const publicUrl = client.storage.from("media").getPublicUrl(path).data.publicUrl;

      const { error: dbErr } = await client.from("generations").insert({
        user_id: userId,
        type: params.type,
        prompt: params.prompt,
        model: result.model,
        aspect: params.aspect,
        media_url: publicUrl,
      });
      if (dbErr) throw new Error(`Save failed: ${dbErr.message}`);
      savedUrls.push(publicUrl);
    }
    return { urls: savedUrls, model: result.model, credits: remaining, cost };
  } catch (e) {
    await refund(cost); // best-effort
    throw e;
  }
}

/** Session path — spends the calling user's credits via consume_credits(). */
export async function generateAndStore(
  supabase: SupabaseClient,
  userId: string,
  params: GenParams,
): Promise<{ urls: string[]; model: string; credits: number; cost: number }> {
  return generateCore(
    supabase,
    userId,
    params,
    async (cost) => {
      const { data, error } = await supabase.rpc("consume_credits", { p_cost: cost });
      if (error) throw new Error("Could not check credits.");
      return typeof data === "number" ? data : -1;
    },
    async (cost) => {
      await supabase.rpc("consume_credits", { p_cost: -cost });
    },
  );
}

/** Service-role path (cron) — spends a specific user's credits via deduct_credits(). */
export async function generateAndStoreAdmin(
  admin: SupabaseClient,
  userId: string,
  params: GenParams,
): Promise<{ urls: string[]; model: string; credits: number; cost: number }> {
  return generateCore(
    admin,
    userId,
    params,
    async (cost) => {
      const { data, error } = await admin.rpc("deduct_credits", { p_user: userId, p_cost: cost });
      if (error) throw new Error("Could not check credits.");
      return typeof data === "number" ? data : -1;
    },
    async (cost) => {
      await admin.rpc("deduct_credits", { p_user: userId, p_cost: -cost });
    },
  );
}

/**
 * Generate the media for one autopilot post, honoring the campaign's credit
 * budget. Returns the media URL + the credits spent (caller persists both).
 */
export async function generatePostMedia(
  supabase: SupabaseClient,
  userId: string,
  campaign: Campaign,
  post: CampaignPost,
): Promise<{ url: string; cost: number }> {
  const type = post.type as GenType;
  const cost = creditCost(type, false);
  if (campaign.budget_credits != null && campaign.spent_credits + cost > campaign.budget_credits) {
    throw new BudgetError();
  }
  const aspect = type === "video" ? "16:9" : "1:1";
  const out = await generateAndStore(supabase, userId, { type, prompt: post.media_prompt || "", aspect });
  const url = out.urls[0];
  if (!url) throw new Error("Generation returned no media.");
  return { url, cost: out.cost };
}

/**
 * Cron path: generate media for an autopilot post the same way, but spend
 * credits via the service-role deduct_credits() (no user session).
 */
export async function generatePostMediaAdmin(
  admin: SupabaseClient,
  userId: string,
  budgetCredits: number | null,
  spentCredits: number,
  type: GenType,
  mediaPrompt: string,
): Promise<{ url: string; cost: number }> {
  const cost = creditCost(type, false);
  if (budgetCredits != null && spentCredits + cost > budgetCredits) throw new BudgetError();
  const aspect = type === "video" ? "16:9" : "1:1";
  const out = await generateAndStoreAdmin(admin, userId, { type, prompt: mediaPrompt || "", aspect });
  const url = out.urls[0];
  if (!url) throw new Error("Generation returned no media.");
  return { url, cost: out.cost };
}
