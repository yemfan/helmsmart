import { useRouter } from "expo-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Image, Pressable, StyleSheet, Text } from "react-native";

import type { ThemeTokens } from "../lib/theme";
import { initialsFor, useMobileAccount } from "../lib/useMobileAccount";
import { useThemeTokens } from "../lib/useThemeTokens";

/**
 * The agent's photo in the header, top right on every tab — where the web
 * dashboard keeps its account menu. Falls back to initials when there is no
 * photo yet. Tapping it opens Settings.
 */
export function ProfileButton() {
  const router = useRouter();
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("nav");
  const { account } = useMobileAccount();

  return (
    <Pressable
      onPress={() => router.push("/(tabs)/settings")}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t("profile")}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      {account?.photoUrl ? (
        <Image source={{ uri: account.photoUrl }} style={styles.photo} accessibilityIgnoresInvertColors />
      ) : (
        <Text style={styles.initials}>{initialsFor(account)}</Text>
      )}
    </Pressable>
  );
}

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    button: {
      width: 32,
      height: 32,
      borderRadius: 16,
      marginRight: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.accentLight,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: "hidden",
    },
    pressed: { opacity: 0.7 },
    photo: { width: 32, height: 32 },
    initials: { fontSize: 12, fontWeight: "700", color: theme.accent },
  });
