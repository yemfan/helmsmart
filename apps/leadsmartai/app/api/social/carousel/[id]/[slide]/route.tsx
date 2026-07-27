import { getCarouselForRender } from "@/lib/social/carousels";
import { buildCarouselSlideImageResponse } from "@/lib/social/renderCarousel";

/**
 * PUBLIC carousel slide image — GET /api/social/carousel/[id]/[slide] → 1080×1080 PNG.
 *
 * One slide of a stored carousel, rendered on the fly. The publisher (PR 3)
 * attaches these URLs to a multi-image post, and the platform fetches each —
 * so, like /api/social/card/[id], this must be fetchable with no auth. The row
 * is read by the service-role client by id; nothing sensitive is exposed.
 *
 * `slide` is a 0-based index into the deck. Out-of-range → 404 (not a blank
 * image) so a bad reference is obvious.
 */
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; slide: string }> },
) {
  const { id, slide } = await ctx.params;

  const carousel = await getCarouselForRender(id);
  if (!carousel) return new Response("Not found", { status: 404 });

  const total = carousel.slides.length;
  const index = Number.parseInt(slide, 10);
  if (!Number.isInteger(index) || index < 0 || index >= total) {
    return new Response("Slide out of range", { status: 404 });
  }

  const s = carousel.slides[index];
  return buildCarouselSlideImageResponse({
    heading: s.heading,
    body: s.body,
    index,
    total,
  });
}
