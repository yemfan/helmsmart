import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { HomeFeatureGrid } from "../../components/home/v2/HomeFeatureGrid";
import { HomeFeatureTile } from "../../components/home/v2/HomeFeatureTile";
import type { HomeFeatureTileConfig } from "../../lib/homeFeatures";
import type { ThemeTokens } from "../../lib/theme";
import { useThemeTokens } from "../../lib/useThemeTokens";

/**
 * Deals tab — the mobile counterpart of the web sidebar's "Deals" group
 * (Listings · Showings · Offers · Transactions). Only the parts that have a
 * mobile screen are listed: showings, and the offer desk (build an offer,
 * review a contract, compare offers). Listings and transactions are web-only
 * today and are deliberately absent rather than shown as dead tiles.
 */
const DEAL_TILES: readonly (HomeFeatureTileConfig & {
  colorKey: "accent" | "success" | "warning";
})[] = [
  {
    key: "showings",
    labelKey: "v2.tiles.showings",
    iconName: "eye-outline",
    href: "/showings",
    colorKey: "accent",
  },
  {
    key: "offer_desk",
    labelKey: "v2.tiles.offer_desk",
    iconName: "document-text-outline",
    href: "/(tabs)/offer-desk",
    colorKey: "success",
  },
  {
    key: "cma",
    labelKey: "v2.tiles.cma",
    iconName: "analytics-outline",
    href: "/cma",
    colorKey: "warning",
  },
];

export default function DealsScreen() {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("home");

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>{t("deals.title")}</Text>
      <Text style={styles.subtitle}>{t("deals.subtitle")}</Text>
      <View style={styles.card}>
        <HomeFeatureGrid>
          {DEAL_TILES.map((tile) => (
            <HomeFeatureTile
              key={tile.key}
              icon={<Ionicons name={tile.iconName} size={24} color="#ffffff" />}
              label={t(tile.labelKey)}
              accentColor={tokens[tile.colorKey]}
              href={tile.href}
            />
          ))}
        </HomeFeatureGrid>
      </View>
    </ScrollView>
  );
}

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: theme.bg },
    content: { padding: 16, paddingBottom: 40 },
    h1: { fontSize: 28, fontWeight: "700", color: theme.text },
    subtitle: { marginTop: 6, marginBottom: 14, fontSize: 15, color: theme.textMuted },
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
