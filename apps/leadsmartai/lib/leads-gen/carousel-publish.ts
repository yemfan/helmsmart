import "server-only";

import { publishFacebookCarousel, publishInstagramCarousel } from "./meta-post";
import { publishLinkedInCarousel } from "./linkedin-post";

/**
 * Carousel publish dispatcher (reach Phase 3a, PR 3). Given a rendered deck's
 * slide image URLs + a caption + a connected account, publish a multi-image
 * post to the right platform.
 *
 * Carousels are supported on Facebook (multi-photo), Instagram (native
 * carousel), and LinkedIn (multiImage). Pinterest posts single Pins and Threads
 * carousels are deferred, so those platforms are rejected here rather than
 * silently degraded.
 *
 * Meta fetches image URLs itself, so FB/IG get the URLs directly. LinkedIn
 * needs the bytes uploaded, so we download each slide first.
 */

export type CarouselPlatform = "facebook" | "instagram" | "linkedin";

export type CarouselPublishResult = {
  externalPostId: string;
  externalPostUrl: string | null;
};

export async function publishCarousel(params: {
  platform: CarouselPlatform;
  caption: string;
  /** Public slide image URLs (e.g. /api/social/carousel/[id]/[slide]), in order. */
  imageUrls: string[];
  accessToken: string;
  fbPageId?: string | null;
  igUserId?: string | null;
  linkedinMemberUrn?: string | null;
}): Promise<CarouselPublishResult> {
  const { platform, caption, imageUrls, accessToken } = params;
  if (imageUrls.length < 2) {
    throw new Error("A carousel needs at least 2 slides.");
  }

  if (platform === "facebook") {
    if (!params.fbPageId) throw new Error("Missing Facebook page id for carousel.");
    return publishFacebookCarousel({
      pageId: params.fbPageId,
      pageAccessToken: accessToken,
      caption,
      imageUrls,
    });
  }

  if (platform === "instagram") {
    if (!params.igUserId) throw new Error("Missing Instagram business user id for carousel.");
    return publishInstagramCarousel({
      igUserId: params.igUserId,
      pageAccessToken: accessToken,
      caption,
      imageUrls,
    });
  }

  // linkedin — upload the bytes ourselves (signed-URL pull-through hits LinkedIn
  // auth weirdness, same reason the single-image path downloads first).
  if (!params.linkedinMemberUrn) throw new Error("Missing LinkedIn member URN for carousel.");
  const images = await Promise.all(imageUrls.map(downloadImage));
  return publishLinkedInCarousel({
    memberUrn: params.linkedinMemberUrn,
    accessToken,
    caption,
    images,
  });
}

async function downloadImage(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch carousel slide (HTTP ${res.status}): ${url}`);
  }
  const contentType = res.headers.get("content-type") || "image/png";
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, contentType };
}
