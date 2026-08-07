import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getListingById } from "@/lib/listings/service";
import { falConfigured, generateOneListingClip, normalizeSeconds, MAX_CLIPS } from "@/lib/listings/adVideo";
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

    // The full set of the listing's photos — the agent's selection must be a
    // subset of these (never animate an arbitrary URL: each clip is a paid fal
    // render, so an open `photoUrl` would be a cost-abuse vector).
    const listingPhotos = new Set(
      (listing.photo_urls ?? []).filter((u) => /^https?:\/\//i.test(u)),
    );
    if (listingPhotos.size === 0) {
      return NextResponse.json(
        { ok: false, error: "This listing has no photos yet. Pull from a URL or add photos first." },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      index?: unknown;
      photoUrl?: unknown;
      durationSec?: unknown;
    };
    const index = typeof body.index === "number" ? body.index : 0;
    // Guardrail: never let the client drive more renders than the hard cap.
    if (index < 0 || index >= MAX_CLIPS) {
      return NextResponse.json({ ok: false, error: "Clip index out of range." }, { status: 400 });
    }
    const seconds = normalizeSeconds(body.durationSec);

    // Which photo to animate: the agent's chosen one (validated against the
    // listing), falling back to the Nth listing photo for older clients that
    // don't send an explicit selection.
    const orderedPhotos = [...listingPhotos];
    const requested = typeof body.photoUrl === "string" ? body.photoUrl : "";
    const photo = requested && listingPhotos.has(requested) ? requested : orderedPhotos[index];
    if (!photo) {
      return NextResponse.json({ ok: false, error: "Clip index out of range." }, { status: 400 });
    }
    const photos = orderedPhotos;

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
    const { url, clipUrls } = await generateOneListingClip(String(agentId), id, photo, index, facts, index === 0, seconds);
    return NextResponse.json({ ok: true, index, total: photos.length, url, clipUrls });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/listings/[id]/ad-video:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
