/**
 * Settings information architecture — five groups, one index.
 *
 * Settings used to be four opaque tabs ("Voice & Style", "Messages",
 * "Data & Tools", "Channels & Compliance") on one page, with Profile on
 * /account and Billing under More (2026-09 UX audit, P1). Each group is a
 * page now; this file is the single list the index, the sidebar matcher
 * and the legacy-tab redirect all read from.
 */
export type SettingsGroupId = "account" | "ai-team" | "channels" | "messaging" | "data";

export type SettingsGroup = {
  id: SettingsGroupId;
  href: `/dashboard/settings/${SettingsGroupId}`;
  /** `dashboard:settings.groups.<key>.{label,description,keywords}` */
  i18nKey: "account" | "aiTeam" | "channels" | "messaging" | "data";
};

export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  { id: "account", href: "/dashboard/settings/account", i18nKey: "account" },
  { id: "ai-team", href: "/dashboard/settings/ai-team", i18nKey: "aiTeam" },
  { id: "channels", href: "/dashboard/settings/channels", i18nKey: "channels" },
  { id: "messaging", href: "/dashboard/settings/messaging", i18nKey: "messaging" },
  { id: "data", href: "/dashboard/settings/data", i18nKey: "data" },
] as const;

/**
 * Old `?tab=` / `#hash` values → group. Deep links from inside the app
 * (welcome plan, "Connect a Facebook Page", emails) still use these.
 */
export const LEGACY_SETTINGS_TABS: Record<string, SettingsGroupId> = {
  voice: "ai-team",
  messages: "messaging",
  tools: "data",
  channels: "channels",
};

export function legacyTabToGroup(tab: string | null | undefined): SettingsGroupId | null {
  if (!tab) return null;
  return LEGACY_SETTINGS_TABS[tab.trim().toLowerCase()] ?? null;
}
