import "server-only";

import { publishLinkedInPost } from "./linkedin-post";
import { getMediaById } from "./media";
import {
  publishFacebookPagePost,
  publishInstagramBusinessPost,
} from "./meta-post";
import { publishThreadsPost } from "./threads-post";
import { publishPinterestPin } from "./pinterest-post";
import { decryptToken } from "./token-enc";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Shared publish helper. The sync /api/leads-gen/publish route and
 * the /api/cron/publish-scheduled cron both call this — single
 * implementation of the Meta-side orchestration + lead_posts row
 * management. Returning a discriminated-union result keeps callers
 * declarative (they decide HTTP status / retry behavior based on
 * the result shape, this helper just publishes).
 *
 * Supports three platform values:
 *   - 'facebook'  → Page feed post via Graph API
 *   - 'instagram' → IG Business two-step publish (requires image)
 *   - 'linkedin'  → LinkedIn personal feed via Share API
 *   - 'threads'   → Threads two-step publish (text-only or image)
 *
 * Flow:
 *   1. Load + ownership-check the social_accounts row
 *   2. Optional image: load from media library + signed URL (+ bytes for LinkedIn)
 *   3. Decrypt the access token
 *   4. Insert a lead_posts row in 'pending' status (forensic audit)
 *   5. Call the appropriate publisher (FB feed / IG two-step / LinkedIn /rest/posts)
 *   6. Promote lead_posts to 'published' or 'failed' based on outcome
 *   7. Return { ok, leadPostId, externalPostId, externalPostUrl }
 *      or { ok: false, status, error, retryable } on failure
 *
 * Note on plan-gating: this helper trusts the caller did the plan
 * check. Both the sync route and the cron job verify plan before
 * dispatching here.
 */

export type PublishPlatform = "facebook" | "instagram" | "linkedin" | "threads" | "pinterest";

export type PublishInput = {
  agentId: string;
  platform: PublishPlatform;
  /** social_accounts.id */
  connectionId: string;
  /** Post body. Caller has already done platform-specific formatting. */
  caption: string;
  /** Hashtag tokens (no leading #). For IG / LinkedIn, helper inlines; for FB stays separate. */
  hashtags?: string[];
  /** media_library.id of an attached image. Required for Instagram; optional elsewhere. */
  mediaItemId?: string | null;
  /**
   * Direct public image URL to publish (e.g. a branded social-images card from
   * the Marketing Assistant's recommendations, which do NOT live in
   * media_library). Used ONLY when `mediaItemId` is absent — the media_library
   * path is unchanged. Everything downstream already reads the resolved
   * `imageUrl` variable, so this is a single additive branch.
   */
  imageUrl?: string | null;
  /** Optional URL to attach. Facebook renders a link-preview card on a /feed
   *  post (ignored when an image is attached, and not supported by IG). */
  link?: string | null;
  /** Attribution context — recorded on the lead_posts row. */
  trigger?: string | null;
  subjectKind?: string | null;
  subjectRefId?: string | null;
};

export type PublishSuccess = {
  ok: true;
  leadPostId: string;
  externalPostId: string;
  externalPostUrl: string | null;
  platform: PublishPlatform;
};

export type PublishFailure = {
  ok: false;
  /** Suggested HTTP status for the caller to respond with. */
  status: 404 | 422 | 500 | 502;
  error: string;
  metaCode?: number | null;
  metaUserMessage?: string | null;
  metaTraceId?: string | null;
  linkedinCode?: string | null;
  linkedinServiceErrorCode?: number | null;
  /** When the lead_posts row was created before failure (post-DB-write failures). */
  leadPostId?: string | null;
  /** Hint for the cron: true means the error is transient (platform-side glitch)
   *  and worth retrying; false means it's a permanent error (token revoked,
   *  Page deleted, etc) so the cron should not retry. */
  retryable: boolean;
};

export type PublishResult = PublishSuccess | PublishFailure;

