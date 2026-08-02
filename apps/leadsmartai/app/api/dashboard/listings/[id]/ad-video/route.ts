import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getListingById } from "@/lib/listings/service";
import { falConfigured, generateListingClips } from "@/lib/listings/adVideo";
import type { ListingAdFacts } from "@/lib/listings/types";

// fal image-to-video renders can take a couple minutes each; we run several.
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/dashboard/listings/[id]/ad-video
 * Animate the listing's photos into cinematic clips (fal image-to-video) and
 * persist the clip URLs onto the listing.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
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
    if ((listing.photo_urls ?? []).length === 0) {
      return NextResponse.json(
        { ok: false, error: "This listing has no photos yet. Pull from MLS or add photos first." },
        { status: 400 },
      );
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
      photoUrls: listing.photo_urls ?? [],
      confidence: 0,
      warnings: [],
    };

    const result = await generateListingClips(String(agentId), id, listing.photo_urls ?? [], facts);
    const updated = await getListingById(String(agentId), id);
    return NextResponse.json({ ok: true, ...result, listing: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/listings/[id]/ad-video:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
