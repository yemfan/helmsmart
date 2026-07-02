import { NextResponse } from "next/server";
import { z } from "zod";

import { generateDraftCaption } from "@/lib/leads-gen/draft";
import { requireMobileAgent } from "@/lib/mobile/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Claude calls can run 10-20s on a slow first-token; budget conservatively.
export const maxDuration = 60;

/**
 * POST /api/mobile/leads-gen/draft
 *
 * Mobile-side Quick Post draft generator. Same Claude call as
 * /api/leads-gen/draft (the web wizard) but with a smaller surface
 * area — mobile picks one platform at a time and works from a free-
 * form brief rather than a subject picker (no CRM subject lookup
 * step on a phone — agents type the brief inline). When the agent
 * wants subject-anchored drafts (the "Just listed at 123 Main St"
 * cases), they can paste the address into the brief.
 *
 * Plan gate: same Pro+ requirement as web.
 *
 * Returns:
 *   { ok: true, caption, hashtags }
 * The mobile UI renders the caption as editable text + a
 * "Copy caption" button so the agent can paste into the platform
 * app (FB / IG / LinkedIn). Direct publish via Meta Graph API
 * lands in a follow-up mobile PR once the OAuth deep-link flow is
 * wired.
 */

const platformSchema = z.enum(["facebook", "instagram", "linkedin", "x"]);
const triggerSchema = z.enum([
  "new_listing",
  "open_house",
  "price_drop",
  "just_sold",
  "market_update",
  "testimonial",
  "custom",
  "by_address",
]);

const bodySchema = z.object({
  trigger: triggerSchema,
  platform: platformSchema,
  /** Free-form brief from the agent. For listing-anchored triggers this
   *  carries the address / price / standout details; for custom /
   *  market_update / testimonial it IS the post. Up to 2000 chars. */
  brief: z.string().min(1).max(2_000),
});

export async function POST(req: Request) {
  const auth = await requireMobileAgent(req);
  if (auth.ok === false) return auth.response;

  // Plan gate: same Pro+ check used by /api/leads-gen/draft.
  try {
    const { data: agentRow } = await supabaseAdmin
      .from("agents")
      .select("plan_type, brand_name")
      .eq("id", auth.ctx.agentId)
      .maybeSingle();
    const planType = (
      (agentRow as { plan_type: string | null } | null)?.plan_type ?? "free"
    ).toLowerCase();
    if (planType === "free") {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          error: "Generate Leads requires Pro or higher.",
        },
        { status: 402 },
      );
    }

    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          error: "Invalid body",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }
    const { trigger, platform, brief } = parsed.data;

    // The web draft generator wants a SubjectDetail. For mobile we
    // synthesize a minimal "custom" subject and lean entirely on the
    // brief — no CRM lookup. The brief carries the address / price
    // when the agent included them, and the model is already told to
    // never invent details that aren't provided.
    const syntheticSubject = {
      kind: "custom" as const,
      id: "mobile_brief",
      label: "Mobile brief",
      sub: null,
      refId: null,
      // The fields below are unused for the 'custom' subject branch
      // but required by the SubjectDetail type union.
      property_address: null,
      city: null,
      state: null,
      list_price: null,
      listing_start_date: null,
      mls_url: null,
    };

    // The Marketing Assistant's own knowledge base grounds the copy.
    let brandKnowledge: string | null = null;
    try {
      const { getAssistantVoiceSettings } = await import("@/lib/realtyboss/voicePersona");
      const voice = await getAssistantVoiceSettings(String(auth.ctx.agentId), "marketing_assistant");
      brandKnowledge = voice.voiceKnowledge;
    } catch {
      // Caption still works without it.
    }

    const out = await generateDraftCaption({
      trigger,
      platform,
      // generateDraftCaption types subject as SubjectDetail (a tagged
      // union). Cast through unknown since the helper only reads the
      // fields relevant to each kind.
      subject: syntheticSubject as unknown as Parameters<typeof generateDraftCaption>[0]["subject"],
      brief,
      agentName:
        (agentRow as { brand_name: string | null } | null)?.brand_name ?? null,
      brandKnowledge,
    });

    return NextResponse.json({
      ok: true,
      success: true,
      caption: out.caption,
      hashtags: out.hashtags,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Draft failed";
    console.error("[mobile/leads-gen/draft]", e);
    return NextResponse.json(
      { ok: false, success: false, error: msg },
      { status: 500 },
    );
  }
}
