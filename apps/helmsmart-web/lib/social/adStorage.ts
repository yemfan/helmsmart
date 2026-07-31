import "server-only";

import { renderScamTreePng } from "@/lib/social/renderAd";
import type { ScamTree } from "@/lib/social/scamTrees";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Render a scam decision-tree ad and upload it to the public `social-media`
 * bucket under an org-scoped path, returning the public URL publishers fetch at
 * post time.
 *
 * We render PNG (next/og) then transcode to JPEG: Instagram's Content Publishing
 * API only accepts JPEG, and JPEG is fine for Facebook / LinkedIn / Threads too,
 * so one asset serves every platform. 4:4:4 chroma keeps the white/gold text on
 * navy crisp (JPEG's default 4:2:0 muddies fine coloured edges).
 *
 * Service-role (takes the caller's cron client): the autopilot runs without a
 * user session, so the user-gated `uploadSocialImage` action can't be reused.
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
  // Lazy-load sharp: it's a heavy native module and importing it at module top
  // pulls its libvips binary into the graph of every route that transitively
  // imports this file (e.g. /api/social/autopilot), 500-ing them if the binary
  // can't dlopen on Vercel. Loading it only here keeps that failure scoped to the
  // ad-render path (which already falls back to text if it throws).
  const sharp = (await import("sharp")).default;
  const jpeg = await sharp(Buffer.from(png)).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
  const path = `${orgId}/ads/scam-${slugify(tree.key)}-${weekOf}.jpg`;
  const { error } = await db.storage.from(BUCKET).upload(path, jpeg, {
    upsert: true,
    contentType: "image/jpeg",
    cacheControl: "3600",
  });
  if (error) throw new Error(error.message);
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