export async function publishPost(input: PublishInput): Promise<PublishResult> {
  const {
    agentId,
    platform,
    connectionId,
    caption: rawCaption,
    hashtags,
    mediaItemId,
    imageUrl: directImageUrl,
    link,
    trigger,
    subjectKind,
    subjectRefId,
  } = input;

  // Caption assembly. For IG + LinkedIn, hashtags are part of the
  // post body (LinkedIn supports clickable hashtags inline; IG
  // expects them in the caption). FB keeps hashtags separate so
  // they're rendered as plain text (no benefit to inlining).
  let caption = rawCaption.trim();
  const inlineHashtags =
    platform === "instagram" ||
    platform === "linkedin" ||
    platform === "threads" ||
    platform === "pinterest";
  if (
    inlineHashtags &&
    hashtags &&
    hashtags.length > 0 &&
    !caption.includes("#")
  ) {
    const tagLine = hashtags
      .map((h) => `#${h.replace(/^#/, "")}`)
      .join(" ");
    caption = `${caption}\n\n${tagLine}`;
  }

  // 1. Connection + ownership. Select enough columns to satisfy
  //    both Meta and LinkedIn branches — the unused ones are null.
  const { data: connRow, error: connErr } = await supabaseAdmin
    .from("social_accounts")
    .select(
      "id, agent_id, platform, fb_page_id, ig_business_user_id, page_access_token_enc, user_access_token_enc, linkedin_member_urn, threads_user_id, pinterest_board_id, status",
    )
    .eq("id", connectionId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (connErr) {
    return {
      ok: false,
      status: 500,
      error: connErr.message,
      retryable: true,
    };
  }
  if (!connRow) {
    return {
      ok: false,
      status: 404,
      error: "Connection not found.",
      retryable: false,
    };
  }

  const conn = connRow as {
    id: string;
    platform: string;
    fb_page_id: string | null;
    ig_business_user_id: string | null;
    page_access_token_enc: string | null;
    user_access_token_enc: string | null;
    linkedin_member_urn: string | null;
    threads_user_id: string | null;
    pinterest_board_id: string | null;
    status: string;
  };

  // Validate platform / connection alignment.
  const requiresMeta = platform === "facebook" || platform === "instagram";
  if (requiresMeta && conn.platform !== "meta") {
    return {
      ok: false,
      status: 422,
      error: "Connection platform is not Meta.",
      retryable: false,
    };
  }
  if (platform === "linkedin" && conn.platform !== "linkedin") {
    return {
      ok: false,
      status: 422,
      error: "Connection platform is not LinkedIn.",
      retryable: false,
    };
  }
  if (platform === "threads" && conn.platform !== "threads") {
    return {
      ok: false,
      status: 422,
      error: "Connection platform is not Threads.",
      retryable: false,
    };
  }
  if (platform === "pinterest" && conn.platform !== "pinterest") {
    return {
      ok: false,
      status: 422,
      error: "Connection platform is not Pinterest.",
      retryable: false,
    };
  }
  if (conn.status !== "connected") {
    return {
      ok: false,
      status: 422,
      error: `Connection status is "${conn.status}". Reconnect in Settings → Connect platforms.`,
      retryable: false,
    };
  }

  // Platform-specific shape checks before we touch any tokens.
  if (requiresMeta && (!conn.fb_page_id || !conn.page_access_token_enc)) {
    return {
      ok: false,
      status: 422,
      error: "Connection is missing the Facebook Page token. Reconnect to refresh.",
      retryable: false,
    };
  }
  if (platform === "instagram" && !conn.ig_business_user_id) {
    return {
      ok: false,
      status: 422,
      error:
        "This Page is not linked to an Instagram Business account. Link one in Facebook, then reconnect.",
      retryable: false,
    };
  }
  if (
    platform === "linkedin" &&
    (!conn.linkedin_member_urn || !conn.user_access_token_enc)
  ) {
    return {
      ok: false,
      status: 422,
      error: "Connection is missing LinkedIn credentials. Reconnect to refresh.",
      retryable: false,
    };
  }
  if (
    platform === "threads" &&
    (!conn.threads_user_id || !conn.user_access_token_enc)
  ) {
    return {
      ok: false,
      status: 422,
      error: "Connection is missing Threads credentials. Reconnect to refresh.",
      retryable: false,
    };
  }
  if (
    platform === "pinterest" &&
    (!conn.pinterest_board_id || !conn.user_access_token_enc)
  ) {
    return {
      ok: false,
      status: 422,
      error: "Connection is missing a Pinterest board or credentials. Reconnect to refresh.",
      retryable: false,
    };
  }

  // 2. Image — required for IG, optional for FB / LinkedIn.
  let mediaLibraryId: string | null = null;
  let imageUrl: string | null = null;
  let imageBytes: Uint8Array | null = null;
  let imageContentType: string | null = null;
  if (mediaItemId) {
    const media = await getMediaById(agentId, mediaItemId);
    if (!media) {
      return {
        ok: false,
        status: 404,
        error: "Image not found in your library.",
        retryable: false,
      };
    }
    if (!media.signedUrl) {
      return {
        ok: false,
        status: 500,
        error: "Could not generate a temporary URL for the image.",
        retryable: true,
      };
    }
    mediaLibraryId = media.id;
    imageUrl = media.signedUrl;
    imageContentType = media.contentType ?? "image/jpeg";

    // LinkedIn's upload endpoint won't pull from arbitrary URLs the
    // way Meta does — we have to PUT the bytes ourselves. Fetch
    // them here once via the signed URL.
    if (platform === "linkedin") {
      try {
        const imgRes = await fetch(media.signedUrl);
        if (!imgRes.ok) {
          throw new Error(`HTTP ${imgRes.status}`);
        }
        const buf = await imgRes.arrayBuffer();
        imageBytes = new Uint8Array(buf);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Image fetch failed";
        return {
          ok: false,
          status: 500,
          error: `Could not fetch image bytes for LinkedIn upload: ${msg}`,
          retryable: true,
        };
      }
    }
  } else if (directImageUrl) {
    // Additive path: a direct public image URL (e.g. a branded social-images
    // recommendation card) with NO media_library row. Skip getMediaById and
    // publish the URL as-is. Meta pulls it by URL; LinkedIn needs the bytes,
    // so fetch them here the same way the media_library path does.
    imageUrl = directImageUrl;
    imageContentType = "image/png";
    if (platform === "linkedin") {
      try {
        const imgRes = await fetch(directImageUrl);
        if (!imgRes.ok) {
          throw new Error(`HTTP ${imgRes.status}`);
        }
        const buf = await imgRes.arrayBuffer();
        imageBytes = new Uint8Array(buf);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Image fetch failed";
        return {
          ok: false,
          status: 500,
          error: `Could not fetch image bytes for LinkedIn upload: ${msg}`,
          retryable: true,
        };
      }
    }
  }
  if ((platform === "instagram" || platform === "pinterest") && !imageUrl) {
    return {
      ok: false,
      status: 422,
      error:
        platform === "pinterest"
          ? "Pinterest Pins require an image. Attach one before publishing."
          : "Instagram posts require an image. Attach one in the wizard, or post to Facebook only.",
      retryable: false,
    };
  }

  // 3. Decrypt access token at the point of use. Each platform
  //    uses a different stored token column.
  let accessToken: string;
  try {
    const encrypted =
      platform === "linkedin" || platform === "threads" || platform === "pinterest"
        ? conn.user_access_token_enc!
        : conn.page_access_token_enc!;
    accessToken = decryptToken(encrypted);
  } catch (e) {
    // Token decryption failure usually means SOCIAL_TOKEN_ENC_KEY was
    // rotated without re-encrypting rows. Mark the connection errored
    // so subsequent attempts surface "Reconnect" instead of confusing
    // 500s on every retry.
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
      // ignore — best-effort housekeeping
    }
    const msg = e instanceof Error ? e.message : "Token decryption failed";
    console.error("[leads-gen/publish] token decrypt failed:", msg);
    const platformLabel =
      platform === "linkedin"
        ? "LinkedIn"
        : platform === "threads"
          ? "Threads"
          : platform === "pinterest"
            ? "Pinterest"
            : "Facebook";
    return {
      ok: false,
      status: 422,
      error: `Connection token is invalid. Reconnect ${platformLabel} to publish.`,
      retryable: false,
    };
  }

  // 4. Insert a pending lead_posts row up-front so even on a
  //    platform-side timeout or a mid-publish crash we have an
  //    audit row.
  const { data: pendingRow, error: pendingErr } = await supabaseAdmin
    .from("lead_posts")
    .insert({
      agent_id: agentId,
      social_account_id: conn.id,
      platform,
      caption,
      hashtags: hashtags ?? [],
      media_library_id: mediaLibraryId,
      media_url_used: imageUrl,
      trigger_kind: trigger ?? null,
      subject_kind: subjectKind ?? null,
      subject_ref_id: subjectRefId ?? null,
      status: "pending",
    } as Record<string, unknown>)
    .select("id")
    .single();
  if (pendingErr) {
    return {
      ok: false,
      status: 500,
      error: pendingErr.message,
      retryable: true,
    };
  }
  const leadPostId = (pendingRow as { id: string }).id;

  // 5. Dispatch to the platform-specific publisher.
  try {
    let externalPostId: string;
    let externalPostUrl: string | null;
    if (platform === "facebook") {
      const result = await publishFacebookPagePost({
        pageId: conn.fb_page_id!,
        pageAccessToken: accessToken,
        caption,
        imageUrl,
        link,
      });
      externalPostId = result.externalPostId;
      externalPostUrl = result.externalPostUrl;
    } else if (platform === "instagram") {
      const result = await publishInstagramBusinessPost({
        igUserId: conn.ig_business_user_id!,
        pageAccessToken: accessToken,
        caption,
        imageUrl: imageUrl!,
      });
      externalPostId = result.externalPostId;
      externalPostUrl = result.externalPostUrl;
    } else if (platform === "threads") {
      const result = await publishThreadsPost({
        userId: conn.threads_user_id!,
        accessToken,
        text: caption,
        imageUrl,
      });
      externalPostId = result.externalPostId;
      externalPostUrl = result.externalPostUrl;
    } else if (platform === "pinterest") {
      // Pin title = first line of the caption (Pinterest caps it at 100);
      // the full caption is the description; `link` is the outbound URL.
      const title = caption.split("\n")[0]?.trim() || "CloseBoss";
      const result = await publishPinterestPin({
        accessToken,
        boardId: conn.pinterest_board_id!,
        title,
        description: caption,
        link: link ?? null,
        imageUrl: imageUrl!,
      });
      externalPostId = result.externalPostId;
      externalPostUrl = result.externalPostUrl;
    } else {
      // linkedin
      const result = await publishLinkedInPost({
        memberUrn: conn.linkedin_member_urn!,
        accessToken,
        caption,
        imageBytes,
        imageContentType,
      });
      externalPostId = result.externalPostId;
      externalPostUrl = result.externalPostUrl;
    }

    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from("lead_posts")
      .update({
        status: "published",
        external_post_id: externalPostId,
        external_post_url: externalPostUrl,
        published_at: nowIso,
        updated_at: nowIso,
      } as Record<string, unknown>)
      .eq("id", leadPostId);

    return {
      ok: true,
      leadPostId,
      externalPostId,
      externalPostUrl,
      platform,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Publish failed";
    const tagged = e as {
      // Meta-tagged error fields
      metaCode?: number | null;
      metaSubcode?: number | null;
      metaUserMessage?: string | null;
      metaTraceId?: string | null;
      // LinkedIn-tagged error fields
      linkedinCode?: string | null;
      linkedinServiceErrorCode?: number | null;
      linkedinMessage?: string | null;
      // Pinterest-tagged error field (HTTP status)
      pinterestStatus?: number | null;
    } | null;

    await supabaseAdmin
      .from("lead_posts")
      .update({
        status: "failed",
        error_message: msg.slice(0, 1000),
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>)
      .eq("id", leadPostId);

    console.error(`[leads-gen/publish] ${platform} publish error:`, msg, {
      metaCode: tagged?.metaCode,
      metaTraceId: tagged?.metaTraceId,
      linkedinCode: tagged?.linkedinCode,
      linkedinServiceErrorCode: tagged?.linkedinServiceErrorCode,
    });

    // Distinguishing retryable from permanent: code-based heuristic
    // per platform.
    //
    // Meta — auth-class codes (100/190/200/506/803) → permanent;
    // others retryable.
    //
    // LinkedIn — uses string codes. Common permanent ones:
    //   - UNAUTHORIZED, REVOKED_ACCESS_TOKEN, EXPIRED_ACCESS_TOKEN
    //   - INVALID_REQUEST (malformed payload — retry won't help)
    //   - FORBIDDEN_PERMISSIONS
    // Service error codes: 65600/65601 (token), 100 (invalid request).
    let retryable = true;
    if (platform === "linkedin") {
      const permanentLinkedInCodes = new Set([
        "UNAUTHORIZED",
        "REVOKED_ACCESS_TOKEN",
        "EXPIRED_ACCESS_TOKEN",
        "INVALID_REQUEST",
        "FORBIDDEN_PERMISSIONS",
      ]);
      const permanentLinkedInServiceCodes = new Set([65600, 65601, 100]);
      if (tagged?.linkedinCode && permanentLinkedInCodes.has(tagged.linkedinCode)) {
        retryable = false;
      }
      if (
        tagged?.linkedinServiceErrorCode &&
        permanentLinkedInServiceCodes.has(tagged.linkedinServiceErrorCode)
      ) {
        retryable = false;
      }
    } else if (platform === "pinterest") {
      // 400 bad request / 401 unauthorized / 403 forbidden = permanent;
      // 429 rate-limit + 5xx are transient and worth retrying.
      const s = tagged?.pinterestStatus ?? null;
      retryable = !(s === 400 || s === 401 || s === 403);
    } else {
      const PERMANENT_META_CODES = new Set([100, 190, 200, 803, 506]);
      retryable = tagged?.metaCode
        ? !PERMANENT_META_CODES.has(tagged.metaCode)
        : true;
    }

    return {
      ok: false,
      status: 502,
      error:
        tagged?.metaUserMessage ||
        tagged?.linkedinMessage ||
        msg,
      metaCode: tagged?.metaCode ?? null,
      metaUserMessage: tagged?.metaUserMessage ?? null,
      metaTraceId: tagged?.metaTraceId ?? null,
      linkedinCode: tagged?.linkedinCode ?? null,
      linkedinServiceErrorCode: tagged?.linkedinServiceErrorCode ?? null,
      leadPostId,
      retryable,
    };
  }
}
