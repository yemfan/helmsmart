import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { platformLabel, triggerLabel } from "../lib/socialPlatform";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  fetchMobilePosts,
  refreshMobilePostMetrics,
  type MobilePostMetrics,
  type MobilePublishedPost,
} from "../lib/leadsmartMobileApi";
import {
  hapticButtonPress,
  hapticError,
  hapticSuccess,
} from "../lib/haptics";
import { useThemeTokens } from "../lib/useThemeTokens";
import type { ThemeTokens } from "../lib/theme";

/**
 * Published-posts history screen. Lists every lead_post the agent
 * has published (and failed publishes for forensic) with the
 * latest engagement metrics, a thumbnail of any attached image,
 * and a per-row "Refresh" button that hits Meta's Graph API live.
 *
 * LinkedIn posts show a "metrics unavailable" note instead of zero
 * counters — the consumer scope we use doesn't expose post-level
 * analytics. Agents can still tap through to view the post on
 * LinkedIn for engagement.
 *
 * Mirrors /dashboard/leads/generate/posts on web.
 */
/**
 * Reconstruct the Quick Post deep-link params from a lead_post row.
 * Only CRM-anchored triggers (new_listing / open_house / price_drop
 * / just_sold) yield a useful follow-up — synthetic triggers
 * (custom / market_update / testimonial / by_address) have no
 * subject to carry forward.
 *
 * Subjects.ts emits wire ids like `listing:<uuid>` /
 * `open_house:<uuid>` / `transaction:<uuid>` — we reconstruct that
 * format from the row's denormalized columns.
 */
function reconstructFollowUpLink(post: {
  triggerKind: string | null;
  subjectKind: string | null;
  subjectRefId: string | null;
}): { trigger: string; subjectId: string } | null {
  const trigger = post.triggerKind;
  if (
    trigger !== "new_listing" &&
    trigger !== "open_house" &&
    trigger !== "price_drop" &&
    trigger !== "just_sold"
  ) {
    return null;
  }
  if (!post.subjectKind || !post.subjectRefId) return null;
  return {
    trigger,
    subjectId: `${post.subjectKind}:${post.subjectRefId}`,
  };
}

export default function PostHistoryScreen() {
  const tokens = useThemeTokens();
  const router = useRouter();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t, i18n } = useTranslation("mobile_misc_screens");

  const [rows, setRows] = useState<MobilePublishedPost[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-row local metrics state so Refresh updates feel instant
  // without reloading the whole list.
  type RowState = {
    metrics: MobilePostMetrics;
    metricsRefreshedAt: string | null;
    refreshing: boolean;
    refreshError: string | null;
  };
  const [rowState, setRowState] = useState<Record<string, RowState>>({});

  const seedRowState = useCallback((posts: MobilePublishedPost[]) => {
    const next: Record<string, RowState> = {};
    for (const p of posts) {
      next[p.id] = {
        metrics: p.metrics ?? {},
        metricsRefreshedAt: p.metricsRefreshedAt,
        refreshing: false,
        refreshError: null,
      };
    }
    setRowState(next);
  }, []);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "refresh") setRefreshing(true);
      setError(null);
      const res = await fetchMobilePosts({ limit: 100 });
      if (mode === "refresh") setRefreshing(false);
      if (res.ok === false) {
        setError(res.message);
        setRows([]);
        seedRowState([]);
        return;
      }
      setRows(res.posts);
      seedRowState(res.posts);
    },
    [seedRowState],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  const onRefreshMetrics = useCallback(async (postId: string) => {
    hapticButtonPress();
    setRowState((s) => ({
      ...s,
      [postId]: { ...s[postId], refreshing: true, refreshError: null },
    }));
    const res = await refreshMobilePostMetrics(postId);
    if (res.ok === false) {
      hapticError();
      setRowState((s) => ({
        ...s,
        [postId]: {
          ...s[postId],
          refreshing: false,
          refreshError: res.message,
        },
      }));
      return;
    }
    hapticSuccess();
    setRowState((s) => ({
      ...s,
      [postId]: {
        metrics: res.metrics ?? s[postId].metrics,
        metricsRefreshedAt: res.refreshedAt,
        refreshing: false,
        refreshError: null,
      },
    }));
  }, []);

  if (rows === null) {
    return (
      <View style={styles.loadingBlock}>
        <Stack.Screen
          options={{ title: t("post_history.title"), headerBackTitle: t("post_history.back") }}
        />
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  const published = rows.filter((r) => r.status === "published");
  const failed = rows.filter((r) => r.status === "failed");

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load("refresh")}
          tintColor={tokens.accent}
        />
      }
    >
      <Stack.Screen
        options={{ title: t("post_history.title"), headerBackTitle: t("post_history.back") }}
      />

      {error && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={tokens.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {rows.length === 0 && !error && <EmptyState tokens={tokens} t={t} />}

      {published.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>
            {t("post_history.section_published", { count: published.length })}
          </Text>
          {published.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              state={rowState[p.id]}
              onRefresh={() => void onRefreshMetrics(p.id)}
              onFollowUp={(link) => {
                hapticButtonPress();
                router.push({
                  pathname: "/quick-post",
                  params: {
                    trigger: link.trigger,
                    subjectId: link.subjectId,
                  },
                } as never);
              }}
              tokens={tokens}
              styles={styles}
              t={t}
              locale={i18n.language}
            />
          ))}
        </>
      )}

      {failed.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, styles.sectionLabelDanger]}>
            {t("post_history.section_failed", { count: failed.length })}
          </Text>
          {failed.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              state={rowState[p.id]}
              onRefresh={() => void onRefreshMetrics(p.id)}
              onFollowUp={(link) => {
                hapticButtonPress();
                router.push({
                  pathname: "/quick-post",
                  params: {
                    trigger: link.trigger,
                    subjectId: link.subjectId,
                  },
                } as never);
              }}
              tokens={tokens}
              styles={styles}
              t={t}
              locale={i18n.language}
            />
          ))}
        </>
      )}
    </ScrollView>
  );
}

