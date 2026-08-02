import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getListingById } from "@/lib/listings/service";
import { reelBuildConfigured, buildListingReel } from "@/lib/listings/adReel";
import type { ListingAdFacts } from "@/lib/listings/types";

// Merging the clips into the finished tour can take a minute or two.
export const runtime = "nodejs";
export const maxDuration = 300;

function factsOf(listing: Awaited<ReturnType<typeof getListingById>>): ListingAdFacts {
  const l = listing!;
  return {
    beds: l.beds,
    baths: l.baths,
    sqft: l.sqft,
    yearBuilt: l.year_built,
    price: l.list_price,
    address: l.property_address,
    city: l.city,
    state: l.state,
    description: l.property_description,
    highlights: l.highlights ?? [],
    photoUrls: l.photo_urls ?? [],
    confidence: 0,
    warnings: [],
  };
}

/** POST — build the finished branded reel from the listing's cinematic clips. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;
    const listing = await getListingById(String(agentId), id);
    if (!listing) return NextResponse.json({ ok: false, error: "Listing not found" }, { status: 404 });

    if (!reelBuildConfigured()) {
      return NextResponse.json(
        { ok: false, error: "The video-ad builder isn't configured yet (missing FAL_KEY)." },
        { status: 503 },
      );
    }
    if ((listing.ad_clip_urls ?? []).length === 0) {
      return NextResponse.json({ ok: false, error: "Generate the cinematic clips first." }, { status: 400 });
    }

    const out = await buildListingReel(String(agentId), id, listing.ad_clip_urls ?? [], factsOf(listing));
    const updated = await getListingById(String(agentId), id);
    return NextResponse.json({ ok: true, ...out, listing: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/listings/[id]/ad-reel:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** GET — the current reel status + URL for this listing (no external poll). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;
    const listing = await getListingById(String(agentId), id);
    if (!listing) return NextResponse.json({ ok: false, error: "Listing not found" }, { status: 404 });
    return NextResponse.json({
      ok: true,
      status: listing.ad_reel_status ?? "idle",
      url: listing.ad_reel_url,
      caption: listing.ad_reel_caption,
      error: listing.ad_reel_error,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("GET /api/dashboard/listings/[id]/ad-reel:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
