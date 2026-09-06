import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { HomeFeatureGrid } from "../../components/home/v2/HomeFeatureGrid";
import { HomeFeatureTile } from "../../components/home/v2/HomeFeatureTile";
import { HomeSectionHeader } from "../../components/home/v2/HomeSectionHeader";
import type { HomeFeatureTileConfig } from "../../lib/homeFeatures";
import type { ThemeTokens } from "../../lib/theme";
import { useThemeTokens } from "../../lib/useThemeTokens";

/**
 * More tab — the catch-all for existing mobile screens that don't belong
 * to an AI assistant hub. Lightly grouped (Schedule / Insights / Account)
 * and rendered with the SAME tile grid the Home feature sections use.
 *
 * Every tile here points to a screen that already exists in the app.
 */

type MoreSection = {
  key: string;
  labelKey: string;
  accentKey: "accent" | "success" | "warning" | "textMuted";
  /** `ns` lets a tile borrow a label from another namespace (the tab names). */
  tiles: (HomeFeatureTileConfig & { color: string; ns?: string })[];
};

const MORE_SECTIONS: readonly MoreSection[] = [
  {
    key: "schedule",
    labelKey: "more.sections.schedule",
    accentKey: "accent",
    tiles: [
      // Calendar left this grid for the tab bar (2026-09 UX audit).
      {
        key: "tasks",
        labelKey: "v2.tiles.tasks",
        iconName: "checkmark-circle-outline",
        href: "/tasks",
        color: "#16a34a",
      },
    ],
  },
  {
    key: "insights",
    labelKey: "more.sections.insights",
    accentKey: "warning",
    tiles: [
      {
        key: "team",
        labelKey: "tabs.team",
        ns: "nav",
        iconName: "people-circle-outline",
        href: "/(tabs)/team",
        color: "#0072ce",
      },
      {
        key: "sphere",
        labelKey: "v2.tiles.sphere",
        iconName: "people-outline",
        href: "/sphere",
        color: "#e11d48",
      },
      {
        key: "coaching",
        labelKey: "v2.tiles.coaching",
        iconName: "school-outline",
        href: "/coaching",
        color: "#2563eb",
      },
      {
        key: "briefings",
        labelKey: "v2.tiles.briefings",
        iconName: "newspaper-outline",
        href: "/briefings",
        color: "#0891b2",
      },
    ],
  },
  {
    key: "account",
    labelKey: "more.sections.account",
    accentKey: "textMuted",
    tiles: [
      {
        key: "settings",
        labelKey: "v2.tiles.settings",
        iconName: "settings-outline",
        href: "/(tabs)/settings",
        color: "#475569",
      },
      {
        key: "notifications",
        labelKey: "v2.tiles.notifications",
        iconName: "notifications-outline",
        href: "/notifications",
        color: "#dc2626",
      },
    ],
  },
];

export default function MoreScreen() {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("home");

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>{t("more.title")}</Text>
      <Text style={styles.subtitle}>{t("more.subtitle")}</Text>

      {MORE_SECTIONS.map((section) => (
        <View key={section.key}>
          <HomeSectionHeader
            label={t(section.labelKey)}
            accentColor={tokens[section.accentKey]}
          />
          <View style={styles.card}>
            <HomeFeatureGrid>
              {section.tiles.map((tile) => (
                <HomeFeatureTile
                  key={tile.key}
                  icon={<Ionicons name={tile.iconName} size={24} color="#ffffff" />}
                  label={t(tile.labelKey, tile.ns ? { ns: tile.ns } : undefined)}
                  accentColor={tile.color}
                  href={tile.href}
                />
              ))}
            </HomeFeatureGrid>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: theme.bg },
    content: { padding: 16, paddingBottom: 40 },
    h1: { fontSize: 28, fontWeight: "700", color: theme.text },
    subtitle: {
      marginTop: 6,
      marginBottom: 8,
      fontSize: 15,
      color: theme.textMuted,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 10,
      paddingTop: 12,
      paddingBottom: 2,
      ...theme.elevation.raised,
    },
  });
