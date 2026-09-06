import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { HomeFeatureGrid } from "../../components/home/v2/HomeFeatureGrid";
import { HomeFeatureTile } from "../../components/home/v2/HomeFeatureTile";
import { HomeSectionHeader } from "../../components/home/v2/HomeSectionHeader";
import type { HomeFeatureTileConfig } from "../../lib/homeFeatures";
import type { ThemeTokens } from "../../lib/theme";
import { initialsFor, useMobileAccount } from "../../lib/useMobileAccount";
import { useThemeTokens } from "../../lib/useThemeTokens";

/**
 * More tab — every screen that is not on the tab bar, as cards. Grouped
 * Work / Marketing / Insights / Account and rendered with the SAME tile
 * grid the Home feature sections use.
 *
 * Every tile here points to a screen that already exists in the app.
 */

type TileColorKey = "success" | "accent" | "danger" | "infoAccent" | "warning" | "textMuted";

type MoreSection = {
  key: string;
  labelKey: string;
  accentKey: "accent" | "success" | "warning" | "textMuted";
  /** `ns` lets a tile borrow a label from another namespace (the tab names). */
  /** `colorKey` names a theme token, so tiles follow dark mode and the brand ramp. */
  tiles: (HomeFeatureTileConfig & { colorKey: TileColorKey; ns?: string })[];
};

const MORE_SECTIONS: readonly MoreSection[] = [
  {
    // What used to be on the tab bar: the tab bar is now Ask Max · Tasks ·
    // Deals · Calendar · More, mirroring the web sidebar, so daily lists
    // live here as cards.
    key: "work",
    labelKey: "more.sections.work",
    accentKey: "accent",
    tiles: [
      { key: "leads", labelKey: "tabs.leads", ns: "nav", iconName: "people-outline", href: "/(tabs)/leads", colorKey: "accent" },
      { key: "inbox", labelKey: "tabs.inbox", ns: "nav", iconName: "chatbubbles-outline", href: "/(tabs)/inbox", colorKey: "infoAccent" },
      { key: "team", labelKey: "tabs.team", ns: "nav", iconName: "people-circle-outline", href: "/(tabs)/team", colorKey: "success" },
    ],
  },
  {
    key: "marketing",
    labelKey: "more.sections.marketing",
    accentKey: "warning",
    tiles: [
      { key: "quick_post", labelKey: "v2.tiles.quick_post", iconName: "flash-outline", href: "/quick-post", colorKey: "warning" },
      { key: "weekly_schedule", labelKey: "v2.tiles.weekly_schedule", iconName: "calendar-outline", href: "/weekly-schedule", colorKey: "accent" },
      { key: "scheduled", labelKey: "v2.tiles.scheduled", iconName: "time-outline", href: "/scheduled", colorKey: "infoAccent" },
      { key: "post_history", labelKey: "v2.tiles.post_history", iconName: "list-outline", href: "/post-history", colorKey: "textMuted" },
      { key: "postcards", labelKey: "v2.tiles.postcards", iconName: "mail-outline", href: "/postcards", colorKey: "danger" },
      { key: "connect_platforms", labelKey: "v2.tiles.connect_platforms", iconName: "link-outline", href: "/connect-platforms", colorKey: "accent" },
      { key: "digital_twin", labelKey: "v2.tiles.digital_twin", iconName: "person-outline", href: "/digital-twin", colorKey: "success" },
    ],
  },
  {
    key: "insights",
    labelKey: "more.sections.insights",
    accentKey: "success",
    tiles: [
      { key: "sphere", labelKey: "v2.tiles.sphere", iconName: "people-outline", href: "/sphere", colorKey: "danger" },
      { key: "coaching", labelKey: "v2.tiles.coaching", iconName: "school-outline", href: "/coaching", colorKey: "accent" },
      { key: "briefings", labelKey: "v2.tiles.briefings", iconName: "newspaper-outline", href: "/briefings", colorKey: "infoAccent" },
      { key: "expenses", labelKey: "v2.tiles.expenses", iconName: "wallet-outline", href: "/expenses", colorKey: "success" },
    ],
  },
  {
    key: "account",
    labelKey: "more.sections.account",
    accentKey: "textMuted",
    tiles: [
      { key: "settings", labelKey: "v2.tiles.settings", iconName: "settings-outline", href: "/(tabs)/settings", colorKey: "textMuted" },
      { key: "notifications", labelKey: "v2.tiles.notifications", iconName: "notifications-outline", href: "/notifications", colorKey: "danger" },
    ],
  },
];

export default function MoreScreen() {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("home");
  const router = useRouter();
  const { account } = useMobileAccount();
  const displayName = account?.brandName?.trim() || account?.email || "";

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {/* Profile card — the "me" surface every consumer app puts at the top
          of its last tab. Photo or initials, the brand name, the email, and
          one tap through to Settings. */}
      <Pressable
        onPress={() => router.push("/(tabs)/settings")}
        accessibilityRole="button"
        accessibilityLabel={t("more.profile.a11y")}
        style={({ pressed }) => [styles.profileCard, pressed && styles.profilePressed]}
      >
        <View style={styles.avatar}>
          {account?.photoUrl ? (
            <Image source={{ uri: account.photoUrl }} style={styles.avatarImg} accessibilityIgnoresInvertColors />
          ) : (
            <Text style={styles.avatarInitials}>{initialsFor(account)}</Text>
          )}
        </View>
        <View style={styles.profileText}>
          <Text style={styles.profileName} numberOfLines={1}>
            {displayName || t("more.profile.name_fallback")}
          </Text>
          {account?.email && displayName !== account.email ? (
            <Text style={styles.profileEmail} numberOfLines={1}>
              {account.email}
            </Text>
          ) : null}
          <Text style={styles.profileHint}>{t("more.profile.manage")}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={tokens.textSubtle} />
      </Pressable>

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
                  accentColor={tokens[tile.colorKey]}
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
    profileCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      padding: 16,
      marginBottom: 6,
      backgroundColor: theme.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      ...theme.elevation.raised,
    },
    profilePressed: { opacity: 0.85 },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.accentLight,
      borderWidth: 1,
      borderColor: theme.border,
    },
    avatarImg: { width: 56, height: 56 },
    avatarInitials: { fontSize: 20, fontWeight: "700", color: theme.accent },
    profileText: { flex: 1, minWidth: 0 },
    profileName: { fontSize: 18, fontWeight: "700", color: theme.text },
    profileEmail: { marginTop: 2, fontSize: 13, color: theme.textMuted },
    profileHint: { marginTop: 4, fontSize: 12, color: theme.accent, fontWeight: "600" },
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
