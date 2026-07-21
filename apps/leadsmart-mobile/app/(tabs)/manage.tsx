import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { Linking, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { useMemo } from "react";
import { HomeFeatureSection } from "../../components/home/v2/HomeFeatureSection";
import { getHomeFeatureSection } from "../../lib/homeFeatures";
import { useThemeTokens } from "../../lib/useThemeTokens";
import type { ThemeTokens } from "../../lib/theme";
import { hapticButtonPress } from "../../lib/haptics";

const WEB_DASHBOARD_URL = "https://www.closebossai.com/dashboard";

/**
 * Manage tab — mirrors the web `Manage` supercategory (Account).
 * Tile data sourced from `lib/homeFeatures.ts`. Adds an "Open full
 * dashboard on the web" link for the web-only features (Billing,
 * Profile, Support) that don't ship in the mobile app.
 */
export default function ManageTabScreen() {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation(["home", "nav"]);
  const section = getHomeFeatureSection("manage");

  const onOpenWeb = () => {
    hapticButtonPress();
    void Linking.openURL(WEB_DASHBOARD_URL);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>{t("tabs.manage", { ns: "nav" })}</Text>
      <Text style={styles.subtitle}>{t("v2.tab_subtitle.manage", { ns: "home" })}</Text>
      <HomeFeatureSection section={section} />

      <Pressable
        onPress={onOpenWeb}
        style={({ pressed }) => [styles.webLink, pressed && styles.webLinkPressed]}
        accessibilityRole="link"
        accessibilityLabel={t("v2.web_link.label", { ns: "home" })}
      >
        <Ionicons
          name="open-outline"
          size={16}
          color={tokens.accent}
          style={{ marginRight: 6 }}
        />
        <Text style={styles.webLinkText}>{t("v2.web_link.label", { ns: "home" })}</Text>
      </Pressable>
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
    webLink: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 24,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 14,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    webLinkPressed: {
      opacity: 0.85,
    },
    webLinkText: {
      color: theme.accent,
      fontSize: 14,
      fontWeight: "600",
    },
  });
