import { NextResponse } from "next/server";
import { z } from "zod";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { publishPost } from "@/lib/leads-gen/publish";

export const runtime = "nodejs";
// IG container creation + publish + permalink fetch can take a few
// seconds each end-to-end; budget conservatively.
export const maxDuration = 60;

const bodySchema = z.object({
  platform: z.enum(["facebook", "instagram", "linkedin", "threads"]),
  connectionId: z.string().uuid(),
  // LinkedIn's hard cap is 3000 chars; Meta is far higher. 5000 fits
  // both. LinkedIn truncates with a "…see more" past ~150 chars in
  // the feed preview but accepts the full body.
  caption: z.string().min(1).max(5_000),
  hashtags: z.array(z.string()).max(40).optional(),
  mediaItemId: z.string().uuid().optional(),
  trigger: z.string().max(64).optional(),
  subjectKind: z.string().max(64).optional(),
  subjectRefId: z.string().max(255).optional(),
});

/**
 * POST /api/leads-gen/publish
 *
 * Synchronous publish path. Thin shell over `publishPost` (shared
 * with the cron at /api/cron/publish-scheduled). Translates the
 * helper's discriminated-union result into HTTP responses.
 *
 * Plan gate: Pro or higher (same as Quick Post).
 *
 * Failure mapping:
 *   PublishFailure.status === 404 → 404 NotFound
 *   PublishFailure.status === 422 → 422 Unprocessable
 *   PublishFailure.status === 500 → 500 ServerError
 *   PublishFailure.status === 502 → 502 BadGateway (Meta-side reject)
 */
export async function POST(req: Request) {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    if (auth.planType === "free") {
      return NextResponse.json(
        { ok: false, error: "Direct publishing requires Pro or higher." },
        { status: 402 },
      );
    }

    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await publishPost({
      agentId: auth.agentId,
      platform: parsed.data.platform,
      connectionId: parsed.data.connectionId,
      caption: parsed.data.caption,
      hashtags: parsed.data.hashtags,
      mediaItemId: parsed.data.mediaItemId ?? null,
      trigger: parsed.data.trigger ?? null,
      subjectKind: parsed.data.subjectKind ?? null,
      subjectRefId: parsed.data.subjectRefId ?? null,
    });

    if (result.ok) {
      return NextResponse.json({
        ok: true,
        postId: result.leadPostId,
        externalPostId: result.externalPostId,
        externalPostUrl: result.externalPostUrl,
        platform: result.platform,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        metaCode: result.metaCode ?? null,
        metaTraceId: result.metaTraceId ?? null,
        linkedinCode: result.linkedinCode ?? null,
        linkedinServiceErrorCode: result.linkedinServiceErrorCode ?? null,
        postId: result.leadPostId ?? null,
      },
      { status: result.status },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Publish failed";
    console.error("[leads-gen/publish]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
