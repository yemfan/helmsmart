import { NextResponse } from "next/server";
import { z } from "zod";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { generateDraftCaption } from "@/lib/leads-gen/draft";
import {
  isSupportedTrigger,
  loadSubjectDetail,
  type Trigger,
} from "@/lib/leads-gen/subjects";
import { buildComposeInstruction } from "@/lib/leads-gen/share";
import { getAssistantVoiceSettings } from "@/lib/closeboss/voicePersona";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Claude calls on a complex listing brief can run 10-20s in the worst
// case. Stay well under platform timeout but generous enough that the
// first-token-latency on a cold model doesn't trip us up.
export const maxDuration = 60;

const platformSchema = z.enum(["facebook", "instagram", "linkedin", "threads", "x"]);

const bodySchema = z.object({
  trigger: z.string().min(1),
  subjectId: z.string().min(1),
  platform: platformSchema,
  brief: z.string().max(2_000).nullable().optional(),
});

/**
 * POST /api/leads-gen/draft
 *
 * One-shot endpoint: takes a trigger + subject + target platform,
 * runs the Claude caption generator, and returns BOTH the draft
 * AND the platform compose-URL ready to open. The wizard renders
 * the draft for inline editing first; clicking Share opens the
 * compose URL in a new tab with the (possibly edited) caption.
 *
 * Note: the compose URL is computed against the AI's first-draft
 * caption. The client recomputes a fresh share URL whenever the
 * agent edits the caption — see `share.ts` for the helper they
 * call. The URL in this response is just a convenience for the
 * "share immediately without editing" path.
 */
export async function POST(req: Request) {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    if (auth.planType === "free") {
      return NextResponse.json(
        { ok: false, error: "Generate Leads requires Pro or higher." },
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
    const { trigger, subjectId, platform, brief } = parsed.data;

    if (!isSupportedTrigger(trigger)) {
      return NextResponse.json(
        { ok: false, error: "Unsupported trigger." },
        { status: 400 },
      );
    }

    const subject = await loadSubjectDetail(subjectId, auth.agentId);
    if (!subject) {
      return NextResponse.json(
        { ok: false, error: "Subject not found or not owned by this agent." },
        { status: 404 },
      );
    }

    // Brief-required triggers — these have no CRM record to anchor
    // the post on, so an empty brief would leave Claude nothing to
    // work with. Catch before paying for a round-trip.
    const briefRequired: string[] = [
      "custom",
      "market_update",
      "testimonial",
      "by_address",
    ];
    if (briefRequired.includes(trigger) && !brief?.trim()) {
      const friendly: Record<string, string> = {
        custom: "Custom posts need a brief — describe what the post should be about.",
        market_update:
          "Market-update posts need a brief — share the angle, data points, or trend you want to highlight.",
        testimonial:
          "Testimonial posts need a brief — paste the client's verbatim quote (and optionally their first name).",
        by_address:
          "Paste an address or URL first — we'll pre-fill the brief from the lookup.",
      };
      return NextResponse.json(
        {
          ok: false,
          error: friendly[trigger] ?? "This trigger needs a brief.",
        },
        { status: 400 },
      );
    }

    // Best-effort agent display name from user_profiles. Folded
    // into the caption so the AI can sign off naturally instead
    // of generic "your local agent" phrasing.
    let agentName: string | null = null;
    try {
      const { data: prof } = await supabaseAdmin
        .from("user_profiles")
        .select("full_name")
        .eq("user_id", auth.userId)
        .maybeSingle();
      const fn = (prof as { full_name?: string } | null)?.full_name?.trim();
      if (fn) agentName = fn;
    } catch {
      // Non-fatal — caption still works without it.
    }

    // The Marketing Assistant's own knowledge base grounds the copy
    // (service areas, specialties, brand facts). Best-effort.
    let brandKnowledge: string | null = null;
    try {
      const voice = await getAssistantVoiceSettings(auth.agentId, "marketing_assistant");
      brandKnowledge = voice.voiceKnowledge;
    } catch {
      // Caption still works without it.
    }

    const draft = await generateDraftCaption({
      trigger: trigger as Trigger,
      platform,
      subject,
      brief: brief ?? null,
      agentName,
      brandKnowledge,
    });

    // Build the convenience compose URL against the first-draft
    // caption. Use the MLS URL when available; otherwise null and
    // the share helper falls back to a configurable default site.
    const shareUrl =
      subject.kind === "listing" || subject.kind === "open_house"
        ? subject.mls_url ?? null
        : null;
    const compose = buildComposeInstruction({
      platform,
      caption: draft.caption,
      hashtags: draft.hashtags,
      shareUrl,
    });

    // Phase 1B made SubjectDetail a discriminated union — transaction
    // variants have `purchase_price` instead of `list_price`, and the
    // synthetic kinds (market_update / testimonial / custom) have
    // neither. Pick whichever monetary field exists per variant so
    // the client always gets a single `list_price` shape.
    const subjectMonetary =
      subject.kind === "listing" || subject.kind === "open_house"
        ? subject.list_price
        : subject.kind === "transaction"
          ? subject.purchase_price
          : null;
    return NextResponse.json({
      ok: true,
      caption: draft.caption,
      hashtags: draft.hashtags,
      compose,
      subject: {
        kind: subject.kind,
        refId: subject.refId,
        property_address: subject.property_address,
        list_price: subjectMonetary,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Draft generation failed";
    console.error("[leads-gen/draft]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
