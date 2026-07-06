import type { Href } from "expo-router";
import type Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import type { HomeFeatureTileConfig } from "./homeFeatures";

/**
 * Single source of truth for the AI-team hub screens (`app/assistant/[type].tsx`).
 *
 * The mobile app is organized around the same AI TEAM as the web app: a
 * Team roster (`(tabs)/team.tsx`) lists each assistant, and tapping one
 * opens that assistant's hub — a tile grid of the mobile features that
 * assistant owns.
 *
 * Mirrors the shape of `lib/homeFeatures.ts` so the hub screens reuse the
 * exact same tile component (`HomeFeatureTile` via `HomeFeatureGrid`).
 *
 * IMPORTANT: tiles list ONLY features that already have a mobile screen.
 * Web-only capabilities are intentionally omitted — no placeholders, no
 * web links. Adding a tile is a one-line edit here.
 */

type IoniconName = ComponentProps<typeof Ionicons>["name"];

/** The five assistant identities the roster + hubs are keyed by. */
export type AssistantType =
  | "receptionist"
  | "sales"
  | "marketing"
  | "transaction"
  | "accountant";

/** Ordered list — drives both the roster and route validation. */
export const ASSISTANT_ORDER: readonly AssistantType[] = [
  "receptionist",
  "sales",
  "marketing",
  "transaction",
  "accountant",
];

/**
 * Maps a hub `AssistantType` to the Boss-team `type` string returned by
 * `fetchBossTeam()` (`MobileBossAssistant.type`). Used to surface each
 * assistant's active/paused status on the roster.
 */
export const ASSISTANT_BOSS_TYPE: Record<AssistantType, string> = {
  receptionist: "receptionist",
  sales: "sales_assistant",
  marketing: "marketing_assistant",
  transaction: "transaction_assistant",
  accountant: "accountant",
};

export type AssistantHubConfig = {
  type: AssistantType;
  /** i18n key under `home.team.assistants.<type>.name`. */
  nameKey: string;
  /** i18n key under `home.team.assistants.<type>.description`. */
  descriptionKey: string;
  /** Ionicon name for the roster row + hub header accent. */
  iconName: IoniconName;
  /** Vibrant accent hue for the roster avatar bubble. */
  accentColor: string;
  /** Feature tiles — ONLY features with an existing mobile screen. */
  tiles: HomeFeatureTileConfig[];
};

export const TEAM_SECTIONS: Record<AssistantType, AssistantHubConfig> = {
  receptionist: {
    type: "receptionist",
    nameKey: "team.assistants.receptionist.name",
    descriptionKey: "team.assistants.receptionist.description",
    iconName: "call-outline",
    accentColor: "#2563eb",
    tiles: [
      {
        key: "call_log",
        labelKey: "team.tiles.call_log",
        iconName: "call-outline",
        href: "/(tabs)/inbox",
      },
    ],
  },
  sales: {
    type: "sales",
    nameKey: "team.assistants.sales.name",
    descriptionKey: "team.assistants.sales.description",
    iconName: "trending-up-outline",
    accentColor: "#16a34a",
    tiles: [
      {
        key: "cma",
        labelKey: "v2.tiles.cma",
        iconName: "analytics-outline",
        href: "/cma",
      },
      {
        key: "showings",
        labelKey: "v2.tiles.showings",
        iconName: "eye-outline",
        href: "/showings",
      },
    ],
  },
  marketing: {
    type: "marketing",
    nameKey: "team.assistants.marketing.name",
    descriptionKey: "team.assistants.marketing.description",
    iconName: "megaphone-outline",
    accentColor: "#7c3aed",
    tiles: [
      {
        key: "quick_post",
        labelKey: "v2.tiles.quick_post",
        iconName: "flash-outline",
        href: "/quick-post",
      },
      {
        key: "postcards",
        labelKey: "v2.tiles.postcards",
        iconName: "mail-outline",
        href: "/postcards",
      },
      {
        key: "scheduled",
        labelKey: "v2.tiles.scheduled",
        iconName: "time-outline",
        href: "/scheduled",
      },
      {
        key: "recurring",
        labelKey: "v2.tiles.recurring",
        iconName: "refresh-outline",
        href: "/recurring",
      },
      {
        key: "post_history",
        labelKey: "v2.tiles.post_history",
        iconName: "archive-outline",
        href: "/post-history",
      },
      {
        key: "connect_platforms",
        labelKey: "v2.tiles.connect_platforms",
        iconName: "link-outline",
        href: "/connect-platforms",
      },
    ],
  },
  transaction: {
    type: "transaction",
    nameKey: "team.assistants.transaction.name",
    descriptionKey: "team.assistants.transaction.description",
    iconName: "document-text-outline",
    accentColor: "#0891b2",
    tiles: [
      {
        key: "offer_desk",
        labelKey: "team.tiles.offer_desk",
        iconName: "document-text-outline",
        href: "/(tabs)/offer-desk",
      },
    ],
  },
  accountant: {
    type: "accountant",
    nameKey: "team.assistants.accountant.name",
    descriptionKey: "team.assistants.accountant.description",
    iconName: "wallet-outline",
    accentColor: "#0d9488",
    tiles: [
      {
        key: "expenses",
        labelKey: "v2.tiles.expenses",
        iconName: "wallet-outline",
        href: "/expenses",
      },
    ],
  },
};

/** Narrowing type guard for the `[type]` route param. */
export function isAssistantType(value: unknown): value is AssistantType {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(TEAM_SECTIONS, value)
  );
}

/** Lookup a single hub by type — used by `app/assistant/[type].tsx`. */
export function getAssistantHub(
  type: AssistantType,
): AssistantHubConfig {
  return TEAM_SECTIONS[type];
}
