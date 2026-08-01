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

export type GenParams = { type: GenType; prompt: string; aspect: string; model?: string; imageUrl?: string };

/**
 * Reserve credits, generate, persist. Throws CreditError (402) when the user is
 * out of credits; refunds the reservation if generation fails.
 */
export async function generateAndStore(
  supabase: SupabaseClient,
  userId: string,
  params: GenParams,
): Promise<{ urls: string[]; model: string; credits: number; cost: number }> {
  const cost = creditCost(params.type, !!params.imageUrl);

  const { data: remaining, error: creditErr } = await supabase.rpc("consume_credits", { p_cost: cost });
  if (creditErr) throw new Error("Could not check credits.");
  if (typeof remaining !== "number" || remaining < 0) throw new CreditError(cost);

  try {
    const result = await generate(params);
    const savedUrls: string[] = [];
    for (const src of result.urls) {
      const media = await fetch(src);
      if (!media.ok) throw new Error(`Could not fetch rendered media (${media.status}).`);
      const bytes = new Uint8Array(await media.arrayBuffer());
      const { ext, contentType } = extFrom(src, params.type);
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage.from("media").upload(path, bytes, { contentType, upsert: false });
      if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);
      const publicUrl = supabase.storage.from("media").getPublicUrl(path).data.publicUrl;

      const { error: dbErr } = await supabase.from("generations").insert({
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
    return { urls: savedUrls, model: result.model, credits: remaining as number, cost };
  } catch (e) {
    // Generation failed after reserving — refund (best-effort).
    await supabase.rpc("consume_credits", { p_cost: -cost });
    throw e;
  }
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
