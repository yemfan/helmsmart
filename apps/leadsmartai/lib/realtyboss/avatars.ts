import type { AssistantType } from "@/lib/realtyboss/team";

/**
 * Shared AI-assistant avatar set — 10 illustrated CloseBoss portraits served
 * as static SVGs from /public/avatars. A user assigns one per assistant;
 * `defaultAvatarForType` gives a stable role-fit default before they pick.
 * Server-safe (no React) so both the API/seed layer and the client picker can
 * import it.
 */

export const AVATARS: readonly string[] = Array.from(
  { length: 14 },
  (_, i) => `avatar-${String(i + 1).padStart(2, "0")}`,
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

/** Role-fit default avatar per assistant type (one of the 10 custom portraits). */
export const DEFAULT_ASSISTANT_AVATARS: Record<AssistantType, string> = {
  boss_assistant: "avatar-13", // Max — purple
  receptionist: "avatar-09", // Emma — pink
  sales_assistant: "avatar-14", // Jake — blue
  marketing_assistant: "avatar-03", // Ruby — orange (recolored)
  transaction_assistant: "avatar-05", // Grace — green
  accountant: "avatar-04", // Oliver — blue
};

export function defaultAvatarForType(type: AssistantType): string {
  return DEFAULT_ASSISTANT_AVATARS[type] ?? defaultAvatarForSeed(type);
}
