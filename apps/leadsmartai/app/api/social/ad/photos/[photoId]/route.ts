import { NextResponse } from "next/server";

import { requireCrmFeature } from "@/lib/billing/guard";
import { SOCIAL_CUSTOMIZATION_FEATURE } from "@/lib/social/customization";
import { removeAdPhoto } from "@/lib/social/adPhotos";

/** DELETE /api/social/ad/photos/[photoId] — deactivate an agent's ad photo. */
export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: { params: Promise<{ photoId: string }> }) {
  const gate = await requireCrmFeature(SOCIAL_CUSTOMIZATION_FEATURE);
  if (!gate.ok) return gate.response;
  const { photoId } = await ctx.params;
  const ok = await removeAdPhoto(String(gate.ctx.agentId), photoId);
  if (!ok) return NextResponse.json({ ok: false, error: "Could not remove photo." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
