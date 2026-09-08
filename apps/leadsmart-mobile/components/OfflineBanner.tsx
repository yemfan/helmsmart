import React, { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, LayoutAnimation, StyleSheet, Text, View } from "react-native";
import { useNetwork } from "../lib/offline/NetworkContext";
import { useWriteQueue } from "../lib/offline/useWriteQueue";
import { useThemeTokens } from "../lib/useThemeTokens";
import type { ThemeTokens } from "../lib/theme";

/**
 * Global offline indicator. Renders a warning bar when the device
 * has no network connectivity; animates its height in/out with
 * LayoutAnimation. Shows the number of pending queued writes so
 * the user knows their changes will sync.
 */
export function OfflineBanner(): React.JSX.Element | null {
  const { isConnected } = useNetwork();
  const { pendingCount } = useWriteQueue();
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("common");

  const prevConnected = useRef(isConnected);
  useEffect(() => {
    if (prevConnected.current !== isConnected) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      if (!isConnected) AccessibilityInfo.announceForAccessibility(t("offline.title"));
      prevConnected.current = isConnected;
    }
  }, [isConnected, t]);

  if (isConnected) return null;

  return (
    <View style={styles.container} accessibilityLiveRegion="assertive">
      <Text style={styles.title}>{t("offline.title")}</Text>
      {pendingCount > 0 && (
        <Text style={styles.subtitle}>{t("offline.pending", { count: pendingCount })}</Text>
      )}
    </View>
  );
}

function createStyles(tokens: ThemeTokens) {
  return StyleSheet.create({
    container: {
      backgroundColor: tokens.warningBg,
      borderBottomWidth: 1,
      borderColor: tokens.warningBorder,
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    title: {
      color: tokens.warning,
      fontWeight: "700",
      fontSize: 13,
    },
    subtitle: {
      color: tokens.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
  });
}
