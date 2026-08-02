import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getListingById } from "@/lib/listings/service";
import { falConfigured, generateOneListingClip, MAX_CLIPS } from "@/lib/listings/adVideo";
import type { ListingAdFacts } from "@/lib/listings/types";

// One fal image-to-video render fits comfortably under the ceiling; the client
// calls this once per photo so we never run several renders in a single request
// (that's what timed out).
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/dashboard/listings/[id]/ad-video
 * Animate ONE listing photo (by `index`) into a cinematic clip and append it to
 * the listing. The client loops index 0..N-1 to render the set with progress.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;

    const listing = await getListingById(String(agentId), id);
    if (!listing) return NextResponse.json({ ok: false, error: "Listing not found" }, { status: 404 });

    if (!falConfigured()) {
      return NextResponse.json(
        { ok: false, error: "Cinematic video isn't configured yet (missing FAL_KEY)." },
        { status: 503 },
      );
    }

    const photos = (listing.photo_urls ?? []).filter((u) => /^https?:\/\//i.test(u)).slice(0, MAX_CLIPS);
    const total = photos.length;
    if (total === 0) {
      return NextResponse.json(
        { ok: false, error: "This listing has no photos yet. Pull from a URL or add photos first." },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { index?: unknown };
    const index = typeof body.index === "number" ? body.index : 0;
    if (index < 0 || index >= total) {
      return NextResponse.json({ ok: false, error: "Clip index out of range." }, { status: 400 });
    }

    // motionPrompt only needs a bit of context; build a light facts object.
    const facts: ListingAdFacts = {
      beds: listing.beds,
      baths: listing.baths,
      sqft: listing.sqft,
      yearBuilt: listing.year_built,
      price: listing.list_price,
      address: listing.property_address,
      city: listing.city,
      state: listing.state,
      description: listing.property_description,
      highlights: listing.highlights ?? [],
      photoUrls: photos,
      confidence: 0,
      warnings: [],
    };

    // index 0 starts a fresh set (clears any prior clips); later indexes append.
    const { url, clipUrls } = await generateOneListingClip(String(agentId), id, photos[index], index, facts, index === 0);
    return NextResponse.json({ ok: true, index, total, url, clipUrls });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/listings/[id]/ad-video:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
