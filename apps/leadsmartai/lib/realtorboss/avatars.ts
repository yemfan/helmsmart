import type { AssistantType } from "@/lib/realtorboss/team";

/**
 * Shared AI-assistant avatar set — 20 illustrated personas served as static
 * SVGs from /public/avatars (copied from the HelmSmart workforce set). A user
 * assigns one per assistant; `defaultAvatarForType` gives a stable role-fit
 * default before they pick. Server-safe (no React) so both the API/seed layer
 * and the client picker can import it.
 */

export const AVATARS: readonly string[] = Array.from(
  { length: 20 },
  (_, i) => `persona-${String(i + 1).padStart(2, "0")}`,
);

export function avatarUrl(id: string): string {
  return `/avatars/${id}.svg`;
}

export function isValidAvatarId(id: unknown): id is string {
  return typeof id === "string" && (AVATARS as readonly string[]).includes(id);
}

/** Stable, deterministic avatar for a seed — fallback before a choice is made. */
export function defaultAvatarForSeed(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATARS[Math.abs(h) % AVATARS.length];
}

/** Role-fit default avatar per assistant type (mirrors HelmSmart's choices). */
export const DEFAULT_ASSISTANT_AVATARS: Record<AssistantType, string> = {
  boss_assistant: "persona-13",
  receptionist: "persona-02",
  sales_assistant: "persona-05",
  marketing_assistant: "persona-14",
  transaction_assistant: "persona-07",
  accountant: "persona-06",
};

export function defaultAvatarForType(type: AssistantType): string {
  return DEFAULT_ASSISTANT_AVATARS[type] ?? defaultAvatarForSeed(type);
}
