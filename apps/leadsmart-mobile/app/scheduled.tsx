import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { platformLabel } from "../lib/socialPlatform";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  cancelMobileScheduledPost,
  fetchMobileScheduledPosts,
  type MobileScheduledPost,
} from "../lib/leadsmartMobileApi";
import {
  hapticButtonPress,
  hapticError,
  hapticSuccess,
} from "../lib/haptics";
import { useThemeTokens } from "../lib/useThemeTokens";
import type { ThemeTokens } from "../lib/theme";

/**
 * Scheduled posts management screen on mobile. Three sections by
 * status: Upcoming (scheduled / posting / failed-with-retry),
 * Failed (terminal failures with last_error), Recent (posted +
 * cancelled). Pull-to-refresh + per-row Cancel for the Upcoming
 * section.
 *
 * Mirrors the structure of the web /dashboard/leads/generate/scheduled
 * page, simplified for the small screen — surfaces the most useful
 * fields (display name + caption preview + status badge + scheduled
 * time + last error if any).
 */
export default function ScheduledPostsScreen() {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t, i18n } = useTranslation("mobile_misc_screens");

  const [rows, setRows] = useState<MobileScheduledPost[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "refresh") setRefreshing(true);
    setError(null);
    const res = await fetchMobileScheduledPosts();
    if (mode === "refresh") setRefreshing(false);
    if (res.ok === false) {
      setError(res.message);
      setRows([]);
      return;
    }
    setRows(res.scheduled);
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  const onCancel = useCallback(
    (row: MobileScheduledPost) => {
      Alert.alert(
        t("scheduled.alert.cancel_title"),
        t("scheduled.alert.cancel_body", {
          platform: labelFor(row.platform, t),
          when: new Date(row.scheduledFor).toLocaleString(i18n.language),
        }),
        [
          { text: t("scheduled.alert.keep"), style: "cancel" },
          {
            text: t("scheduled.alert.cancel"),
            style: "destructive",
            onPress: async () => {
              hapticButtonPress();
              setBusyId(row.id);
              const res = await cancelMobileScheduledPost(row.id);
              setBusyId(null);
              if (res.ok === false) {
                hapticError();
                Alert.alert(t("scheduled.alert.cancel_failed_title"), res.message);
                return;
              }
              hapticSuccess();
              await load("refresh");
            },
          },
        ],
      );
    },
    [load, t, i18n.language],
  );

  if (rows === null) {
    return (
      <View style={styles.loadingBlock}>
        <Stack.Screen
          options={{ title: t("scheduled.title"), headerBackTitle: t("scheduled.back") }}
        />
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  const upcoming = rows.filter(
    (r) => r.status === "scheduled" || r.status === "posting",
  );
  const failed = rows.filter((r) => r.status === "failed");
  const recent = rows.filter(
    (r) => r.status === "posted" || r.status === "cancelled",
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
        options={{ title: t("scheduled.title"), headerBackTitle: t("scheduled.back") }}
      />

      {error && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={tokens.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {upcoming.length === 0 && failed.length === 0 && recent.length === 0 ? (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyTitle}>{t("scheduled.empty_title")}</Text>
          <Text style={styles.emptyBody}>{t("scheduled.empty_body")}</Text>
        </View>
      ) : null}

      {upcoming.length > 0 && (
        <Section
          title={t("scheduled.sections.upcoming_title")}
          subtitle={t("scheduled.sections.upcoming_subtitle")}
        >
          {upcoming.map((r) => (
            <Card
              key={r.id}
              row={r}
              styles={styles}
              busy={busyId === r.id}
              onCancel={() => onCancel(r)}
              t={t}
              locale={i18n.language}
            />
          ))}
        </Section>
      )}

      {failed.length > 0 && (
        <Section
          title={t("scheduled.sections.failed_title")}
          subtitle={t("scheduled.sections.failed_subtitle")}
        >
          {failed.map((r) => (
            <Card
              key={r.id}
              row={r}
              styles={styles}
              busy={false}
              t={t}
              locale={i18n.language}
            />
          ))}
        </Section>
      )}

      {recent.length > 0 && (
        <Section
          title={t("scheduled.sections.recent_title")}
          subtitle={t("scheduled.sections.recent_subtitle")}
        >
          {recent.slice(0, 30).map((r) => (
            <Card
              key={r.id}
              row={r}
              styles={styles}
              busy={false}
              t={t}
              locale={i18n.language}
            />
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

type ScheduledT = (key: string, options?: Record<string, unknown>) => string;

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
          marginBottom: 4,
          marginTop: 8,
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

function Card({
  row,
  styles,
  busy,
  onCancel,
  t,
  locale,
}: {
  row: MobileScheduledPost;
  styles: ReturnType<typeof createStyles>;
  busy: boolean;
  onCancel?: () => void;
  t: ScheduledT;
  locale: string;
}) {
  const when = new Date(row.scheduledFor).toLocaleString(locale);
  const display =
    row.platform === "instagram"
      ? row.igBusinessUsername
        ? `@${row.igBusinessUsername}`
        : t("platforms.instagram")
      : row.platform === "facebook"
        ? row.pageName ?? t("platforms.facebook")
        : row.linkedinDisplayName ?? t("platforms.linkedin");
  const whenLine =
    row.status === "posted"
      ? t("scheduled.card.posted_at", {
          when: row.publishedAt ? new Date(row.publishedAt).toLocaleString(locale) : when,
        })
      : row.status === "cancelled"
        ? t("scheduled.card.was_scheduled", { when })
        : t("scheduled.card.scheduled_for", { when });
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.platformBadge}>
            <Text style={styles.platformBadgeText}>{labelFor(row.platform, t)}</Text>
          </View>
          <Text style={styles.cardDisplay} numberOfLines={1}>
            {display}
          </Text>
        </View>
        <StatusBadge status={row.status} t={t} />
      </View>
      <Text style={styles.cardCaption} numberOfLines={3}>
        {row.caption}
      </Text>
      <Text style={styles.cardWhen}>{whenLine}</Text>
      {row.lastError && (
        <Text style={styles.cardError} numberOfLines={3}>
          {t("scheduled.card.error_prefix", { message: row.lastError })}
        </Text>
      )}
      {(onCancel || row.publishedUrl) && (
        <View style={styles.cardActions}>
          {row.publishedUrl && (
            <Pressable
              onPress={() =>
                row.publishedUrl && Linking.openURL(row.publishedUrl)
              }
              style={styles.cardActionLink}
            >
              <Text style={styles.cardActionLinkText}>{t("scheduled.card.view_post")}</Text>
            </Pressable>
          )}
          {onCancel && (
            <Pressable
              onPress={onCancel}
              disabled={busy}
              style={styles.cardCancelButton}
            >
              <Text style={styles.cardCancelText}>
                {busy ? t("scheduled.card.busy") : t("scheduled.card.cancel")}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function labelFor(p: MobileScheduledPost["platform"], t: ScheduledT): string {
  return platformLabel(p, t);
}

function StatusBadge({
  status,
  t,
}: {
  status: MobileScheduledPost["status"];
  t: ScheduledT;
}) {
  const color =
    status === "posted"
      ? "#059669"
      : status === "failed"
        ? "#DC2626"
        : status === "cancelled"
          ? "#6B7280"
          : status === "posting"
            ? "#D97706"
            : "#2563EB";
  const bg =
    status === "posted"
      ? "#D1FAE5"
      : status === "failed"
        ? "#FEE2E2"
        : status === "cancelled"
          ? "#F3F4F6"
          : status === "posting"
            ? "#FEF3C7"
            : "#DBEAFE";
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
        {t(`scheduled.status.${status}`, { defaultValue: status })}
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
    cardCaption: {
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
      alignItems: "center",
      gap: 12,
    },
    cardActionLink: { paddingVertical: 4 },
    cardActionLinkText: {
      fontSize: 12,
      fontWeight: "700",
      color: t.accent,
    },
    cardCancelButton: {
      marginLeft: "auto",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: t.dangerBorder,
    },
    cardCancelText: {
      fontSize: 11,
      fontWeight: "700",
      color: t.danger,
    },
  });
}