type PostHistoryT = (key: string, options?: Record<string, unknown>) => string;

function PostCard({
  post,
  state,
  onRefresh,
  onFollowUp,
  tokens,
  styles,
  t,
  locale,
}: {
  post: MobilePublishedPost;
  state:
    | {
        metrics: MobilePostMetrics;
        metricsRefreshedAt: string | null;
        refreshing: boolean;
        refreshError: string | null;
      }
    | undefined;
  onRefresh: () => void;
  onFollowUp: (link: { trigger: string; subjectId: string }) => void;
  tokens: ThemeTokens;
  styles: ReturnType<typeof createStyles>;
  t: PostHistoryT;
  locale: string;
}) {
  const followUpLink = reconstructFollowUpLink(post);
  const metrics = state?.metrics ?? post.metrics ?? {};
  const refreshing = state?.refreshing ?? false;
  const refreshedAt = state?.metricsRefreshedAt ?? post.metricsRefreshedAt;
  const refreshError = state?.refreshError ?? null;

  const platformName = labelFor(post.platform, t);
  // null for a kind with no label, so an unknown slug never reaches the screen.
  const triggerText = triggerLabel(post.triggerKind, t);
  const accountName =
    post.pageName ??
    post.igBusinessUsername ??
    post.linkedinDisplayName ??
    t("post_history.account_fallback");
  const publishedAt = post.publishedAt
    ? new Date(post.publishedAt)
    : new Date(post.createdAt);
  const shortDateOpts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        {post.thumbnailUrl ? (
          <Image
            source={{ uri: post.thumbnailUrl }}
            style={styles.thumb}
          />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Ionicons name="document-text-outline" size={24} color={tokens.textSubtle} />
          </View>
        )}
        <View style={styles.cardHeaderMeta}>
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.platformBadge,
                post.platform === "facebook"
                  ? styles.platformFacebook
                  : post.platform === "instagram"
                    ? styles.platformInstagram
                    : styles.platformLinkedIn,
              ]}
            >
              <Text style={styles.platformBadgeText}>{platformName}</Text>
            </View>
            <Text style={styles.accountText} numberOfLines={1}>
              {accountName}
            </Text>
          </View>
          <Text style={styles.timeText}>
            {publishedAt.toLocaleString(locale, shortDateOpts)}
            {triggerText ? ` · ${triggerText}` : ""}
          </Text>
        </View>
      </View>

      <Text style={styles.caption} numberOfLines={4}>
        {post.caption}
      </Text>

      {post.status === "failed" && post.errorMessage && (
        <View style={styles.failBox}>
          <Text style={styles.failTitle}>{t("post_history.publish_failed")}</Text>
          <Text style={styles.failBody}>{post.errorMessage}</Text>
        </View>
      )}

      {post.status === "published" && (
        <MetricsRow
          metrics={metrics}
          platform={post.platform}
          styles={styles}
          t={t}
          locale={locale}
        />
      )}

      <View style={styles.actionRow}>
        {post.externalPostUrl && (
          <Pressable
            onPress={() => {
              hapticButtonPress();
              if (post.externalPostUrl) {
                void Linking.openURL(post.externalPostUrl);
              }
            }}
            style={styles.actionButton}
          >
            <Ionicons name="open-outline" size={14} color={tokens.accent} />
            <Text style={styles.actionButtonText}>
              {t("post_history.view_on", { platform: platformName })}
            </Text>
          </Pressable>
        )}
        {post.status === "published" && (
          <Pressable
            onPress={onRefresh}
            disabled={refreshing}
            style={[styles.actionButton, refreshing && styles.actionButtonBusy]}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={tokens.accent} />
            ) : (
              <>
                <Ionicons
                  name="refresh"
                  size={14}
                  color={tokens.accent}
                />
                <Text style={styles.actionButtonText}>{t("post_history.refresh")}</Text>
              </>
            )}
          </Pressable>
        )}
        {followUpLink && (
          <Pressable
            onPress={() => onFollowUp(followUpLink)}
            style={styles.actionButton}
          >
            <Ionicons
              name="add-circle-outline"
              size={14}
              color={tokens.accent}
            />
            <Text style={styles.actionButtonText}>{t("post_history.follow_up")}</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.refreshFooter}>
        {refreshedAt
          ? t("post_history.last_refresh", {
              when: new Date(refreshedAt).toLocaleString(locale, shortDateOpts),
            })
          : post.status === "published"
            ? t("post_history.no_metrics")
            : ""}
      </Text>
      {refreshError && (
        <Text style={styles.refreshError}>{refreshError}</Text>
      )}
    </View>
  );
}

