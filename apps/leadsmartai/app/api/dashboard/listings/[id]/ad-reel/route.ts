import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getListingById } from "@/lib/listings/service";
import { reelBuildConfigured, buildListingReel, pollListingReel } from "@/lib/listings/adReel";
import type { ListingAdFacts } from "@/lib/listings/types";

// Merging the clips can take a minute or two before the render is queued.
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
        { ok: false, error: "The video-ad builder isn't fully configured (needs FAL_KEY + the Remotion Lambda env)." },
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

/** GET — poll the in-flight render; stores the final MP4 when done. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;
    const listing = await getListingById(String(agentId), id);
    if (!listing) return NextResponse.json({ ok: false, error: "Listing not found" }, { status: 404 });

    if (listing.ad_reel_status === "ready" && listing.ad_reel_url) {
      return NextResponse.json({ ok: true, status: "ready", url: listing.ad_reel_url, progress: 1 });
    }
    if (!listing.ad_reel_render_id || !listing.ad_reel_render_bucket) {
      return NextResponse.json({ ok: true, status: listing.ad_reel_status ?? "idle", progress: 0 });
    }

    const st = await pollListingReel(String(agentId), id, listing.ad_reel_render_id, listing.ad_reel_render_bucket);
    return NextResponse.json({ ok: true, ...st });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("GET /api/dashboard/listings/[id]/ad-reel:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
