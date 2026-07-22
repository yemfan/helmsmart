import { NextResponse } from "next/server";
import { z } from "zod";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  platform: z.enum(["facebook", "instagram", "linkedin", "threads"]),
  connectionId: z.string().uuid(),
  caption: z.string().min(1).max(5_000),
  hashtags: z.array(z.string()).max(40).optional(),
  mediaItemId: z.string().uuid().optional(),
  /** ISO timestamp. Must be at least 1 minute in the future. */
  scheduledFor: z.string().datetime(),
  trigger: z.string().max(64).optional(),
  subjectKind: z.string().max(64).optional(),
  subjectRefId: z.string().max(255).optional(),
});

/**
 * POST /api/leads-gen/schedule
 *
 * Queues a Quick Post for future publication via the cron at
 * /api/cron/publish-scheduled. Validation here is *just enough*
 * to make the schedule meaningful — full publish-time validation
 * (token decrypt, connection healthy, image still in library,
 * etc.) runs at fire time in `publishPost`. That's intentional:
 * a token might rotate or an image might be deleted between
 * scheduling and firing, and we want the validation closest to
 * the actual publish to keep errors fresh + actionable.
 *
 * Minimum lead time: 1 minute. Anything sooner = use /publish
 * directly.
 */
export async function POST(req: Request) {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    if (auth.planType === "free") {
      return NextResponse.json(
        { ok: false, error: "Scheduling requires Pro or higher." },
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

    const scheduledMs = Date.parse(parsed.data.scheduledFor);
    if (scheduledMs - Date.now() < 60 * 1000) {
      return NextResponse.json(
        {
          ok: false,
          error: "Schedule at least 1 minute in the future. For immediate publish, use the Publish button.",
        },
        { status: 422 },
      );
    }

    // Ownership check for the connection — we don't want agents
    // scheduling posts against connections they don't own.
    const { data: connRow, error: connErr } = await supabaseAdmin
      .from("social_accounts")
      .select(
        "id, platform, fb_page_id, ig_business_user_id, linkedin_member_urn, status",
      )
      .eq("id", parsed.data.connectionId)
      .eq("agent_id", auth.agentId)
      .maybeSingle();
    if (connErr) throw connErr;
    if (!connRow) {
      return NextResponse.json(
        { ok: false, error: "Connection not found." },
        { status: 404 },
      );
    }
    const conn = connRow as {
      platform: string;
      fb_page_id: string | null;
      ig_business_user_id: string | null;
      linkedin_member_urn: string | null;
      status: string;
    };

    // Platform alignment — the wizard's platform must match the
    // connection's platform. (FB / IG both live on a 'meta' row;
    // LinkedIn rows are 'linkedin'.)
    const wantsMeta =
      parsed.data.platform === "facebook" ||
      parsed.data.platform === "instagram";
    if (wantsMeta && conn.platform !== "meta") {
      return NextResponse.json(
        { ok: false, error: "Connection is not a Meta connection." },
        { status: 422 },
      );
    }
    if (parsed.data.platform === "linkedin" && conn.platform !== "linkedin") {
      return NextResponse.json(
        { ok: false, error: "Connection is not a LinkedIn connection." },
        { status: 422 },
      );
    }
    if (
      parsed.data.platform === "instagram" &&
      !conn.ig_business_user_id
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This Page has no linked Instagram Business account. Link one in Facebook first.",
        },
        { status: 422 },
      );
    }
    if (parsed.data.platform === "instagram" && !parsed.data.mediaItemId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Instagram posts require an image. Attach one in the wizard first.",
        },
        { status: 422 },
      );
    }
    if (parsed.data.platform === "linkedin" && !conn.linkedin_member_urn) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "LinkedIn connection is missing member info. Reconnect to refresh.",
        },
        { status: 422 },
      );
    }

    const { data: row, error: insertErr } = await supabaseAdmin
      .from("scheduled_posts")
      .insert({
        agent_id: auth.agentId,
        social_account_id: parsed.data.connectionId,
        platform: parsed.data.platform,
        caption: parsed.data.caption,
        hashtags: parsed.data.hashtags ?? [],
        media_library_id: parsed.data.mediaItemId ?? null,
        trigger_kind: parsed.data.trigger ?? null,
        subject_kind: parsed.data.subjectKind ?? null,
        subject_ref_id: parsed.data.subjectRefId ?? null,
        scheduled_for: parsed.data.scheduledFor,
        status: "scheduled",
        created_by: auth.userId,
      } as Record<string, unknown>)
      .select("id, scheduled_for, status")
      .single();
    if (insertErr) throw insertErr;

    const out = row as { id: string; scheduled_for: string; status: string };
    return NextResponse.json({
      ok: true,
      scheduledPostId: out.id,
      scheduledFor: out.scheduled_for,
      status: out.status,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Schedule failed";
    console.error("[leads-gen/schedule]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
