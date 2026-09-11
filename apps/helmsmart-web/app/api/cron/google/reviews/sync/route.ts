/**
 * GET /api/cron/google/reviews/sync
 *
 * Periodic cron job to sync Google Business reviews for all organizations.
 * Runs every 15 minutes (configured in vercel.json).
 *
 * For each org with a connected Google Business Profile:
 * - Syncs the latest reviews via Google Business Profile API
 * - Detects new reviews and notifies Emily (Marketing)
 * - Updates review counts and ratings
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { syncGoogleBusinessReviews } from "@/lib/google-business";
import { createNotificationService } from "@/lib/notifications-service";

const CRON_SECRET = process.env.CRON_SECRET;

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Verify cron secret
  const auth = request.headers.get("Authorization");
  if (!auth || !CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();
  const synced: { orgId: string; synced: number }[] = [];
  const errors: { orgId: string; error: string }[] = [];
  let newReviewsDetected = 0;

  try {
    // Get all orgs with connected Google Business profiles
    const { data: profiles, error: profileErr } = await supabase
      .from("google_business_profiles")
      .select("id, organization_id, business_location_id, review_count")
      .not("business_location_id", "is", null);

    if (profileErr) {
      console.error("[google-reviews-sync] profile fetch error:", profileErr);
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ synced: 0, newReviews: 0, message: "No profiles to sync" });
    }

    // Sync each profile
    for (const profile of profiles) {
      try {
        // Count existing reviews
        const { count: prevCount } = await supabase
          .from("google_reviews")
          .select("id", { count: "exact" })
          .eq("organization_id", profile.organization_id);

        // Sync reviews from Google
        const result = await syncGoogleBusinessReviews(
          profile.organization_id,
          profile.business_location_id
        );

        if (result.error) {
          errors.push({
            orgId: profile.organization_id,
            error: result.error,
          });
          continue;
        }

        synced.push({
          orgId: profile.organization_id,
          synced: result.synced,
        });

        // Count new reviews
        const { count: newCount } = await supabase
          .from("google_reviews")
          .select("id", { count: "exact" })
          .eq("organization_id", profile.organization_id);

        const newReviews = (newCount ?? 0) - (prevCount ?? 0);
        if (newReviews > 0) {
          newReviewsDetected += newReviews;

          // Notify Emily (Marketing) about new reviews
          await createNotificationService(
            profile.organization_id,
            {
              type: "system",
              title: `${newReviews} new review${newReviews > 1 ? "s" : ""} on Google Business`,
              body: `Check your Google Business dashboard to respond and boost your reputation.`,
              titleKey: "notifications.events.newGoogleReviews",
              bodyKey: "notifications.events.newGoogleReviewsBody",
              params: { count: newReviews },
              link: "/google/reviews",
            },
            supabase
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[google-reviews-sync] sync error for org ${profile.organization_id}:`, err);
        errors.push({
          orgId: profile.organization_id,
          error: msg,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      profilesChecked: profiles.length,
      synced,
      errors,
      newReviewsDetected,
    });
  } catch (err) {
    console.error("[google-reviews-sync] cron error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
