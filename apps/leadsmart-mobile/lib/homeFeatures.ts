import type { Href } from "expo-router";
import type Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";

/**
 * Single source of truth for the v1.6 Home / supercategory tab tile
 * grid. Consumed by both:
 *
 * - `components/home/v2/HomeFeatureSections.tsx` (renders all 4
 *   sections on the Home tab as a full-feature launcher).
 * - `(tabs)/{work,engage,analyze,manage}.tsx` (renders just one
 *   section per tab, filtered by `HomeFeatureSectionKey`).
 *
 * Adding a new feature tile is a one-line edit in `HOME_FEATURE_SECTIONS`
 * below; both surfaces pick it up automatically.
 */

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export type HomeFeatureTileConfig = {
  /** Stable key for React lists + future analytics. */
  key: string;
  /** i18n key under `home.v2.tiles.*`. */
  labelKey: string;
  /** Ionicon name passed to `<Ionicons name={...} />`. */
  iconName: IoniconName;
  /** Expo Router target. Bottom-tab routes use `/(tabs)/foo` so the
   * tab bar context is preserved; standalone screens use `/foo`. */
  href: Href;
  /** Optional corner badge. Variant maps to a pill color in HomeFeatureTile. */
  badge?: { label: string; variant: "hot" | "vip" | "new" };
};

export type HomeFeatureSectionKey = "work" | "engage" | "analyze" | "manage";

export type HomeFeatureSectionConfig = {
  key: HomeFeatureSectionKey;
  /** i18n key under `home.v2.sections.*`. */
  labelKey: string;
  /** Theme-token key — resolved via `useThemeTokens()` at render. */
  accentKey: "accent" | "success" | "warning" | "textMuted";
  tiles: HomeFeatureTileConfig[];
};

/**
 * The 17-tile inventory grouped by supercategory. Order matters —
 * tiles render left-to-right top-to-bottom in a 3-column grid.
 */
export const HOME_FEATURE_SECTIONS: readonly HomeFeatureSectionConfig[] = [
  {
    key: "work",
    labelKey: "v2.sections.work",
    accentKey: "accent",
    tiles: [
      {
        key: "leads",
        labelKey: "v2.tiles.leads",
        iconName: "people-outline",
        href: "/(tabs)/leads",
      },
      {
        key: "tasks",
        labelKey: "v2.tiles.tasks",
        iconName: "checkmark-circle-outline",
        href: "/tasks",
      },
      {
        key: "calendar",
        labelKey: "v2.tiles.calendar",
        iconName: "calendar-outline",
        href: "/(tabs)/calendar",
      },
      {
        key: "showings",
        labelKey: "v2.tiles.showings",
        iconName: "eye-outline",
        href: "/showings",
      },
      {
        key: "quick_post",
        labelKey: "v2.tiles.quick_post",
        iconName: "flash-outline",
        href: "/quick-post",
        badge: { label: "NEW", variant: "new" },
      },
      {
        key: "expenses",
        labelKey: "v2.tiles.expenses",
        iconName: "wallet-outline",
        href: "/expenses",
        badge: { label: "NEW", variant: "new" },
      },
    ],
  },
  {
    key: "engage",
    labelKey: "v2.sections.engage",
    accentKey: "success",
    tiles: [
      {
        key: "inbox",
        labelKey: "v2.tiles.inbox",
        iconName: "chatbubble-outline",
        href: "/(tabs)/inbox",
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
        key: "weekly_schedule",
        labelKey: "v2.tiles.weekly_schedule",
        iconName: "calendar-outline",
        // Cast: expo-router's typed-route union is generated from the app dir at
        // build time; this newly-added route isn't in the checked-in `.expo/types` yet.
        href: "/weekly-schedule" as Href,
        badge: { label: "NEW", variant: "new" },
      },
      {
        key: "post_history",
        labelKey: "v2.tiles.post_history",
        iconName: "archive-outline",
        href: "/post-history",
      },
    ],
  },
  {
    key: "analyze",
    labelKey: "v2.sections.analyze",
    accentKey: "warning",
    tiles: [
      {
        key: "cma",
        labelKey: "v2.tiles.cma",
        iconName: "analytics-outline",
        href: "/cma",
      },
      {
        key: "sphere",
        labelKey: "v2.tiles.sphere",
        iconName: "people-outline",
        href: "/sphere",
      },
      {
        key: "coaching",
        labelKey: "v2.tiles.coaching",
        iconName: "school-outline",
        href: "/coaching",
      },
      {
        key: "briefings",
        labelKey: "v2.tiles.briefings",
        iconName: "newspaper-outline",
        href: "/briefings",
      },
    ],
  },
  {
    key: "manage",
    labelKey: "v2.sections.manage",
    accentKey: "textMuted",
    tiles: [
      {
        key: "settings",
        labelKey: "v2.tiles.settings",
        iconName: "settings-outline",
        href: "/(tabs)/settings",
      },
      {
        key: "notifications",
        labelKey: "v2.tiles.notifications",
        iconName: "notifications-outline",
        href: "/notifications",
      },
      {
        key: "connect_platforms",
        labelKey: "v2.tiles.connect_platforms",
        iconName: "link-outline",
        href: "/connect-platforms",
      },
      {
        key: "digital_twin",
        labelKey: "v2.tiles.digital_twin",
        iconName: "person-circle-outline",
        // Cast: expo-router's typed-route union is generated at build time; this
        // newly-added route isn't in the checked-in `.expo/types` yet.
        href: "/digital-twin" as Href,
        badge: { label: "NEW", variant: "new" },
      },
    ],
  },
];

/** Lookup a single section by key — used by the per-tab files. */
export function getHomeFeatureSection(
  key: HomeFeatureSectionKey
): HomeFeatureSectionConfig {
  const section = HOME_FEATURE_SECTIONS.find((s) => s.key === key);
  if (!section) {
    // Should be unreachable given the type union, but defend against
    // a future enum mismatch (e.g. a hand-edit that drops a section).
    throw new Error(`Unknown HomeFeatureSectionKey: ${key}`);
  }
  return section;
}
