// Social platforms and — crucially — which of them can actually publish.
//
// The capability LIST is per-app config (apps wire up publishers at different
// rates), but the RULE is core: a platform we can't publish to must be visible
// as such everywhere, or it becomes a silent trap.
//
// That trap was real. In HelmSmart the composer offered four platforms as equal
// tabs while only LinkedIn had a publisher; scheduling to the others left a row
// queued FOREVER — never published, never failed, no error recorded. Three
// places each held their own private answer to "can this publish?" and none of
// them told the user.

export type SocialPlatform =
  | "x"
  | "linkedin"
  | "facebook"
  | "instagram"
  | "threads";

export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  "x",
  "linkedin",
  "facebook",
  "instagram",
  "threads",
];

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  x: "X",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
};

/**
 * Can we actually publish here?
 *
 * Deliberately NOT a type predicate (`p is SocialPlatform`): callers usually
 * pass a value that is already typed, and a predicate narrows the ELSE branch
 * to `never`, so any property access on it fails to compile — the opposite of
 * what the check is for.
 */
export function canPublish(
  platform: string,
  publishable: readonly SocialPlatform[],
): boolean {
  return (publishable as readonly string[]).includes(platform);
}

/**
 * Why a platform can't publish, in words meant for the person who wrote the
 * post — it says what to do instead, rather than just refusing.
 */
export function unsupportedPlatformReason(
  platform: string,
  publishable: readonly SocialPlatform[],
): string {
  const label = PLATFORM_LABEL[platform as SocialPlatform] ?? platform;
  const alt = publishable.map((p) => PLATFORM_LABEL[p]).join(" or ");
  const suggestion = alt
    ? `Copy the text and post it manually, or connect ${alt} to schedule there.`
    : `Copy the text and post it manually.`;
  return `${label} publishing isn't connected yet, so this post can't go out automatically. ${suggestion}`;
}

/**
 * What should happen to a due post on this platform.
 *
 * The contract every publish worker owes its queue: EVERY due post reaches a
 * terminal outcome. There is no "leave it scheduled" — that is precisely the
 * silent stall. Publishable platforms are attempted; the rest fail loudly with
 * a reason the author can act on.
 */
export function outcomeForDuePost(
  platform: string,
  publishable: readonly SocialPlatform[],
): { action: "attempt" } | { action: "fail"; reason: string } {
  return canPublish(platform, publishable)
    ? { action: "attempt" }
    : { action: "fail", reason: unsupportedPlatformReason(platform, publishable) };
}
