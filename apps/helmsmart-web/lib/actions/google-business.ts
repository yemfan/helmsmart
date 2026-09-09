"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { replyToGoogleReview } from "@/lib/google-business";
import { revalidatePath } from "next/cache";
import { getServerT } from "@/lib/i18n/server";

/**
 * Reply to a Google review
 */
export async function replyToReview(
  reviewId: string,
  replyText: string
): Promise<{ ok: boolean; error?: string }> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  const t = await getServerT("marketing");
  if (!orgId) return { ok: false, error: t("errors.notAuthenticated") };

  const supabase = await createClient();

  // Get the review to find business location
  const { data: review } = await supabase
    .from("google_reviews")
    .select("business_profile_id")
    .eq("organization_id", orgId)
    .eq("id", reviewId)
    .single();

  if (!review) return { ok: false, error: t("errors.google.reviewNotFound") };

  // Get business profile location ID
  const { data: profile } = await supabase
    .from("google_business_profiles")
    .select("business_location_id")
    .eq("id", review.business_profile_id)
    .single();

  if (!profile) return { ok: false, error: t("errors.google.profileNotFound") };

  // Call Google API to post reply
  const result = await replyToGoogleReview(
    orgId,
    profile.business_location_id,
    reviewId,
    replyText
  );

  if (result.ok) {
    revalidatePath("/google/reviews");
    revalidatePath("/google");
  }

  return result;
}

/**
 * Sync Google Business reviews for an organization
 */
export async function syncGoogleReviews(): Promise<{ ok: boolean; synced: number; error?: string }> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  const t = await getServerT("marketing");
  if (!orgId) return { ok: false, synced: 0, error: t("errors.notAuthenticated") };

  const supabase = await createClient();

  // Get the business profile
  const { data: profile } = await supabase
    .from("google_business_profiles")
    .select("business_location_id")
    .eq("organization_id", orgId)
    .single();

  if (!profile) return { ok: false, synced: 0, error: t("errors.google.noProfileConnected") };

  // Sync reviews
  const { syncGoogleBusinessReviews } = await import("@/lib/google-business");
  const result = await syncGoogleBusinessReviews(orgId, profile.business_location_id);

  if (!result.error) {
    revalidatePath("/google/reviews");
    revalidatePath("/google");
    return { ok: true, synced: result.synced };
  }

  return { ok: false, synced: 0, error: result.error };
}

/**
 * Toggle auto-request reviews setting for an organization
 */
export async function toggleAutoRequestReviews(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  const t = await getServerT("marketing");
  if (!orgId) return { ok: false, error: t("errors.notAuthenticated") };

  const supabase = await createClient();

  const { error } = await supabase
    .from("organizations")
    .update({ auto_request_reviews: enabled })
    .eq("id", orgId);

  if (error) {
    console.error("[toggle-auto-request] error:", error);
    return { ok: false, error: error.message };
  }

  revalidatePath("/google");
  return { ok: true };
}
