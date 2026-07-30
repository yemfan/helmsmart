import type { NextRequest } from "next/server";

import { buildScamTreeAd } from "@/lib/social/renderAd";
import { getScamTree, SCAM_TREES } from "@/lib/social/scamTrees";

/**
 * Public, auth-free preview of an AVASC scam decision-tree ad as a PNG.
 *   GET /api/social/ad/preview?tree=smishing&format=square
 *
 * Auth-free on purpose: the same render path is what social platforms fetch by
 * URL when publishing, and this route lets the composer / us preview it.
 */
export const runtime = "nodejs";

export function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("tree") ?? SCAM_TREES[0].key;
  const format = searchParams.get("format") === "portrait" ? "portrait" : "square";
  const tree = getScamTree(key) ?? SCAM_TREES[0];
  return buildScamTreeAd(tree, format);
}