function MetricsRow({
  metrics,
  platform,
  styles,
  t,
  locale,
}: {
  metrics: MobilePostMetrics;
  platform: string;
  styles: ReturnType<typeof createStyles>;
  t: PostHistoryT;
  locale: string;
}) {
  const cells: Array<{ label: string; value: number | null }> =
    platform === "instagram"
      ? [
          { label: t("post_history.metrics.likes"), value: metrics.likes ?? null },
          { label: t("post_history.metrics.comments"), value: metrics.comments ?? null },
          { label: t("post_history.metrics.saves"), value: metrics.saves ?? null },
          { label: t("post_history.metrics.reach"), value: metrics.reach ?? null },
          { label: t("post_history.metrics.impressions"), value: metrics.impressions ?? null },
        ]
      : platform === "facebook"
        ? [
            { label: t("post_history.metrics.reactions"), value: metrics.likes ?? null },
            { label: t("post_history.metrics.comments"), value: metrics.comments ?? null },
            { label: t("post_history.metrics.shares"), value: metrics.shares ?? null },
            { label: t("post_history.metrics.reach"), value: metrics.reach ?? null },
            { label: t("post_history.metrics.impressions"), value: metrics.impressions ?? null },
            { label: t("post_history.metrics.clicks"), value: metrics.clicks ?? null },
          ]
        : [];

  if (cells.length === 0) {
    return <Text style={styles.linkedinNoteText}>{t("post_history.linkedin_note")}</Text>;
  }

  return (
    <View style={styles.metricsGrid}>
      {cells.map((c) => (
        <View key={c.label} style={styles.metricCell}>
          <Text style={styles.metricValue}>
            {c.value == null ? t("post_history.metrics.empty_value") : c.value.toLocaleString(locale)}
          </Text>
          <Text style={styles.metricLabel}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

function EmptyState({ tokens, t }: { tokens: ThemeTokens; t: PostHistoryT }) {
  return (
    <View
      style={{
        padding: 24,
        alignItems: "center",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: tokens.border,
        borderStyle: "dashed",
        backgroundColor: tokens.surface,
        marginTop: 24,
      }}
    >
      <Ionicons name="document-text-outline" size={32} color={tokens.textSubtle} />
      <Text
        style={{
          marginTop: 8,
          fontSize: 14,
          fontWeight: "700",
          color: tokens.text,
        }}
      >
        {t("post_history.empty_title")}
      </Text>
      <Text
        style={{
          marginTop: 4,
          fontSize: 12,
          color: tokens.textSubtle,
          textAlign: "center",
        }}
      >
        {t("post_history.empty_body")}
      </Text>
    </View>
  );
}

function labelFor(p: string, t: PostHistoryT): string {
  return platformLabel(p, t);
}

function createStyles(tokens: ThemeTokens) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: tokens.bg },
    scrollContent: {
      padding: 16,
      paddingBottom: 48,
    },
    loadingBlock: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.bg,
    },
    sectionLabel: {
      marginTop: 12,
      marginBottom: 8,
      fontSize: 12,
      fontWeight: "700",
      color: tokens.textSubtle,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    sectionLabelDanger: {
      color: tokens.danger,
    },
    errorBox: {
      flexDirection: "row",
      gap: 8,
      padding: 10,
      borderRadius: 8,
      backgroundColor: tokens.dangerBg,
      borderWidth: 1,
      borderColor: tokens.danger,
      marginBottom: 12,
    },
    errorText: {
      flex: 1,
      fontSize: 13,
      color: tokens.danger,
    },
    card: {
      padding: 14,
      borderRadius: 14,
      backgroundColor: tokens.surface,
      borderWidth: 1,
      borderColor: tokens.border,
      marginBottom: 10,
    },
    cardHeader: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 10,
    },
    thumb: {
      width: 56,
      height: 56,
      borderRadius: 10,
      backgroundColor: tokens.bg,
    },
    thumbFallback: {
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: tokens.border,
    },
    cardHeaderMeta: { flex: 1, minWidth: 0 },
    badgeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    platformBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
    },
    platformFacebook: { backgroundColor: "#dbeafe" },
    platformInstagram: { backgroundColor: "#fce7f3" },
    platformLinkedIn: { backgroundColor: "#e0f2fe" },
    platformBadgeText: {
      fontSize: 11,
      fontWeight: "700",
      color: tokens.text,
    },
    accountText: {
      flex: 1,
      fontSize: 12,
      fontWeight: "600",
      color: tokens.text,
    },
    timeText: {
      marginTop: 3,
      fontSize: 11,
      color: tokens.textSubtle,
    },
    caption: {
      fontSize: 13,
      lineHeight: 18,
      color: tokens.text,
    },
    failBox: {
      marginTop: 10,
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: tokens.danger,
      backgroundColor: tokens.dangerBg,
    },
    failTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: tokens.danger,
    },
    failBody: {
      marginTop: 2,
      fontSize: 12,
      color: tokens.danger,
    },
    metricsGrid: {
      marginTop: 12,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 14,
    },
    metricCell: {
      minWidth: 64,
    },
    metricValue: {
      fontSize: 15,
      fontWeight: "700",
      color: tokens.text,
    },
    metricLabel: {
      fontSize: 10,
      fontWeight: "600",
      color: tokens.textSubtle,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    linkedinNoteText: {
      marginTop: 10,
      fontSize: 12,
      lineHeight: 17,
      fontStyle: "italic",
      color: tokens.textSubtle,
    },
    actionRow: {
      marginTop: 12,
      flexDirection: "row",
      gap: 8,
    },
    actionButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 8,
      backgroundColor: tokens.accentLight,
    },
    actionButtonBusy: { opacity: 0.6 },
    actionButtonText: {
      fontSize: 12,
      fontWeight: "700",
      color: tokens.accent,
    },
    refreshFooter: {
      marginTop: 8,
      fontSize: 10,
      color: tokens.textSubtle,
    },
    refreshError: {
      marginTop: 4,
      fontSize: 11,
      color: tokens.danger,
    },
  });
}
