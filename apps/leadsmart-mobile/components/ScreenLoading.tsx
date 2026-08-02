import { useEffect, useMemo } from "react";
import { AccessibilityInfo, ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useThemeTokens } from "../lib/useThemeTokens";
import type { ThemeTokens } from "../lib/theme";

type Props = {
  message: string;
};

export function ScreenLoading({ message }: Props) {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  // Android live region + iOS imperative announce so the loading state isn't silent.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={tokens.accent} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    wrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.bg,
    },
    text: { marginTop: 12, fontSize: 14, color: theme.textMuted },
  });
