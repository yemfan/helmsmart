import type { AssistantType } from "@/lib/realtyboss/team";

/**
 * AI-assistant avatar sets:
 *  - PERSONA_AVATARS — the six branded CloseBoss mascots (Max, Emma, …), one per
 *    role, served as PNGs from /public/avatars/personas. These are the defaults.
 *  - AVATARS — 14 illustrated portraits served as SVGs from /public/avatars, an
 *    alternate set a user can pick instead.
 * `defaultAvatarForType` gives a stable role-fit default before a user picks.
 * Server-safe (no React) so both the API/seed layer and the client picker can
 * import it.
 */

/** Branded mascot portraits — the role defaults. Order matches the roster. */
export const PERSONA_AVATARS = [
  "max",
  "emma",
  "jake",
  "ruby",
  "grace",
  "oliver",
] as const;

/** Illustrated alternates. */
export const AVATARS: readonly string[] = Array.from(
  { length: 14 },
  (_, i) => `avatar-${String(i + 1).padStart(2, "0")}`,
);

/** Everything a user can pick — mascots first, then the illustrated set. */
export const PICKABLE_AVATARS: readonly string[] = [...PERSONA_AVATARS, ...AVATARS];

function isPersona(id: string): boolean {
  return (PERSONA_AVATARS as readonly string[]).includes(id);
}

export function avatarUrl(id: string): string {
  return isPersona(id) ? `/avatars/personas/${id}.png` : `/avatars/${id}.svg`;
}

export function isValidAvatarId(id: unknown): id is string {
  return typeof id === "string" && PICKABLE_AVATARS.includes(id);
}

/** Stable, deterministic avatar for a seed — fallback before a choice is made. */
export function defaultAvatarForSeed(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATARS[Math.abs(h) % AVATARS.length];
}

/** Role-fit default avatar per assistant type — the branded persona mascots. */
export const DEFAULT_ASSISTANT_AVATARS: Record<AssistantType, string> = {
  boss_assistant: "max", // purple — growth chart
  receptionist: "emma", // pink — headset
  sales_assistant: "jake", // blue — target
  marketing_assistant: "ruby", // orange — megaphone
  transaction_assistant: "grace", // teal — checklist
  accountant: "oliver", // navy — calculator
};

export function defaultAvatarForType(type: AssistantType): string {
  return DEFAULT_ASSISTANT_AVATARS[type] ?? defaultAvatarForSeed(type);
}
