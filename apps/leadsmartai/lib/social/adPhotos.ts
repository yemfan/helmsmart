import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Brand photo pool for the "photo" ad preset (social_ad_photos). Service-role
 * only. Agents upload lifestyle/brand photos once; the generator rotates them
 * into photo-template ads. Photos live in the public social-images bucket.
 */

export type AdPhoto = { id: string; url: string; label: string | null };

/** Active photos for an agent, newest first. */
export async function listAgentAdPhotos(agentId: string): Promise<AdPhoto[]> {
  const { data } = await supabaseAdmin
    .from("social_ad_photos")
    .select("id, url, label")
    .eq("agent_id", agentId)
    .eq("active", true)
    .order("created_at", { ascending: false });
  return (data as AdPhoto[] | null) ?? [];
}

/** Pick one active photo, rotating by index. null when the agent has none. */
export async function pickAgentAdPhoto(agentId: string, index = 0): Promise<AdPhoto | null> {
  const photos = await listAgentAdPhotos(agentId);
  if (photos.length === 0) return null;
  const i = ((index % photos.length) + photos.length) % photos.length;
  return photos[i];
}

/** Insert a photo (already uploaded to the bucket). Returns the new id or null. */
export async function addAdPhoto(
  agentId: string,
  url: string,
  label?: string | null,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("social_ad_photos")
    .insert({ agent_id: agentId, url, label: label ?? null } as never)
    .select("id")
    .maybeSingle();
  if (error) {
    console.warn("[social] addAdPhoto failed:", error.message);
    return null;
  }
  return (data as { id: string } | null)?.id ?? null;
}

/** Soft-remove (deactivate) an agent's photo. */
export async function removeAdPhoto(agentId: string, photoId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("social_ad_photos")
    .update({ active: false } as never)
    .eq("id", photoId)
    .eq("agent_id", agentId);
  return !error;
}
