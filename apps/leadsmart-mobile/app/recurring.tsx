import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { platformLabel } from "../lib/socialPlatform";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  fetchMobileRecurrences,
  updateMobileRecurrence,
  type MobileRecurrence,
} from "../lib/closeBossMobileApi";
import {
  hapticButtonPress,
  hapticError,
  hapticSuccess,
} from "../lib/haptics";
import { useThemeTokens } from "../lib/useThemeTokens";
import type { ThemeTokens } from "../lib/theme";

/**
 * Recurring posts management on mobile. Sections by status:
 * Active (pause / cancel), Paused (resume / cancel), Completed /
 * Cancelled (read-only). Pull-to-refresh.
 *
 * Mirrors the web /dashboard/leads/generate/recurring page, sized
 * for the small screen — single column, no inline edit (cancel +
 * recreate is the workflow).
 */

/**
 * Day-of-week ids — labels resolve per-render via
 * `t(`recurring.weekdays.${id}`)` so locale flips re-render without an
 * app restart.
 */
const WEEKDAY_IDS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export default function RecurringScreen() {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t, i18n } = useTranslation("mobile_misc_screens");

  const [rows, setRows] = useState<MobileRecurrence[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "refresh") setRefreshing(true);
    setError(null);
    const res = await fetchMobileRecurrences();
    if (mode === "refresh") setRefreshing(false);
    if (res.ok === false) {
      setError(res.message);
      setRows([]);
      return;
    }
    setRows(res.recurrences);
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  const act = useCallback(
    (row: MobileRecurrence, action: "pause" | "resume" | "cancel") => {
      const proceed = async () => {
        hapticButtonPress();
        setBusyId(row.id);
        const res = await updateMobileRecurrence(row.id, action);
        setBusyId(null);
        if (res.ok === false) {
          hapticError();
          const failedKey =
            action === "pause"
              ? "recurring.alert.action_failed_pause"
              : action === "resume"
                ? "recurring.alert.action_failed_resume"
                : "recurring.alert.action_failed_cancel";
          Alert.alert(t(failedKey), res.message);
          return;
        }
        hapticSuccess();
        await load("refresh");
      };
      if (action === "cancel") {
        Alert.alert(
          t("recurring.alert.cancel_title"),
          t("recurring.alert.cancel_body"),
          [
            { text: t("recurring.alert.keep"), style: "cancel" },
            {
              text: t("recurring.alert.cancel"),
              style: "destructive",
              onPress: () => void proceed(),
            },
          ],
        );
      } else {
        void proceed();
      }
    },
    [load, t],
  );

  if (rows === null) {
    return (
      <View style={styles.loadingBlock}>
        <Stack.Screen
          options={{ title: t("recurring.title"), headerBackTitle: t("recurring.back") }}
        />
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  const active = rows.filter((r) => r.status === "active");
  const paused = rows.filter((r) => r.status === "paused");
  const done = rows.filter(
    (r) => r.status === "completed" || r.status === "cancelled",
  );

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
        options={{ title: t("recurring.title"), headerBackTitle: t("recurring.back") }}
      />

      {error && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={tokens.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {active.length === 0 && paused.length === 0 && done.length === 0 ? (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyTitle}>{t("recurring.empty_title")}</Text>
          <Text style={styles.emptyBody}>{t("recurring.empty_body")}</Text>
        </View>
      ) : null}

      {active.length > 0 && (
        <Section
          title={t("recurring.sections.active_title")}
          subtitle={t("recurring.sections.active_subtitle")}
        >
          {active.map((r) => (
            <Card
              key={r.id}
              row={r}
              styles={styles}
              busy={busyId === r.id}
              actions={[
                { label: t("recurring.actions.pause"), onPress: () => act(r, "pause") },
                {
                  label: t("recurring.actions.cancel"),
                  onPress: () => act(r, "cancel"),
                  destructive: true,
                },
              ]}
              t={t}
              locale={i18n.language}
            />
          ))}
        </Section>
      )}

      {paused.length > 0 && (
        <Section
          title={t("recurring.sections.paused_title")}
          subtitle={t("recurring.sections.paused_subtitle")}
        >
          {paused.map((r) => (
            <Card
              key={r.id}
              row={r}
              styles={styles}
              busy={busyId === r.id}
              actions={[
                { label: t("recurring.actions.resume"), onPress: () => act(r, "resume") },
                {
                  label: t("recurring.actions.cancel"),
                  onPress: () => act(r, "cancel"),
                  destructive: true,
                },
              ]}
              t={t}
              locale={i18n.language}
            />
          ))}
        </Section>
      )}

      {done.length > 0 && (
        <Section
          title={t("recurring.sections.done_title")}
          subtitle={t("recurring.sections.done_subtitle")}
        >
          {done.slice(0, 30).map((r) => (
            <Card
              key={r.id}
              row={r}
              styles={styles}
              busy={false}
              actions={[]}
              t={t}
              locale={i18n.language}
            />
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

type RecurringT = (key: string, options?: Record<string, unknown>) => string;

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "#6B7280",
          marginTop: 8,
          marginBottom: 4,
        }}
      >
        {title}
      </Text>
      <Text style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 8 }}>
        {subtitle}
      </Text>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

function describeCadence(r: MobileRecurrence, t: RecurringT): string {
  const hh = String(r.timeOfDayHour).padStart(2, "0");
  const mm = String(r.timeOfDayMinute).padStart(2, "0");
  const time = `${hh}:${mm}`;
  if (r.cadence === "daily") {
    return t("recurring.cadence.daily", { time, tz: r.timezone });
  }
  const day =
    r.weeklyDayOfWeek !== null && r.weeklyDayOfWeek >= 0 && r.weeklyDayOfWeek < 7
      ? t(`recurring.weekdays.${WEEKDAY_IDS[r.weeklyDayOfWeek]}`)
      : t("recurring.weekdays.unknown");
  return t("recurring.cadence.weekly", { day, time, tz: r.timezone });
}

function Card({
  row,
  styles,
  busy,
  actions,
  t,
  locale,
}: {
  row: MobileRecurrence;
  styles: ReturnType<typeof createStyles>;
  busy: boolean;
  actions: Array<{
    label: string;
    onPress: () => void;
    destructive?: boolean;
  }>;
  t: RecurringT;
  locale: string;
}) {
  const next = new Date(row.nextOccurrenceAt).toLocaleString(locale);
  const ends = row.endsAt ? new Date(row.endsAt).toLocaleDateString(locale) : null;
  // Was a three-way ternary ending in `t("platforms.facebook")`, so a Threads
  // or TikTok schedule did not just miss a translation — it claimed Facebook.
  const platformName = platformLabel(row.platform, t);
  const whenBase =
    row.status === "active"
      ? t("recurring.card.next_prefix", { when: next })
      : row.status === "paused"
        ? t("recurring.card.paused_prefix", { when: next })
        : t("recurring.card.posted_one", { count: row.occurrenceCount });
  // Pluralization: i18next returns the _other variant when count !== 1
  // for the "posted" line. We could call t("posted", { count }) directly
  // and rely on plural suffixes, but our key layout uses explicit
  // posted_one / posted_other so we pick manually for clarity.
  const whenLine =
    row.status === "completed" || row.status === "cancelled"
      ? row.occurrenceCount === 1
        ? t("recurring.card.posted_one", { count: row.occurrenceCount })
        : t("recurring.card.posted_other", { count: row.occurrenceCount })
      : whenBase;
  const maxSuffix = row.maxOccurrences ? ` · ${row.occurrenceCount}/${row.maxOccurrences}` : "";
  const endsSuffix = ends ? ` · ${t("recurring.card.ends_suffix", { date: ends })}` : "";
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.platformBadge}>
            <Text style={styles.platformBadgeText}>{platformName}</Text>
          </View>
          {row.socialAccountDisplay && (
            <Text style={styles.cardDisplay} numberOfLines={1}>
              {row.socialAccountDisplay}
            </Text>
          )}
        </View>
        <StatusBadge status={row.status} t={t} />
      </View>
      <Text style={styles.cadence}>{describeCadence(row, t)}</Text>
      <Text style={styles.caption} numberOfLines={2}>
        {row.caption}
      </Text>
      <Text style={styles.cardWhen}>
        {whenLine}
        {maxSuffix}
        {endsSuffix}
      </Text>
      {row.lastError && (
        <Text style={styles.cardError} numberOfLines={3}>
          {t("recurring.card.last_error_prefix", { message: row.lastError })}
        </Text>
      )}
      {actions.length > 0 && (
        <View style={styles.cardActions}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={a.onPress}
              disabled={busy}
              style={[
                styles.cardActionButton,
                a.destructive && styles.cardCancelButton,
              ]}
            >
              <Text
                style={[
                  styles.cardActionText,
                  a.destructive && styles.cardCancelText,
                ]}
              >
                {busy ? t("recurring.actions.busy") : a.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: MobileRecurrence["status"];
  t: RecurringT;
}) {
  const color =
    status === "active"
      ? "#059669"
      : status === "paused"
        ? "#D97706"
        : status === "completed"
          ? "#6B7280"
          : "#DC2626";
  const bg =
    status === "active"
      ? "#D1FAE5"
      : status === "paused"
        ? "#FEF3C7"
        : status === "completed"
          ? "#F3F4F6"
          : "#FEE2E2";
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: bg,
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 0.3,
          color,
        }}
      >
        {t(`recurring.status.${status}`, { defaultValue: status })}
      </Text>
    </View>
  );
}

function createStyles(t: ThemeTokens) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: t.bg },
    scrollContent: { padding: 16, paddingBottom: 48 },
    loadingBlock: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.bg,
    },
    errorBox: {
      flexDirection: "row",
      gap: 8,
      padding: 10,
      borderRadius: 10,
      backgroundColor: t.dangerBg,
      borderWidth: 1,
      borderColor: t.dangerBorder,
      marginBottom: 12,
    },
    errorText: { flex: 1, fontSize: 13, color: t.danger },
    emptyBlock: {
      padding: 24,
      borderRadius: 14,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderStyle: "dashed",
      alignItems: "center",
    },
    emptyTitle: { fontSize: 15, fontWeight: "700", color: t.text },
    emptyBody: {
      marginTop: 6,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
      color: t.textSubtle,
    },
    card: {
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    cardHeaderLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flex: 1,
      minWidth: 0,
    },
    platformBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: t.bg,
    },
    platformBadgeText: {
      fontSize: 10,
      fontWeight: "700",
      color: t.textSubtle,
    },
    cardDisplay: {
      flex: 1,
      fontSize: 13,
      fontWeight: "700",
      color: t.text,
    },
    cadence: {
      fontSize: 14,
      fontWeight: "700",
      color: t.text,
      marginBottom: 4,
    },
    caption: {
      fontSize: 13,
      lineHeight: 18,
      color: t.text,
    },
    cardWhen: {
      marginTop: 6,
      fontSize: 11,
      color: t.textSubtle,
    },
    cardError: {
      marginTop: 4,
      fontSize: 11,
      color: t.danger,
    },
    cardActions: {
      marginTop: 10,
      flexDirection: "row",
      gap: 8,
      justifyContent: "flex-end",
    },
    cardActionButton: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: t.border,
    },
    cardActionText: {
      fontSize: 11,
      fontWeight: "700",
      color: t.text,
    },
    cardCancelButton: {
      borderColor: t.dangerBorder,
    },
    cardCancelText: {
      color: t.danger,
    },
  });
}
