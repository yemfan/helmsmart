/**
 * HelmSmart's social platform config + the one DB helper that needs to know
 * about it. The RULES live in @helm/dna-marketing; this file supplies the two
 * things that are genuinely ours: which platforms we've wired up, and how our
 * `social_posts` table is written.
 *
 * The rule being enforced is that a platform we can't publish to must be
 * visible as such everywhere. It used to be implicit in three places that
 * disagreed, and a scheduled X / Facebook / Instagram post sat at
 * status='scheduled' FOREVER — never published, never failed, no error, still
 * showing as queued.
 */
import {
  canPublish as canPublishOn,
  outcomeForDuePost as outcomeFor,
  unsupportedPlatformReason,
  type SocialPlatform,
} from "@helm/dna-marketing";

export type Platform = SocialPlatform;

export { PLATFORM_LABEL, SOCIAL_PLATFORMS as PLATFORMS } from "@helm/dna-marketing";

/**
 * Platforms with a real publisher wired up end to end — HelmSmart's answer,
 * not a universal one. Add a platform here ONLY when its publish path actually
 * works: this list is what the UI promises and what the cron will attempt.
 */
export const PUBLISHABLE_PLATFORMS: readonly SocialPlatform[] = ["linkedin"];

export function canPublish(platform: string): boolean {
  return canPublishOn(platform, PUBLISHABLE_PLATFORMS);
}

export function unsupportedReason(platform: string): string {
  return unsupportedPlatformReason(platform, PUBLISHABLE_PLATFORMS);
}

/** What a due post on this platform should become. Never "stay scheduled". */
export function outcomeForDuePost(platform: string) {
  return outcomeFor(platform, PUBLISHABLE_PLATFORMS);
}

/**
 * Write a social_posts patch that may contain `last_error`, tolerating a
 * database where migration 00078 hasn't been applied yet.
 *
 * HelmSmart migrations are applied by hand but Vercel deploys on merge, so
 * there is always a window where the new code is live and the new column is
 * not. Without this, every publish attempt in that window fails on an unknown
 * column and the post stays 'scheduled' — reintroducing the exact silent stall
 * this change exists to remove. The fallback drops only the reason, never the
 * status transition, and stops firing the moment the migration lands.
 *
 * App-specific by nature: it knows our table name and our column.
 */
export async function patchSocialPost(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  postId: string,
  patch: Record<string, unknown> & { last_error?: string | null },
): Promise<void> {
  const { error } = await db.from("social_posts").update(patch).eq("id", postId);
  if (!error) return;
  // PGRST204 = column not found in schema cache.
  const missingColumn =
    error.code === "PGRST204" || /last_error/i.test(error.message ?? "");
  if (!missingColumn) throw error;
  const { last_error: _dropped, ...rest } = patch;
  void _dropped;
  await db.from("social_posts").update(rest).eq("id", postId);
}
