import type { MobileInboxThreadDto } from "@leadsmart/shared";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { BrandRefreshControl } from "../../components/BrandRefreshControl";
import { InboxRowSkeleton, SkeletonList } from "../../components/Skeleton";
import { FadeIn } from "../../components/Reveal";
import { formatShortDateTime } from "../../lib/format";
import { getLeadsmartAccessToken } from "../../lib/env";
import { DEMO_LEAD_ID, getDemoInboxThread } from "../../lib/demoLead";
import { fetchMobileInbox, fetchMobileLeads } from "../../lib/leadsmartMobileApi";
import type { MobileApiFailure } from "../../lib/leadsmartMobileApi";
import { useInboxRealtime } from "../../lib/realtime/useInboxRealtime";
import { useThemeTokens } from "../../lib/useThemeTokens";
import type { ThemeTokens } from "../../lib/theme";
import { hapticRowTap } from "../../lib/haptics";
import { useCachedFetch } from "../../lib/offline/useCachedFetch";

/** Hot threads first, then by recency (matches server ordering within each group). */
function sortInboxThreads(threads: MobileInboxThreadDto[]): MobileInboxThreadDto[] {
  return [...threads].sort((a, b) => {
    if (a.isHotLead !== b.isHotLead) return a.isHotLead ? -1 : 1;
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });
}

/**
 * Row body (unwrapped). Exported as a memo below so FlatList
 * only re-renders rows whose `item` or `onPress` identity
 * changed — the same optimization the leads screen got in
 * batch 3. Without memoization, every scroll forced all visible
 * rows to re-render when the parent re-rendered.
 */
