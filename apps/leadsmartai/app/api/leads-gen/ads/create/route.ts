import { NextResponse } from "next/server";
import { z } from "zod";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { getMediaById, LEAD_MEDIA_BUCKET } from "@/lib/leads-gen/media";
import {
  createLeadAdCampaign,
  type LeadFormQuestionType,
} from "@/lib/leads-gen/meta-ads";
import { decryptToken } from "@/lib/leads-gen/token-enc";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Six sequential Meta API calls + image download from storage. Each
// call is sub-second on a good day, but giving room for re-tries
// and a slow Meta region.
export const maxDuration = 300;

const QUESTION_TYPES: readonly LeadFormQuestionType[] = [
  "FULL_NAME",
  "FIRST_NAME",
  "LAST_NAME",
  "EMAIL",
  "PHONE",
  "STREET_ADDRESS",
  "CITY",
  "STATE",
  "ZIP_CODE",
] as const;

const bodySchema = z.object({
  /** social_accounts.id — which connection (Page) the campaign runs from. */
  connectionId: z.string().uuid(),
  /** 'act_<digits>' — Meta ad account id. From `/api/leads-gen/ads/accounts`. */
  adAccountId: z.string().min(4),
  /** Agent-facing campaign label. Also used as the prefix for ad set / form / creative names. */
  name: z.string().min(1).max(120),
  /** Ad creative body (the post message). */
  body: z.string().min(1).max(5_000),
  /** Optional headline overlay (~40 char max for desktop). */
  headline: z.string().max(120).optional(),
  /** media_library.id — image used in the ad creative. Required (Meta won't accept text-only Lead Ads). */
  mediaItemId: z.string().uuid(),
  /** Lead form questions to ask. Order is preserved in Meta's UI. */
  formQuestions: z
    .array(z.enum(["FULL_NAME", "FIRST_NAME", "LAST_NAME", "EMAIL", "PHONE", "STREET_ADDRESS", "CITY", "STATE", "ZIP_CODE"]))
    .min(1)
    .max(10),
  /** Landing URL — Meta requires one even when the form is on-ad. */
  landingUrl: z.string().url(),
  /** Targeting params. Real-estate is HOUSING-restricted so only broad geo + age. */
  targeting: z.object({
    countries: z.array(z.string().length(2)).optional(),
    zipCodes: z.array(z.string()).max(50).optional(),
    radiusMiles: z.number().int().min(1).max(50).optional(),
    ageMin: z.number().int().min(18).max(65).optional(),
    ageMax: z.number().int().min(18).max(65).optional(),
  }),
  /** Daily budget in dollars (UI takes dollars; we convert to cents for Meta). Min $5/day. */
  dailyBudgetDollars: z.number().min(5).max(1_000),
  /** ISO start time. Defaults to now. */
  startTime: z.string().datetime().optional(),
  /** ISO end time. Strongly recommended so campaigns don't run forever. */
  endTime: z.string().datetime().optional(),
  /** Set to true to launch immediately. Default is PAUSED so the agent can review. */
  launchImmediately: z.boolean().optional(),
  /** Attribution context — which wizard trigger + subject drove this campaign. */
  trigger: z.string().max(64).optional(),
  subjectKind: z.string().max(64).optional(),
  subjectRefId: z.string().max(255).optional(),
  /** Optional per-campaign privacy policy URL override. When unset,
   *  falls back to agents.lead_ad_privacy_policy_url, then to the
   *  LeadSmart default. Meta requires HTTPS for the form privacy URL. */
  privacyPolicyUrl: z
    .string()
    .url()
    .refine((u) => /^https:/i.test(u), {
      message: "Privacy policy URL must use HTTPS.",
    })
    .optional(),
});

const DEFAULT_PRIVACY_POLICY_URL = "https://www.realtybossai.com/privacy";

/**
 * POST /api/leads-gen/ads/create
 *
 * Launches a Meta Lead Ad campaign on behalf of the agent. The full
 * stack — campaign + ad set + image upload + lead form + creative +
 * ad — is created in one orchestrated call against the Marketing API.
 *
 * Behavior:
 *   - Plan gate: Premium only (per pricing decision; Lead Ads is the
 *     premium-only piece of Generate Leads)
 *   - Persists a `lead_ad_campaigns` row in `status='creating'` BEFORE
 *     calling Meta, so a mid-orchestration failure leaves a forensic
 *     trail even if Vercel kills the function mid-flight
 *   - Default launchStatus is PAUSED — agent reviews in Ads Manager
 *     before going live. `launchImmediately: true` flips this to
 *     ACTIVE
 *   - Privacy Policy URL is hardcoded to /privacy (Meta requires one)
 *
 * Failure modes:
 *   - 402  free / pro plan
 *   - 403  connection or media not owned by this agent
 *   - 404  connection or media not found
 *   - 422  connection unhealthy / missing tokens
 *   - 502  Meta rejected one of the 6 calls (real Meta error code +
 *          user-friendly message surfaced via tagError pipeline)
 */
