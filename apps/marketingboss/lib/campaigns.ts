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

const COLS =
  "id, link, name, brief, media_types, channels, frequency, budget_credits, spent_credits, mode, status, next_run_at, created_at";

export async function listCampaigns(userId: string): Promise<Campaign[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("campaigns")
    .select(COLS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data as Campaign[]) ?? [];
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
