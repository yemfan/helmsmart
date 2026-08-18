import { getAdForRender } from "@/lib/social/ads";
import { buildAdImageResponse } from "@/lib/social/renderAd";

/**
 * PUBLIC promo-ad image — GET /api/social/ad/[id] → PNG.
 *
 * Renders a STORED ad on the fly. The publish-scheduled cron sets this URL as the
 * scheduled_posts.image_url, and the platform (Meta/LinkedIn) fetches it — so,
 * like /api/social/card/[id], it must be reachable with no auth. Service-role
 * reads the row by id; nothing sensitive is exposed. Unknown id → 404.
 */
export const runtime = "nodejs";

const BRAND_LOGO_PATH = "/brand/closeboss/closeboss-icon-512.png";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ad = await getAdForRender(id);
  if (!ad) return new Response("Not found", { status: 404 });
  // Absolute logo URL from the request origin so satori can embed the mark.
  const origin = new URL(req.url).origin;
  return buildAdImageResponse({ ...ad, logoUrl: `${origin}${BRAND_LOGO_PATH}` });
}
