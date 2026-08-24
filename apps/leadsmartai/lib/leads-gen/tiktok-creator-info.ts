import "server-only";

/**
 * TikTok `creator_info` — the query the Content Posting API requires before a
 * Direct Post, and the reason CloseBoss failed its first audit.
 *
 * TikTok's rules for Direct Post are about consent, not plumbing:
 *
 *  - The creator picks the privacy level, from the options TikTok reports for
 *    THEIR account. A client may not decide, and may not default to public.
 *  - Account-level interaction settings win. If the creator has comments off,
 *    a post that sends `disable_comment: false` is overriding them — which is a
 *    documented rejection reason, and is what this app was doing with three
 *    hardcoded `false` values.
 *  - Commercial content has to be declared, and branded content may not be
 *    posted privately.
 *
 * So this module is the source of truth for what a given creator is *allowed*
 * to choose, and `enforceAgainstCreatorInfo` is the last gate before publish.
 */

const CREATOR_INFO_QUERY = "https://open.tiktokapis.com/v2/post/publish/creator_info/query/";

export type TikTokPrivacyLevel =
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "FOLLOWER_OF_CREATOR"
  | "SELF_ONLY";

export const PRIVACY_LEVELS: readonly TikTokPrivacyLevel[] = [
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "FOLLOWER_OF_CREATOR",
  "SELF_ONLY",
];

export function isPrivacyLevel(v: unknown): v is TikTokPrivacyLevel {
  return typeof v === "string" && (PRIVACY_LEVELS as readonly string[]).includes(v);
}

export type TikTokCreatorInfo = {
  nickname: string | null;
  username: string | null;
  avatarUrl: string | null;
  /** The ONLY privacy levels this creator may be given. */
  privacyLevelOptions: TikTokPrivacyLevel[];
  /** Account-level switches. True means the creator has turned it off. */
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number | null;
};

type RawCreatorInfo = {
  data?: {
    creator_nickname?: unknown;
    creator_username?: unknown;
    creator_avatar_url?: unknown;
    privacy_level_options?: unknown;
    comment_disabled?: unknown;
    duet_disabled?: unknown;
    stitch_disabled?: unknown;
    max_video_post_duration_sec?: unknown;
  };
  error?: { code?: string; message?: string };
};

/**
 * Ask TikTok what this creator may post. Throws with something actionable —
 * a creator who has revoked the app, or an account TikTok will not accept posts
 * for, both surface here rather than as a confusing failure at publish time.
 */
export async function queryTikTokCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
  const res = await fetch(CREATOR_INFO_QUERY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    // TikTok requires a POST with no body for this endpoint.
    body: JSON.stringify({}),
  });
  const json = (await res.json().catch(() => ({}))) as RawCreatorInfo;

  if (!res.ok || (json.error?.code && json.error.code !== "ok")) {
    const code = json.error?.code ?? String(res.status);
    if (code === "spam_risk_too_many_posts") {
      throw new Error("TikTok is rate-limiting this account today. Try again tomorrow.");
    }
    if (code === "account_privacy_setting_error") {
      throw new Error(
        "This TikTok account cannot accept posts right now. Open TikTok → Settings and privacy " +
          "and check the account is not restricted, then reconnect.",
      );
    }
    throw new Error(json.error?.message || `TikTok creator_info failed (${code})`);
  }

  const d = json.data ?? {};
  const options = Array.isArray(d.privacy_level_options)
    ? (d.privacy_level_options as unknown[]).filter(isPrivacyLevel)
    : [];

  return {
    nickname: typeof d.creator_nickname === "string" ? d.creator_nickname : null,
    username: typeof d.creator_username === "string" ? d.creator_username : null,
    avatarUrl: typeof d.creator_avatar_url === "string" ? d.creator_avatar_url : null,
    privacyLevelOptions: options,
    commentDisabled: d.comment_disabled === true,
    duetDisabled: d.duet_disabled === true,
    stitchDisabled: d.stitch_disabled === true,
    maxVideoPostDurationSec:
      typeof d.max_video_post_duration_sec === "number" ? d.max_video_post_duration_sec : null,
  };
}

/** What the creator chose, as stored on their connection. */
export type TikTokPostPrefs = {
  privacyLevel: TikTokPrivacyLevel | null;
  disableComment: boolean;
  disableDuet: boolean;
  disableStitch: boolean;
  brandOrganic: boolean;
  brandContent: boolean;
  confirmedAt: string | null;
};

/**
 * Branded content may not be posted privately — TikTok's Branded Content Policy.
 * Checked when saving AND before publishing, because the account's available
 * privacy options can change after the creator chose.
 */
export function brandedContentConflict(prefs: {
  privacyLevel: TikTokPrivacyLevel | null;
  brandContent: boolean;
}): string | null {
  if (prefs.brandContent && prefs.privacyLevel === "SELF_ONLY") {
    return "Branded content cannot be posted privately. Choose a different audience, or turn off the paid-partnership disclosure.";
  }
  return null;
}

/**
 * The last gate before publish: reconcile what the creator chose with what
 * TikTok says their account allows RIGHT NOW.
 *
 * Returns the post_info values to send, or a reason not to post. Never widens
 * the audience and never re-enables an interaction the creator has switched off
 * at account level — a stored preference from last month does not outrank the
 * account's current settings.
 */
export function enforceAgainstCreatorInfo(
  prefs: TikTokPostPrefs,
  info: TikTokCreatorInfo,
):
  | {
      ok: true;
      postInfo: {
        privacy_level: TikTokPrivacyLevel;
        disable_comment: boolean;
        disable_duet: boolean;
        disable_stitch: boolean;
        brand_organic_toggle: boolean;
        brand_content_toggle: boolean;
      };
    }
  | { ok: false; reason: string } {
  if (!prefs.privacyLevel || !prefs.confirmedAt) {
    return {
      ok: false,
      reason:
        "Nobody has chosen how this TikTok account should post. Open Settings → Channels & Compliance → " +
        "TikTok posting and pick an audience. TikTok requires the account holder to make that choice.",
    };
  }
  if (!info.privacyLevelOptions.includes(prefs.privacyLevel)) {
    return {
      ok: false,
      reason:
        `TikTok no longer allows "${prefs.privacyLevel}" for this account. ` +
        "Open Settings → Channels & Compliance → TikTok posting and choose again.",
    };
  }
  const conflict = brandedContentConflict(prefs);
  if (conflict) return { ok: false, reason: conflict };

  return {
    ok: true,
    postInfo: {
      privacy_level: prefs.privacyLevel,
      // OR with the account-level state: the creator's account setting can only
      // ever make an interaction MORE restricted, never less.
      disable_comment: prefs.disableComment || info.commentDisabled,
      disable_duet: prefs.disableDuet || info.duetDisabled,
      disable_stitch: prefs.disableStitch || info.stitchDisabled,
      brand_organic_toggle: prefs.brandOrganic,
      brand_content_toggle: prefs.brandContent,
    },
  };
}
