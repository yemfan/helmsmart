import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { hapticSelectionChange } from "../../lib/haptics";
import {
  fetchBossTeam,
  type MobileBossAssistant,
} from "../../lib/leadsmartMobileApi";
import {
  ASSISTANT_BOSS_TYPE,
  ASSISTANT_ORDER,
  TEAM_SECTIONS,
  type AssistantType,
} from "../../lib/teamSections";
import type { ThemeTokens } from "../../lib/theme";
import { useThemeTokens } from "../../lib/useThemeTokens";

/**
 * Team roster — the "Your AI Team" tab. Lists the five assistants as
 * tappable rows that open each assistant's hub (`/assistant/<type>`),
 * plus a "Manage AI Team" row at the bottom.
 *
 * Best-effort active/paused status is pulled from `fetchBossTeam()`
 * (the same roster the Boss screen shows). If the fetch fails the rows
 * render fine without a status dot.
 */
export default function TeamScreen() {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const router = useRouter();
  const { t } = useTranslation("home");

  const [statusByType, setStatusByType] = useState<
    Record<string, MobileBossAssistant["status"]>
  >({});

  useEffect(() => {
    let cancelled = false;
    void fetchBossTeam().then((res) => {
      if (cancelled || res.ok === false) return;
      const map: Record<string, MobileBossAssistant["status"]> = {};
      for (const a of res.assistants) map[a.type] = a.status;
      setStatusByType(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const openHub = useCallback(
    (type: AssistantType) => {
      hapticSelectionChange();
      router.push(`/assistant/${type}`);
    },
    [router],
  );

  const openManage = useCallback(() => {
    hapticSelectionChange();
    router.push("/(tabs)/settings");
  }, [router]);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>{t("team.title")}</Text>
      <Text style={styles.subtitle}>{t("team.subtitle")}</Text>

      <View style={styles.card}>
        {ASSISTANT_ORDER.map((type, i) => {
          const hub = TEAM_SECTIONS[type];
          const status = statusByType[ASSISTANT_BOSS_TYPE[type]];
          return (
            <Pressable
              key={type}
              onPress={() => openHub(type)}
              accessibilityRole="button"
              accessibilityLabel={t(hub.nameKey)}
              style={({ pressed }) => [
                styles.row,
                i > 0 && styles.rowDivider,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={[styles.avatar, { backgroundColor: hub.accentColor }]}>
                <Ionicons name={hub.iconName} size={20} color="#ffffff" />
              </View>
              <View style={styles.rowText}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{t(hub.nameKey)}</Text>
                  {status ? (
                    <View style={styles.statusPill}>
                      <View
                        style={[
                          styles.statusDot,
                          {
                            backgroundColor:
                              status === "active"
                                ? tokens.success
                                : tokens.textSubtle,
                          },
                        ]}
                      />
                      <Text style={styles.statusText}>
                        {t(
                          status === "active"
                            ? "team.status.active"
                            : "team.status.paused",
                        )}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.desc} numberOfLines={2}>
                  {t(hub.descriptionKey)}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={tokens.textSubtle}
              />
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={openManage}
        accessibilityRole="button"
        accessibilityLabel={t("team.manage")}
        style={({ pressed }) => [styles.manageRow, pressed && styles.rowPressed]}
      >
        <View style={[styles.avatar, { backgroundColor: tokens.surfaceMuted }]}>
          <Ionicons name="settings-outline" size={20} color={tokens.textMuted} />
        </View>
        <Text style={styles.manageText}>{t("team.manage")}</Text>
        <Ionicons name="chevron-forward" size={18} color={tokens.textSubtle} />
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
      marginBottom: 16,
      fontSize: 15,
      color: theme.textMuted,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: "hidden",
      ...theme.elevation.raised,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 14,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    rowPressed: { backgroundColor: theme.surfaceMuted },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    rowText: { flex: 1, minWidth: 0 },
    nameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
    },
    name: { fontSize: 16, fontWeight: "600", color: theme.text },
    statusPill: { flexDirection: "row", alignItems: "center", gap: 4 },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusText: { fontSize: 11, fontWeight: "600", color: theme.textMuted },
    desc: {
      marginTop: 2,
      fontSize: 13,
      color: theme.textMuted,
      lineHeight: 18,
    },
    manageRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginTop: 16,
      paddingVertical: 14,
      paddingHorizontal: 14,
      backgroundColor: theme.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      ...theme.elevation.raised,
    },
    manageText: { flex: 1, fontSize: 16, fontWeight: "600", color: theme.text },
  });