function ThreadRowInner({
  item,
  onPress,
}: {
  item: MobileInboxThreadDto;
  onPress: () => void;
}) {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("inbox");
  // Three-way on purpose. This was a binary ternary, so once the inbox
  // started carrying call threads anything not "sms" would have read "Email".
  const channel =
    item.channel === "sms"
      ? t("channel.sms")
      : item.channel === "call"
        ? t("channel.call")
        : t("channel.email");
  const hot = item.isHotLead;
  const leadName = item.leadName?.trim() || t("row.unnamed");
  const directionLabel = item.lastDirection === "inbound" ? t("direction.inbound") : t("direction.outbound");

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${hot ? t("row.a11y.hot_prefix") : ""}${t("row.a11y.label", { channel, name: leadName })}`}
      accessibilityHint={t("row.a11y.hint")}
      style={({ pressed }) => [
        styles.row,
        hot && styles.rowHot,
        pressed && styles.rowPressed,
      ]}
    >
      {hot ? (
        <View style={styles.hotStripe}>
          <Text style={styles.hotStripeText}>{t("row.hot_stripe")}</Text>
        </View>
      ) : null}
      <View style={styles.rowInner}>
        <View style={styles.rowTop}>
          <Text style={styles.channel}>{channel}</Text>
          {hot ? (
            <View style={styles.hotPill}>
              <Text style={styles.hotPillText}>{t("row.hot_pill")}</Text>
            </View>
          ) : null}
          <Text style={styles.time}>{formatShortDateTime(item.lastMessageAt)}</Text>
        </View>
        <Text style={[styles.name, hot && styles.nameHot]} numberOfLines={1}>
          {leadName}
        </Text>
        <Text style={styles.preview} numberOfLines={2}>
          {item.preview || t("row.preview_empty")}
        </Text>
        <Text style={styles.meta}>
          {item.leadId === DEMO_LEAD_ID ? t("row.sample_prefix") : ""}
          {directionLabel}
        </Text>
      </View>
    </Pressable>
  );
}

const ThreadRow = memo(ThreadRowInner);

export default function InboxScreen() {
  const router = useRouter();
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("inbox");
  const [threads, setThreads] = useState<MobileInboxThreadDto[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // ── Cached inbox fetch ─────────────────────────────────────────
  const inboxFetcher = useCallback(async (): Promise<MobileInboxThreadDto[] | MobileApiFailure> => {
    const res = await fetchMobileInbox();
    if (res.ok === false) return res;
    let next = sortInboxThreads(res.threads);
    if (next.length === 0) {
      const lr = await fetchMobileLeads({ page: 1, pageSize: 1 });
      if (lr.ok && lr.total === 0) {
        next = [getDemoInboxThread()];
      }
    }
    return next;
  }, []);

  const {
    data: cachedThreads,
    loading,
    error,
    refresh: cacheRefresh,
  } = useCachedFetch<MobileInboxThreadDto[]>("inbox", inboxFetcher);

  // Sync cached data into local threads state so realtime can
  // layer on top without losing the cached baseline.
  const prevCachedRef = useRef(cachedThreads);
  useEffect(() => {
    if (cachedThreads && cachedThreads !== prevCachedRef.current) {
      setThreads(cachedThreads);
    }
    prevCachedRef.current = cachedThreads;
  }, [cachedThreads]);

  // Silent refresh for realtime — bypasses cache, updates
  // local state directly.
  const silentRefresh = useCallback(async () => {
    const res = await fetchMobileInbox();
    if (res.ok === false) return;
    let next = sortInboxThreads(res.threads);
    if (next.length === 0) {
      const lr = await fetchMobileLeads({ page: 1, pageSize: 1 });
      if (lr.ok && lr.total === 0) {
        next = [getDemoInboxThread()];
      }
    }
    setThreads(next);
  }, []);

  const accessToken = getLeadsmartAccessToken();
  useInboxRealtime(
    useCallback(() => {
      void silentRefresh();
    }, [silentRefresh]),
    Boolean(accessToken) && !loading
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    cacheRefresh();
    setTimeout(() => setRefreshing(false), 600);
  }, [cacheRefresh]);

  /**
   * Stable navigation handler passed to every row. Pairs with
   * the `memo`-wrapped `ThreadRow` above — inline arrows in
   * `renderItem` would invalidate row memoization on every
   * parent render and scroll would re-render every visible row.
   * Fires a light "row tap" haptic on iOS before navigating.
   */
  const handleRowPress = useCallback(
    (leadId: string) => {
      hapticRowTap();
      router.push({
        pathname: "/lead/[id]",
        params: { id: leadId },
      });
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: MobileInboxThreadDto }) => (
      <ThreadRow item={item} onPress={() => handleRowPress(item.leadId)} />
    ),
    [handleRowPress]
  );

  const keyExtractor = useCallback(
    (thread: MobileInboxThreadDto) => `${thread.leadId}-${thread.channel}-${thread.messageId}`,
    []
  );

  const listEmpty = useMemo(() => {
    if (error) return null;
    return (
      <EmptyState
        title={t("empty.title")}
        subtitle={t("empty.subtitle")}
      />
    );
  }, [error, t]);

  /*
   * First-load skeleton state. Matches the shape of a real inbox
   * row so the layout doesn't reflow when data arrives. The old
   * `ScreenLoading` spinner flashed a full-screen centered
   * "Loading inbox…" text that made the tab feel like a cold
   * start on every network hiccup.
   */
  if (loading && threads.length === 0) {
    return (
      <View style={styles.container}>
        <SkeletonList count={6} renderRow={() => <InboxRowSkeleton />} />
      </View>
    );
  }

  return (
    <FadeIn style={styles.container}>
      {error ? (
        <ErrorBanner
          title={t("error.title")}
          message={error.message}
          onRetry={cacheRefresh}
        />
      ) : null}
      <FlatList
        data={threads}
        keyExtractor={keyExtractor}
        refreshControl={<BrandRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={listEmpty}
        /*
         * Performance knobs matching what leads.tsx got in
         * batch 3. The inbox can grow to hundreds of threads
         * for active agents; these trade a small amount of
         * scroll-in latency for much lower memory + fewer
         * layout passes while scrolling.
         */
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        renderItem={renderItem}
        contentContainerStyle={threads.length === 0 ? styles.emptyList : styles.listPad}
      />
    </FadeIn>
  );
}

/**
 * Style factory — invoked from `useMemo` inside each component
 * so the StyleSheet rebuilds whenever the OS color scheme flips.
 */
const createStyles = (theme: ThemeTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  listPad: { paddingVertical: 8 },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  row: {
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    overflow: "hidden",
  },
  rowHot: {
    borderColor: theme.hotBorder,
    backgroundColor: theme.hotBg,
    borderLeftWidth: 4,
    borderLeftColor: theme.hotBorder,
  },
  rowPressed: { opacity: 0.92 },
  hotStripe: {
    backgroundColor: theme.hotBorder,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  hotStripeText: {
    color: theme.textOnAccent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  rowInner: { padding: 14 },
  rowTop: { flexDirection: "row", alignItems: "center", marginBottom: 6, gap: 8 },
  channel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.accent,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  hotPill: {
    backgroundColor: theme.hotPillBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.hotBorder,
  },
  hotPillText: { fontSize: 10, fontWeight: "800", color: theme.hotPillText },
  time: { marginLeft: "auto", fontSize: 11, color: theme.textSubtle },
  name: { fontSize: 16, fontWeight: "600", color: theme.text, marginBottom: 4 },
  nameHot: { color: theme.hotLabel },
  preview: { fontSize: 14, color: theme.textSecondary, lineHeight: 20 },
  meta: { marginTop: 8, fontSize: 11, color: theme.textSubtle },
});
