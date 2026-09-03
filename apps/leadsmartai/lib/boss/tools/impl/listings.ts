import "server-only";

import { z } from "zod";
import { extractListingFromUrl, saveListingAdFacts } from "@/lib/listings/adIntake";
import { buildListingReel, reelBuildConfigured } from "@/lib/listings/adReel";
import { generateListingClips } from "@/lib/listings/adVideo";
import { createListing, getListingById, listListingsForAgent } from "@/lib/listings/service";
import type { ListingAdFacts } from "@/lib/listings/types";
import { defineTool } from "../types";

/**
 * Listing marketing tools — the "I just took a new listing" path.
 *
 * These wrap the same rails the listing detail page drives: pull photos + facts
 * from the listing URL, animate the photos into cinematic clips, and merge them
 * into a finished video ad with an AI caption. Nothing here publishes — the ad
 * lands on the listing for the agent to review, and posting stays with the
 * social tools so the outbound rails keep owning that decision.
 */

/** Loose address match — agents say "Pierre Rd", the row says the full address. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
}

async function findListingByAddress(agentId: string, address: string) {
  const wanted = normalize(address);
  const rows = await listListingsForAgent(agentId);
  const hit =
    rows.find((r) => normalize(r.property_address) === wanted) ??
    rows.find((r) => normalize(r.property_address).includes(wanted)) ??
    rows.find((r) => wanted.includes(normalize(r.property_address)));
  return hit ?? null;
}

function factsOf(l: NonNullable<Awaited<ReturnType<typeof getListingById>>>): ListingAdFacts {
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

export const importListingFromUrl = defineTool({
  name: "import_listing_from_url",
  description:
    "Pull a property's photos and facts (beds, baths, sq ft, year, description, highlights) from a public listing URL — an MLS, brokerage, or portal page — and save them onto the agent's listing. Use when the agent shares a listing link, or before making a video ad for a listing that has no photos yet. Attaches to an existing listing matched by address; pass contact_id to create the listing when it doesn't exist yet.",
  inputSchema: z.object({
    url: z.string().url().describe("Public listing page URL to pull photos and facts from."),
    address: z
      .string()
      .min(4)
      .optional()
      .describe("Property address, when the agent named one — used to match the existing listing."),
    contact_id: z
      .string()
      .uuid()
      .optional()
      .describe("Seller contact id — only needed to CREATE the listing when no match exists."),
  }),
  riskClass: "crm_write",
  assignee: "marketing_assistant",
  execute: async (ctx, input) => {
    let facts: ListingAdFacts;
    try {
      facts = await extractListingFromUrl(input.url);
    } catch (e) {
      return {
        status: "failed",
        error: `Couldn't read that listing page — ${e instanceof Error ? e.message : "the site blocked the request"}. Try the brokerage's own listing page, or upload the photos on the listing.`,
      };
    }

    const address = input.address ?? facts.address ?? null;
    if (!address) {
      return { status: "failed", error: "That page didn't give an address — tell me the property address and I'll retry." };
    }

    const existing = await findListingByAddress(ctx.agentId, address);
    let listingId = existing?.id ?? null;

    if (!listingId) {
      if (!input.contact_id) {
        return {
          status: "failed",
          error: `No listing found for ${address}. Create the listing first, or tell me which seller contact it belongs to and I'll create it.`,
        };
      }
      const created = await createListing({
        agentId: ctx.agentId,
        contactId: input.contact_id,
        propertyAddress: address,
        city: facts.city ?? null,
        state: facts.state ?? null,
        listPrice: facts.price ?? null,
        mlsUrl: input.url,
      });
      listingId = created.id;
    }
    await saveListingAdFacts(ctx.agentId, listingId, facts, "mls_url");

    const photoCount = (facts.photoUrls ?? []).length;
    return {
      status: "completed",
      summary:
        photoCount > 0
          ? `Pulled ${photoCount} photo${photoCount === 1 ? "" : "s"} and the property facts for ${address}.`
          : `Saved the facts for ${address}, but that page exposed no photos — upload them on the listing to make a video ad.`,
      display:
        photoCount > 0
          ? { key: "listings.pulledPhotos", params: { count: photoCount, address } }
          : { key: "listings.noPhotos", params: { address } },
      artifactUrl: `/dashboard/listings/${listingId}`,
      data: { listing_id: listingId, address, photos: photoCount, confidence: facts.confidence },
    };
  },
});

export const createListingVideoAd = defineTool({
  name: "create_listing_video_ad",
  description:
    "Build a cinematic video ad for one of the agent's listings: animates the listing photos into motion clips, merges them into a vertical property tour, and writes the caption. Use when the agent asks for a video, a reel, a tour, or an ad for a specific property. Takes a few minutes when the clips don't exist yet. Produces the video on the listing for review — it does NOT post it anywhere.",
  inputSchema: z.object({
    address: z.string().min(4).describe("Address of the listing to make the video ad for."),
  }),
  riskClass: "draft",
  assignee: "marketing_assistant",
  execute: async (ctx, input) => {
    if (!reelBuildConfigured()) {
      return { status: "failed", error: "The video-ad builder isn't configured on the server yet (missing FAL_KEY)." };
    }

    const match = await findListingByAddress(ctx.agentId, input.address);
    if (!match) {
      return {
        status: "failed",
        error: `I don't see a listing for ${input.address}. Send me the listing link and I'll pull it in first.`,
      };
    }

    const listing = await getListingById(ctx.agentId, match.id);
    if (!listing) return { status: "failed", error: "That listing disappeared while I was working on it." };

    const photos = listing.photo_urls ?? [];
    if (photos.length === 0) {
      return {
        status: "failed",
        error: `${listing.property_address} has no photos yet. Send me the listing link and I'll pull them in, or upload them on the listing.`,
      };
    }

    const facts = factsOf(listing);
    let clips = listing.ad_clip_urls ?? [];
    if (clips.length === 0) {
      try {
        const made = await generateListingClips(ctx.agentId, match.id, photos, facts);
        clips = made.urls ?? [];
      } catch (e) {
        return { status: "failed", error: `Couldn't animate the photos — ${e instanceof Error ? e.message : "the render failed"}.` };
      }
      if (clips.length === 0) {
        return { status: "failed", error: "None of the photos would animate — try different photos on the listing." };
      }
    }

    try {
      await buildListingReel(ctx.agentId, match.id, clips, facts);
    } catch (e) {
      return { status: "failed", error: `Couldn't merge the tour — ${e instanceof Error ? e.message : "the merge failed"}.` };
    }

    return {
      status: "completed",
      summary: `Video ad ready for ${listing.property_address} — ${clips.length} clip${clips.length === 1 ? "" : "s"} merged into a tour with a caption. Review it on the listing, then publish when you're happy.`,
      display: { key: "listings.videoAdReady", params: { count: clips.length, address: listing.property_address } },
      artifactUrl: `/dashboard/listings/${match.id}`,
      data: { listing_id: match.id, clips: clips.length },
    };
  },
});
