/**
 * Labels for the two values the social screens read straight out of the
 * database: which network a post went to, and what triggered it.
 *
 * Both used to be resolved with a bare `t(\`platforms.${p}\`)`. i18next
 * returns the key unchanged on a miss, so a Threads post rendered the literal
 * string `platforms.threads` on screen, and `marketing_assistant_social`
 * printed itself as the trigger. The mobile types claimed the platform was
 * only ever facebook | instagram | linkedin, so nothing — not the compiler,
 * not the missing-key test, which exempts runtime keys — could see it.
 *
 * Two rules here:
 *   1. The known domain is translated. `platforms.*` and
 *      `post_history.triggers.*` carry every value the publisher can write.
 *   2. An unknown value never reaches the screen as a slug. A platform falls
 *      back to its display casing ("Google", not "platforms.google"); a
 *      trigger falls back to nothing, because it is decoration and a snake_case
 *      slug tells the agent less than an empty space does.
 */

/** Every network the app can publish to. Matches `platforms.*` in the bundle. */
export type MobileSocialPlatform =
  | "facebook"
  | "instagram"
  | "linkedin"
  | "threads"
  | "pinterest"
  | "tiktok"
  | "youtube";

type T = (key: string, options?: Record<string, unknown>) => string;

/** Display casing for a platform we have no translation for. */
function prettyPlatform(platform: string): string {
  const known: Record<string, string> = {
    tiktok: "TikTok",
    youtube: "YouTube",
    linkedin: "LinkedIn",
    x: "X",
    gbp: "Google Business Profile",
  };
  if (known[platform]) return known[platform];
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

/** "threads" → 线程 / Threads. Never the raw key. */
export function platformLabel(platform: string, t: T): string {
  return t(`platforms.${platform}`, { defaultValue: prettyPlatform(platform) });
}

/**
 * "marketing_assistant_social" → 营销助理 / Marketing assistant.
 *
 * Returns null for a kind we have no label for, so the caller omits the
 * trigger rather than printing a slug.
 */
export function triggerLabel(kind: string | null | undefined, t: T): string | null {
  const k = (kind ?? "").trim();
  if (!k) return null;
  const label = t(`post_history.triggers.${k}`, { defaultValue: "" });
  return label || null;
}
