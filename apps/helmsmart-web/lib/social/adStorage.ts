import "server-only";

import { renderScamTreePng } from "@/lib/social/renderAd";
import type { ScamTree } from "@/lib/social/scamTrees";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Render a scam decision-tree ad to PNG and upload it to the public
 * `social-media` bucket under an org-scoped path, returning the public URL the
 * social publishers fetch at post time.
 *
 * Service-role (takes the caller's cron client): the autopilot runs without a
 * user session, so the user-gated `uploadSocialImage` action can't be reused.
 * PNG is fine for Facebook / LinkedIn / Threads (the autopilot targets);
 * Instagram would need JPEG, but IG isn't an autopilot target.
 */

type Db = Awaited<ReturnType<typeof createServiceClient>>;

const BUCKET = "social-media";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "ad";
}

export async function renderAndUploadScamAd(
  db: Db,
  orgId: string,
  tree: ScamTree,
  weekOf: string,
): Promise<string> {
  const png = await renderScamTreePng(tree);
  const path = `${orgId}/ads/scam-${slugify(tree.key)}-${weekOf}.png`;
  const { error } = await db.storage.from(BUCKET).upload(path, png, {
    upsert: true,
    contentType: "image/png",
    cacheControl: "3600",
  });
  if (error) throw new Error(error.message);
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