export async function POST(req: Request) {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    const planType = auth.planType.toLowerCase();
    if (planType !== "premium" && planType !== "enterprise") {
      return NextResponse.json(
        { ok: false, error: "Run Ads is a Premium feature." },
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
    const input = parsed.data;

    // 1. Load + validate the connection.
    const { data: connRow, error: connErr } = await supabaseAdmin
      .from("social_accounts")
      .select(
        "id, agent_id, platform, fb_page_id, ig_business_user_id, page_access_token_enc, user_access_token_enc, status",
      )
      .eq("id", input.connectionId)
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
      id: string;
      agent_id: string;
      platform: string;
      fb_page_id: string | null;
      ig_business_user_id: string | null;
      page_access_token_enc: string | null;
      user_access_token_enc: string | null;
      status: string;
    };
    if (conn.platform !== "meta") {
      return NextResponse.json(
        { ok: false, error: "Connection isn't a Meta connection." },
        { status: 422 },
      );
    }
    if (conn.status !== "connected") {
      return NextResponse.json(
        {
          ok: false,
          error: `Connection status is "${conn.status}". Reconnect first.`,
        },
        { status: 422 },
      );
    }
    if (!conn.fb_page_id || !conn.page_access_token_enc || !conn.user_access_token_enc) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Connection is missing tokens. Reconnect the Page to refresh.",
        },
        { status: 422 },
      );
    }

    // 1b. Resolve the privacy policy URL with the precedence:
    //   1. Per-campaign override on the request body
    //   2. Per-broker default stored on the agent row
    //   3. LeadSmart's bundled fallback
    let privacyPolicyUrl = DEFAULT_PRIVACY_POLICY_URL;
    if (input.privacyPolicyUrl) {
      privacyPolicyUrl = input.privacyPolicyUrl;
    } else {
      try {
        const { data: agentRow } = await supabaseAdmin
          .from("agents")
          .select("lead_ad_privacy_policy_url")
          .eq("id", auth.agentId)
          .maybeSingle();
        const stored = (agentRow as { lead_ad_privacy_policy_url: string | null } | null)
          ?.lead_ad_privacy_policy_url;
        if (stored && /^https:/i.test(stored)) {
          privacyPolicyUrl = stored;
        }
      } catch (e) {
        // Non-fatal: stick with the default.
        console.warn(
          "[leads-gen/ads/create] privacy URL lookup failed, using default:",
          e instanceof Error ? e.message : e,
        );
      }
    }

    // 2. Load the media item + download bytes.
    const media = await getMediaById(auth.agentId, input.mediaItemId);
    if (!media) {
      return NextResponse.json(
        { ok: false, error: "Image not found in your library." },
        { status: 404 },
      );
    }
    let imageBytes: Uint8Array;
    try {
      // Pull bytes via the storage admin client — we can't rely on
      // the signed URL alone because Meta's ad-image upload accepts
      // either a public URL OR a multipart binary, and we prefer
      // binary so a signed-URL TTL doesn't matter mid-orchestration.
      const { data, error } = await supabaseAdmin.storage
        .from(LEAD_MEDIA_BUCKET)
        .download(media.storagePath);
      if (error || !data) {
        throw new Error(error?.message ?? "Image download failed");
      }
      imageBytes = new Uint8Array(await data.arrayBuffer());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Image download failed";
      console.error("[leads-gen/ads/create] image download:", msg);
      return NextResponse.json(
        { ok: false, error: `Could not read your image from storage: ${msg}` },
        { status: 500 },
      );
    }

    // 3. Decrypt tokens at point of use.
    let pageAccessToken: string;
    let userAccessToken: string;
    try {
      pageAccessToken = decryptToken(conn.page_access_token_enc);
      userAccessToken = decryptToken(conn.user_access_token_enc);
    } catch (e) {
      console.error("[leads-gen/ads/create] token decrypt:", e);
      try {
        await supabaseAdmin
          .from("social_accounts")
          .update({
            status: "error",
            last_error: "Token decryption failed",
            updated_at: new Date().toISOString(),
          } as Record<string, unknown>)
          .eq("id", conn.id);
      } catch {
        // ignore
      }
      return NextResponse.json(
        { ok: false, error: "Connection tokens invalid. Reconnect Facebook." },
        { status: 422 },
      );
    }

    // 4. Insert a pending lead_ad_campaigns row up-front. Mid-
    //    orchestration failure leaves this row in status='failed'
    //    with whichever Meta ids we got back before crashing.
    const dailyBudgetCents = Math.round(input.dailyBudgetDollars * 100);
    const { data: pendingRow, error: pendingErr } = await supabaseAdmin
      .from("lead_ad_campaigns")
      .insert({
        agent_id: auth.agentId,
        social_account_id: conn.id,
        meta_ad_account_id: input.adAccountId,
        name: input.name,
        objective: "LEAD_GENERATION",
        trigger_kind: input.trigger ?? null,
        subject_kind: input.subjectKind ?? null,
        subject_ref_id: input.subjectRefId ?? null,
        daily_budget_cents: dailyBudgetCents,
        start_time: input.startTime ?? null,
        end_time: input.endTime ?? null,
        targeting: input.targeting,
        creative: {
          body: input.body,
          headline: input.headline ?? null,
          media_item_id: input.mediaItemId,
          landing_url: input.landingUrl,
          form_questions: input.formQuestions,
        },
        status: "creating",
      } as Record<string, unknown>)
      .select("id")
      .single();
    if (pendingErr) throw pendingErr;
    const campaignRowId = (pendingRow as { id: string }).id;

    // 5. Orchestrate the 6 Meta calls.
    try {
      const result = await createLeadAdCampaign({
        adAccountId: input.adAccountId,
        userAccessToken,
        pageId: conn.fb_page_id,
        pageAccessToken,
        instagramActorId: conn.ig_business_user_id ?? undefined,
        campaignName: input.name,
        body: input.body,
        headline: input.headline,
        imageBytes,
        imageFileName: media.fileName ?? `${campaignRowId}.jpg`,
        imageContentType: media.contentType ?? "image/jpeg",
        formQuestions: input.formQuestions,
        privacyPolicyUrl,
        landingUrl: input.landingUrl,
        targeting: input.targeting,
        dailyBudgetCents,
        startTime: input.startTime,
        endTime: input.endTime,
        launchStatus: input.launchImmediately ? "ACTIVE" : "PAUSED",
      });

      // 6. Promote the row to the final state.
      const nowIso = new Date().toISOString();
      const finalStatus = input.launchImmediately ? "active" : "paused";
      await supabaseAdmin
        .from("lead_ad_campaigns")
        .update({
          meta_campaign_id: result.campaignId,
          meta_adset_id: result.adSetId,
          meta_creative_id: result.creativeId,
          meta_ad_id: result.adId,
          meta_form_id: result.formId,
          status: finalStatus,
          launched_at: nowIso,
          updated_at: nowIso,
        } as Record<string, unknown>)
        .eq("id", campaignRowId);

      return NextResponse.json({
        ok: true,
        campaignId: campaignRowId,
        meta: {
          campaignId: result.campaignId,
          adSetId: result.adSetId,
          creativeId: result.creativeId,
          adId: result.adId,
          formId: result.formId,
        },
        status: finalStatus,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Campaign creation failed";
      const tagged = e as {
        metaCode?: number | null;
        metaUserMessage?: string | null;
        metaTraceId?: string | null;
      } | null;
      console.error("[leads-gen/ads/create] meta create error:", msg, {
        metaCode: tagged?.metaCode,
        metaTraceId: tagged?.metaTraceId,
      });

      await supabaseAdmin
        .from("lead_ad_campaigns")
        .update({
          status: "failed",
          last_error: msg.slice(0, 1000),
          updated_at: new Date().toISOString(),
        } as Record<string, unknown>)
        .eq("id", campaignRowId);

      return NextResponse.json(
        {
          ok: false,
          error: tagged?.metaUserMessage || msg,
          metaCode: tagged?.metaCode ?? null,
          metaTraceId: tagged?.metaTraceId ?? null,
          campaignId: campaignRowId,
        },
        { status: 502 },
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Campaign creation failed";
    console.error("[leads-gen/ads/create]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
