import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useMemo } from "react";
import { useThemeTokens } from "../../../lib/useThemeTokens";
import type { ThemeTokens } from "../../../lib/theme";
import { HOME_FEATURE_SECTIONS } from "../../../lib/homeFeatures";
import { HomeFeatureSection } from "./HomeFeatureSection";
import { hapticButtonPress } from "../../../lib/haptics";

/**
 * Comprehensive 4-section tile grid for the Home tab — all 17
 * features visible in one scroll, grouped by web supercategory.
 * Driven by `lib/homeFeatures.ts`, the same config the per-tab
 * screens consume — adding / removing a tile is a one-line edit
 * there.
 */

const WEB_DASHBOARD_URL = "https://www.closebossai.com/dashboard";

export function HomeFeatureSections() {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("home");

  const onOpenWebDashboard = () => {
    hapticButtonPress();
    void Linking.openURL(WEB_DASHBOARD_URL);
  };

  return (
    <View>
      {HOME_FEATURE_SECTIONS.map((section) => (
        <HomeFeatureSection key={section.key} section={section} />
      ))}

      <Pressable
        onPress={onOpenWebDashboard}
        style={({ pressed }) => [styles.webLink, pressed && styles.webLinkPressed]}
        accessibilityRole="link"
        accessibilityLabel={t("v2.web_link.label")}
      >
        <Ionicons
          name="open-outline"
          size={16}
          color={tokens.accent}
          style={{ marginRight: 6 }}
        />
        <Text style={styles.webLinkText}>{t("v2.web_link.label")}</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
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
