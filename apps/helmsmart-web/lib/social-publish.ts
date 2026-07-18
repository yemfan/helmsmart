/**
 * One place that turns "publish this post" into the right platform call.
 *
 * Both the manual "Publish now" action and the scheduled-publish cron route
 * through here, so they can never disagree about what a platform supports —
 * which is exactly how X / Facebook / Instagram ended up silently stalling
 * before: the action and the cron each had their own private answer.
 */
import { publishLinkedInPost } from "@/lib/linkedin";
import { publishFacebookPost, publishInstagramPost } from "@/lib/meta";
import { canPublish, unsupportedReason } from "@/lib/social-platforms";

export type PublishOutcome = {
  ok: boolean;
  id?: string;
  url?: string | null;
  error?: string;
  /** Whether a later retry could plausibly succeed. */
  retryable?: boolean;
};

export async function publishToPlatform(params: {
  orgId: string;
  platform: string;
  content: string;
  imageUrl?: string | null;
}): Promise<PublishOutcome> {
  const { orgId, platform, content, imageUrl } = params;

  if (!canPublish(platform)) {
    // A capability we don't have. Permanent by definition — retrying will never
    // make a publisher appear.
    return { ok: false, error: unsupportedReason(platform), retryable: false };
  }

  switch (platform) {
    case "linkedin": {
      const res = await publishLinkedInPost(orgId, content);
      // LinkedIn's helper predates the retryable flag; a failed publish there is
      // usually an expired token, so default to permanent rather than looping.
      return { ...res, retryable: false };
    }
    case "facebook":
      return publishFacebookPost(orgId, content, imageUrl);
    case "instagram":
      return publishInstagramPost(orgId, content, imageUrl);
    default:
      return { ok: false, error: unsupportedReason(platform), retryable: false };
  }
}
