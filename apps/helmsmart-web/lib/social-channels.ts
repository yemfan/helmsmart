/**
 * Single source of truth for the social channels HelmSmart supports — used by
 * both the read-only status list on /social and the connect/disconnect controls
 * in Settings → Marketing.
 */

export type ChannelProvider = "linkedin" | "meta" | "threads" | "tiktok" | "youtube";

export type SocialChannel = {
  key: string;
  label: string;
  /** org_oauth_tokens.provider backing this channel; null = manual-only (X). */
  provider: ChannelProvider | null;
  /** Short note, e.g. Instagram shares the Facebook/Meta grant. */
  note?: string;
};

/** Every channel shown as a status row on /social (Facebook + Instagram split). */
export const SOCIAL_CHANNELS: SocialChannel[] = [
  { key: "x", label: "X (Twitter)", provider: null, note: "manual" },
  { key: "linkedin", label: "LinkedIn", provider: "linkedin" },
  { key: "facebook", label: "Facebook", provider: "meta" },
  { key: "instagram", label: "Instagram", provider: "meta", note: "via Facebook" },
  { key: "threads", label: "Threads", provider: "threads" },
  { key: "tiktok", label: "TikTok", provider: "tiktok" },
  { key: "youtube", label: "YouTube", provider: "youtube" },
];

/** Connectable accounts (one row per OAuth grant — Meta covers FB + Instagram). */
export const CONNECTABLE_CHANNELS: {
  provider: ChannelProvider;
  label: string;
  connectPath: string;
  note?: string;
}[] = [
  { provider: "linkedin", label: "LinkedIn", connectPath: "/api/auth/linkedin" },
  { provider: "meta", label: "Facebook & Instagram", connectPath: "/api/auth/meta", note: "one Meta grant covers both" },
  { provider: "threads", label: "Threads", connectPath: "/api/auth/threads" },
  { provider: "tiktok", label: "TikTok", connectPath: "/api/auth/tiktok" },
  { provider: "youtube", label: "YouTube", connectPath: "/api/auth/youtube" },
];

export function isChannelConnected(ch: SocialChannel, connected: Set<string>): boolean {
  return ch.provider !== null && connected.has(ch.provider);
}
