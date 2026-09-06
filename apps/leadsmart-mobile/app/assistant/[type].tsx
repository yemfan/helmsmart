import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { HomeFeatureGrid } from "../../components/home/v2/HomeFeatureGrid";
import { HomeFeatureTile } from "../../components/home/v2/HomeFeatureTile";
import { getAssistantHub, isAssistantType } from "../../lib/teamSections";
import { TEAM_PORTRAITS } from "../../lib/teamPortraits";
import type { ThemeTokens } from "../../lib/theme";
import { useThemeTokens } from "../../lib/useThemeTokens";

/**
 * Assistant hub — the per-assistant landing screen reached from the Team
 * roster (`(tabs)/team.tsx`). Reads the `[type]` route param, looks up the
 * hub config in `lib/teamSections.ts`, and renders that assistant's mobile
 * features in the SAME tile grid the Home feature sections use.
 *
 * Tiles are only ever the features that already have a mobile screen — the
 * config never lists web-only capabilities.
 */
export default function AssistantHubScreen() {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("home");
  const { type } = useLocalSearchParams<{ type: string }>();
  const raw = typeof type === "string" ? type : Array.isArray(type) ? type[0] : "";

  // Unknown assistant type → bounce back to the roster.
  if (!isAssistantType(raw)) {
    return <Redirect href="/(tabs)/team" />;
  }

  const hub = getAssistantHub(raw);
  const name = t(hub.nameKey);
  const description = t(hub.descriptionKey);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: name }} />

      <View style={styles.header}>
        <View style={styles.avatar}>
          <Image
            source={TEAM_PORTRAITS[raw]}
            style={styles.avatarImg}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.h1}>{name}</Text>
          <Text style={styles.subtitle}>{description}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <HomeFeatureGrid>
          {hub.tiles.map((tile) => (
            <HomeFeatureTile
              key={tile.key}
              icon={<Ionicons name={tile.iconName} size={24} color="#ffffff" />}
              label={t(tile.labelKey)}
              accentColor={tokens[hub.accentKey]}
              href={tile.href}
              badge={tile.badge}
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
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 20,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      overflow: "hidden",
      backgroundColor: theme.surfaceMuted,
    },
    avatarImg: { width: 52, height: 52 },
    headerText: { flex: 1, minWidth: 0 },
    h1: { fontSize: 24, fontWeight: "700", color: theme.text },
    subtitle: {
      marginTop: 4,
      fontSize: 14,
      color: theme.textMuted,
      lineHeight: 19,
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
