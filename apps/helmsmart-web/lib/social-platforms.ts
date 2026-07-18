/**
 * Which social platforms can actually publish — one fact, one place.
 *
 * This exists because that knowledge used to be implicit in three places that
 * disagreed with each other:
 *   - `publishSocialPost` had an `if (platform !== "linkedin") return softError`
 *   - the publish cron filtered `.eq("platform", "linkedin")`
 *   - the composer UI offered all four platforms as equal tabs
 *
 * The result was a silent trap: you could write and schedule an X, Facebook or
 * Instagram post, and it would sit at status='scheduled' FOREVER — never
 * published, never failed, no error anywhere. The UI showed it queued. Nothing
 * ever told anyone otherwise.
 *
 * A capability gap is fine. A capability gap that looks like success is not.
 * Everything that needs to know "can this platform publish?" now asks here, so
 * the UI warns before you write and the cron fails loudly instead of stalling.
 */

export type Platform = "x" | "linkedin" | "facebook" | "instagram";

export const PLATFORMS: Platform[] = ["x", "linkedin", "facebook", "instagram"];

/**
 * Platforms with a real publisher wired up end to end.
 *
 * Add a platform here ONLY when its publish path actually works — this list is
 * what the UI promises the user and what the cron will attempt.
 */
export const PUBLISHABLE_PLATFORMS: readonly Platform[] = ["linkedin"];

/**
 * Deliberately NOT a type predicate (`platform is Platform`). Callers pass a
 * value that is already `Platform`, so a predicate narrows the ELSE branch to
 * `never` and any property access on it fails to compile — the exact opposite
 * of what the check is for. A plain boolean is what every call site needs.
 */
export function canPublish(platform: string): boolean {
  return (PUBLISHABLE_PLATFORMS as readonly string[]).includes(platform);
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

export const PLATFORM_LABEL: Record<Platform, string> = {
  x: "X",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
};

/**
 * Why a platform can't publish, in words meant for the person who wrote the
 * post — it says what to do instead, rather than just refusing.
 */
export function unsupportedReason(platform: string): string {
  const label = PLATFORM_LABEL[platform as Platform] ?? platform;
  return `${label} publishing isn't connected yet, so this post can't go out automatically. Copy the text and post it manually, or connect LinkedIn to schedule there.`;
}
