/**
 * POST /api/revalidate — on-demand ISR cache invalidation.
 *
 * Motivation (from TOM validation report, April 2026 cycle):
 * Validator hit stale prerendered HTML at specific edge POPs after deploys,
 * which required a full `vercel cache purge`. That's a sledgehammer — it
 * drops CDN cache for the whole project. This endpoint lets us invalidate
 * specific pages surgically instead.
 *
 * Usage:
 *   curl -X POST https://www.closebossai.com/api/revalidate \
 *     -H 'x-revalidate-secret: <REVALIDATE_SECRET>' \
 *     -H 'content-type: application/json' \
 *     -d '{"paths":["/terms","/pricing","/about"]}'
 *
 * Body accepts either `{"paths": string[]}` or `{"path": string}` for
 * convenience from shell. Response shape: `{ ok, revalidated, ts }`.
 *
 * Secret:
 *   REVALIDATE_SECRET env var, project-scoped. Set in Vercel dashboard,
 *   share with TOM out-of-band (not via tracker Notes in plaintext).
 */

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  parseRevalidateBody,
  RevalidateValidationError,
  secretsMatch,
} from "@/lib/revalidate/validatePaths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const provided = req.headers.get("x-revalidate-secret");
  const expected = process.env.REVALIDATE_SECRET?.trim();

  if (!expected) {
    console.error("[/api/revalidate] REVALIDATE_SECRET is not configured");
    return NextResponse.json(
      { ok: false, error: "Endpoint is not configured." },
      { status: 503 },
    );
  }

  if (!secretsMatch(provided, expected)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body is not valid JSON." },
      { status: 400 },
    );
  }

  let paths: string[];
  try {
    paths = parseRevalidateBody(body);
  } catch (err) {
    if (err instanceof RevalidateValidationError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    throw err;
  }

  const revalidated: string[] = [];
  const failed: { path: string; error: string }[] = [];

  for (const path of paths) {
    try {
      revalidatePath(path);
      revalidated.push(path);
    } catch (err) {
      failed.push({
        path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    revalidated,
    failed,
    ts: Date.now(),
  });
}

/** Block all other methods with a 405 so the shape is predictable. */
export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Use POST with x-revalidate-secret header." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
