import { getRecommendationForCard } from "@/lib/social/recommend";
import { loadPresentationAgent } from "@/lib/presentations/loadPresentationAgent";
import { buildCardImageResponse } from "@/lib/social/renderCard";

/**
 * PUBLIC branded post image — GET /api/social/card/[id] → a 1080×1080 PNG.
 *
 * FALLBACK / regenerate path. Cards are now rendered ONCE at generation time
 * and stored on social_post_recommendations.image_url (see lib/social/recommend
 * → generateWeeklyRecommendations). This route renders the SAME card on the fly
 * so anything that missed the stored image (best-effort upload failed, or an
 * older row) still resolves to a finished visual. The card JSX/templates now
 * live in lib/social/renderCard (buildCardImageResponse), shared by both.
 *
 * Posture: no auth. The agent shares this image URL with clients/followers, so
 * it must be fetchable by anyone — mirrors the public market-report / CMA share
 * pages, which service-role read their row by id. Branding degrades gracefully
 * to "CloseBoss AI" when the agent has none.
 *
 * Runtime is nodejs because the read + branding lookups use the service-role
 * Supabase client (edge-incompatible).
 */
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const rec = await getRecommendationForCard(id);
  if (!rec) {
    return new Response("Not found", { status: 404 });
  }

  const agent = await loadPresentationAgent(rec.agent_id).catch(() => null);

  return buildCardImageResponse(rec, agent, rec.libraryCategory);
}
