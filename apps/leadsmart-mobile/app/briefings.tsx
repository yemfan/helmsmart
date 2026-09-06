import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  fetchMobileBriefings,
  type MobileBriefing,
} from "../lib/leadsmartMobileApi";
import { useThemeTokens } from "../lib/useThemeTokens";
import type { ThemeTokens } from "../lib/theme";

/**
 * Past briefings — the agent's recent morning + evening history,
 * combined and sorted newest-first. Reached from the collapsed
 * "View past briefings →" tile on Home once the latest briefing is
 * marked read.
 *
 * Each entry renders the full briefing body inline (headline,
 * summary, highlights, best-move). No "tap to expand" interaction
 * — on a small history list, inline expansion would be more taps
 * than the agent wants. Keeps the screen browsable.
 */
export default function BriefingsScreen() {
  const { t } = useTranslation("mobile_misc_screens");
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const [items, setItems] = useState<MobileBriefing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    setError(null);
    const res = await fetchMobileBriefings();
    if (mode === "initial") setLoading(false);
    else setRefreshing(false);
    if (res.ok === false) {
      setError(res.message);
      return;
    }
    const combined = [...res.morning, ...res.evening].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    setItems(combined);
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load("refresh")}
          tintColor={tokens.accent}
        />
      }
    >
      <Stack.Screen
        options={{
          title: "Past briefings",
          headerBackTitle: "Home",
        }}
      />

      {loading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator color={tokens.accent} />
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyTitle}>{t("briefings.noBriefingsYet")}</Text>
          <Text style={styles.emptyBody}>
            {t("briefings.onceYourMorningAndEvening")}
          </Text>
        </View>
      ) : (
        items.map((row) => <BriefingEntry key={row.id} row={row} styles={styles} />)
      )}
    </ScrollView>
  );
}

function BriefingEntry({
  row,
  styles,
}: {
  row: MobileBriefing;
  styles: ReturnType<typeof createStyles>;
}) {
  const isMorning = row.kind === "morning";
  const emoji = isMorning ? "☀️" : "🌙";
  const kindLabel = isMorning ? "Morning Briefing" : "Evening Summary";
  const cardStyle = isMorning ? styles.cardMorning : styles.cardEvening;
  const titleStyle = isMorning ? styles.titleMorning : styles.titleEvening;
  const headline =
    row.headline?.trim() || row.summary?.split(/[.!?]\s/)[0] || kindLabel;
  const opp = row.insights?.topOpportunity ?? null;

  return (
    <View style={[styles.card, cardStyle]}>
      <View style={styles.header}>
        <Text style={styles.emoji}>{emoji}</Text>
        <View style={styles.headerText}>
          <Text style={[styles.title, titleStyle]}>{kindLabel}</Text>
          <Text style={styles.timestamp}>{formatAbsolute(row.created_at)}</Text>
        </View>
      </View>
      <Text style={styles.headline}>{headline}</Text>
      {row.summary ? <Text style={styles.summary}>{row.summary}</Text> : null}
      {opp ? (
        <View
          style={[
            styles.callout,
            isMorning ? styles.calloutMorning : styles.calloutEvening,
          ]}
        >
          <Text style={styles.calloutLabel}>✨ BEST MOVE</Text>
          <Text style={styles.calloutBody}>{opp}</Text>
        </View>
      ) : null}
    </View>
  );
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

function createStyles(t: ThemeTokens) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: t.bg },
    scrollContent: { padding: 16, paddingBottom: 48, gap: 12 },
    loadingBlock: {
      paddingVertical: 48,
      alignItems: "center",
    },
    errorBox: {
      padding: 14,
      borderRadius: 10,
      backgroundColor: t.dangerBg,
      borderWidth: 1,
      borderColor: t.dangerBorder,
    },
    errorText: { fontSize: 13, color: t.danger },
    emptyBlock: {
      padding: 24,
      borderRadius: 14,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderStyle: "dashed",
      alignItems: "center",
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: t.text,
    },
    emptyBody: {
      marginTop: 6,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
      color: t.textSubtle,
    },
    card: {
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
    },
    cardMorning: {
      backgroundColor: t.warningBg,
      borderColor: t.warningText,
    },
    cardEvening: {
      backgroundColor: t.infoBg,
      borderColor: t.infoText,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 10,
    },
    emoji: { fontSize: 22 },
    headerText: { flex: 1 },
    title: { fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
    titleMorning: { color: t.warningText },
    titleEvening: { color: t.infoText },
    timestamp: { marginTop: 2, fontSize: 11, color: t.textMuted },
    headline: {
      fontSize: 15,
      fontWeight: "700",
      lineHeight: 21,
      color: t.text,
      marginBottom: 4,
    },
    summary: {
      fontSize: 13,
      lineHeight: 19,
      color: t.text,
    },
    callout: {
      marginTop: 10,
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
    },
    calloutMorning: {
      backgroundColor: t.surface,
      borderColor: t.warningText,
    },
    calloutEvening: {
      backgroundColor: t.surface,
      borderColor: t.infoText,
    },
    calloutLabel: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.6,
      color: t.textMuted,
      marginBottom: 3,
    },
    calloutBody: {
      fontSize: 13,
      lineHeight: 18,
      color: t.text,
    },
  });
}
