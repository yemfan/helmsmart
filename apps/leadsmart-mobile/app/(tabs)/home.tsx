import type { MobileDashboardStats } from "@leadsmart/shared";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCachedFetch } from "../../lib/offline/useCachedFetch";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ErrorBanner } from "../../components/ErrorBanner";
import { BrandRefreshControl } from "../../components/BrandRefreshControl";
import { EngagementCard } from "../../components/home/EngagementCard";
import { NextPostSuggestionCard } from "../../components/home/NextPostSuggestionCard";
import { TodayAgenda } from "../../components/home/TodayAgenda";
import { PriorityAlerts } from "../../components/home/PriorityAlerts";
import { HomeFeatureSections } from "../../components/home/v2/HomeFeatureSections";
import { Skeleton } from "../../components/Skeleton";
import { FadeIn } from "../../components/Reveal";
import {
  fetchMobileDashboard,
  fetchLeadQueue,
  fetchMobileScheduledPosts,
} from "../../lib/leadsmartMobileApi";
import type { MobileApiFailure } from "../../lib/leadsmartMobileApi";
import { useThemeTokens } from "../../lib/useThemeTokens";
import type { ThemeTokens } from "../../lib/theme";

function SectionRule({ color }: { color: string }) {
  return <View style={{ height: 1, backgroundColor: color, marginVertical: 16 }} />;
}

export default function HomeScreen() {
  const router = useRouter();
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation(["home", "common"]);
  const [queueCount, setQueueCount] = useState(0);
  /** Counts for the Home chip row. `scheduledUpcoming` = posts
   *  awaiting cron pickup; `scheduledFailed` = terminal failures
   *  the agent should know about. Both surface as badges on the
   *  respective chips. */
  const [scheduledCounts, setScheduledCounts] = useState<{
    upcoming: number;
    failed: number;
  }>({ upcoming: 0, failed: 0 });

  // ── Cached fetch for dashboard (stats + weekly digest) ─────────
  // Agenda + priority alerts now live in their own extracted
  // components (`TodayAgenda`, `PriorityAlerts`), each owning its own
  // cached fetch so they can be reused on the Boss screen too.
  type DashboardPayload = {
    stats: MobileDashboardStats;
    weeklyDigest: {
      title: string;
      body: string;
      metrics: Record<string, number>;
      insights: Array<{ key: string; label: string; message: string; tone: string }>;
    } | null;
  };

  const dashFetcher = useCallback(async (): Promise<DashboardPayload | MobileApiFailure> => {
    const res = await fetchMobileDashboard();
    if (res.ok === false) return res;
    return {
      stats: res.stats,
      weeklyDigest: (res as any).weeklyDigest ?? null,
    };
  }, []);

  const {
    data: dashData,
    loading: dashLoading,
    error: dashboardError,
    refresh: dashRefresh,
  } = useCachedFetch<DashboardPayload>("home:dashboard", dashFetcher);

  const stats = dashData?.stats ?? null;
  const weeklyDigest = dashData?.weeklyDigest ?? null;
  const initialDone = !dashLoading || dashData !== null;

  // Queue count + scheduled-posts count stay as focus-effect
  // fetches (low-value for caching; agent expects fresh numbers
  // each time they swing back to Home).
  useFocusEffect(
    useCallback(() => {
      void fetchLeadQueue().then((qRes) => {
        if (qRes.ok) setQueueCount(qRes.total);
      });
      void fetchMobileScheduledPosts().then((sRes) => {
        if (sRes.ok === false) return;
        const upcoming = sRes.scheduled.filter(
          (s) => s.status === "scheduled" || s.status === "posting",
        ).length;
        const failed = sRes.scheduled.filter(
          (s) => s.status === "failed",
        ).length;
        setScheduledCounts({ upcoming, failed });
      });
    }, [])
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    dashRefresh();
    // Clear refreshing flag after a short delay — the hooks manage
    // their own loading state, but the pull-to-refresh spinner
    // needs a boolean driven from here. TodayAgenda / PriorityAlerts
    // own their own cached fetches and refresh on focus.
    setTimeout(() => setRefreshing(false), 600);
  }, [dashRefresh]);

  const handleFixedQuickAction = useCallback(
    (key: "lead" | "task" | "booking" | "message") => {
      switch (key) {
        case "lead":
          // Previously routed to the leads tab as a stub — now opens
          // the actual new-contact flow so the "新建线索" / "New lead"
          // quick action lives up to its label.
          router.push("/contact/new");
          break;
        case "task":
          router.push("/tasks");
          break;
        case "booking":
          router.push({ pathname: "/(tabs)/calendar", params: { newAppt: "1" } });
          break;
        case "message":
          router.push("/(tabs)/inbox");
          break;
        default:
          break;
      }
    },
    [router]
  );

  /*
   * First-load skeleton — mirrors the shape of the real home
   * screen (hero line + chip row + agenda list + two cards) so
   * the layout doesn't jump when the dashboard + agenda
   * responses arrive. Replaces the previous full-screen
   * `ScreenLoading` spinner, which made cold starts feel
   * longer than they actually were.
   */
  if (!initialDone) {
    return (
      <View style={styles.root}>
        <View style={styles.scrollContent}>
          <View style={styles.heroBlock}>
            <Skeleton width="70%" height={28} borderRadius={8} />
            <Skeleton
              width="85%"
              height={14}
              borderRadius={6}
              style={{ marginTop: 14 }}
            />
          </View>
          <SectionRule color={tokens.border} />
          <View style={styles.chipRow}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton
                key={i}
                width={88}
                height={36}
                borderRadius={999}
              />
            ))}
          </View>
          <SectionRule color={tokens.border} />
          <Skeleton width="30%" height={12} borderRadius={4} />
          <View style={{ marginTop: 12, gap: 10 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <View
                key={i}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  backgroundColor: tokens.surface,
                  borderWidth: 1,
                  borderColor: tokens.border,
                }}
              >
                <Skeleton width="60%" height={14} borderRadius={4} />
                <Skeleton
                  width="90%"
                  height={12}
                  borderRadius={4}
                  style={{ marginTop: 8 }}
                />
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  if (dashboardError && !stats) {
    return (
      <View style={styles.centered}>
        <ErrorBanner
          title={t("errors.dashboard_unavailable_title")}
          message={dashboardError.message}
          onRetry={dashRefresh}
        />
      </View>
    );
  }

  if (!stats) {
    return (
      <View style={styles.centered}>
        <ErrorBanner
          title={t("errors.dashboard_unavailable_title")}
          message={t("errors.dashboard_unavailable_body")}
          onRetry={dashRefresh}
        />
      </View>
    );
  }

  return (
    <FadeIn style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<BrandRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <NextPostSuggestionCard />

        <EngagementCard />

        <SectionRule color={tokens.border} />

        {/* v1.6: comprehensive feature launcher — all 17 features
         * grouped by supercategory (Work / Engage / Analyze / Manage).
         * Duplicates the per-tab tile grids so agents can either tap
         * Home and see everything in one scroll, or tap a supercategory
         * tab and see just that section. Both navigation paths land on
         * the same downstream screens. */}
        <HomeFeatureSections />

        <SectionRule color={tokens.border} />

        <TodayAgenda />

        <SectionRule color={tokens.border} />

        <PriorityAlerts />

        <SectionRule color={tokens.border} />

        {/* Weekly Digest */}
        {weeklyDigest && (
          <>
            <Text style={styles.sectionHeading}>{weeklyDigest.title}</Text>
            <View style={{ backgroundColor: tokens.surfaceMuted, borderRadius: 12, padding: 12, marginBottom: 8 }}>
              <Text style={{ fontSize: 13, color: tokens.textMuted, lineHeight: 20 }}>{weeklyDigest.body}</Text>
              {weeklyDigest.insights?.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  {weeklyDigest.insights.slice(0, 3).map((ins) => (
                    <Text key={ins.key} style={{ fontSize: 12, color: ins.tone === "warning" ? tokens.warning : ins.tone === "positive" ? tokens.successDark : tokens.textMuted, marginTop: 4 }}>
                      {ins.label}: {ins.message}
                    </Text>
                  ))}
                </View>
              )}
            </View>
            <SectionRule color={tokens.border} />
          </>
        )}

        {/* Lead Queue */}
        {queueCount > 0 && (
          <>
            <Pressable
              onPress={() => router.push("/(tabs)/leads" as any)}
              accessibilityRole="button"
              accessibilityLabel={t("lead_queue.one", {
                count: queueCount,
                defaultValue: t("lead_queue.other", { count: queueCount }),
              })}
              accessibilityHint={t("lead_queue.cta")}
              style={({ pressed }) => [{
                backgroundColor: pressed ? tokens.accentPressed : tokens.infoBgAlt,
                borderRadius: 12,
                padding: 14,
                borderWidth: 1,
                borderColor: tokens.infoBorder,
                marginBottom: 8,
                minHeight: 44, // WCAG 44pt touch target
              }]}
            >
              <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.infoText }}>
                {t("lead_queue.one", {
                  count: queueCount,
                  defaultValue: t("lead_queue.other", { count: queueCount }),
                })}
              </Text>
              <Text style={{ fontSize: 12, color: tokens.infoAccent, marginTop: 2 }}>
                {t("lead_queue.cta")}
              </Text>
            </Pressable>
            <SectionRule color={tokens.border} />
          </>
        )}

        <Text style={styles.sectionHeading}>{t("sections.quick_actions")}</Text>
        <View style={styles.quickGrid}>
          <Pressable
            onPress={() => handleFixedQuickAction("lead")}
            style={({ pressed }) => [styles.quickBtn, pressed && styles.quickBtnPressed]}
          >
            <Text style={styles.quickBtnText}>{t("quick_actions.lead")}</Text>
          </Pressable>
          <Pressable
            onPress={() => handleFixedQuickAction("task")}
            style={({ pressed }) => [styles.quickBtn, pressed && styles.quickBtnPressed]}
          >
            <Text style={styles.quickBtnText}>{t("quick_actions.task")}</Text>
          </Pressable>
          <Pressable
            onPress={() => handleFixedQuickAction("booking")}
            style={({ pressed }) => [styles.quickBtn, pressed && styles.quickBtnPressed]}
          >
            <Text style={styles.quickBtnText}>{t("quick_actions.booking")}</Text>
          </Pressable>
          <Pressable
            onPress={() => handleFixedQuickAction("message")}
            style={({ pressed }) => [styles.quickBtn, pressed && styles.quickBtnPressed]}
          >
            <Text style={styles.quickBtnText}>{t("quick_actions.message")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </FadeIn>
  );
}

/**
 * Style factory — consumed via `useMemo` in `HomeScreen` so the
 * stylesheet rebuilds when the OS color scheme flips.
 */
const createStyles = (theme: ThemeTokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 36, paddingTop: 12 },
  centered: {
    flex: 1,
    backgroundColor: theme.bg,
    padding: 16,
    paddingTop: 24,
    justifyContent: "flex-start",
  },
  heroBlock: { paddingBottom: 4 },
  rule: {
    height: 1,
    backgroundColor: theme.border,
    marginVertical: 16,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  chipPressed: { backgroundColor: theme.accentPressed, borderColor: theme.infoBorder },
  chipText: { fontSize: 13, fontWeight: "700", color: theme.text },
  chipBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: theme.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  chipBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  agendaHint: { fontSize: 12, color: theme.textSubtle, marginBottom: 10, marginTop: -4 },
  muted: { fontSize: 14, color: theme.textMuted, paddingVertical: 8, lineHeight: 20 },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 8,
    marginTop: 4,
  },
  quickBtn: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
  },
  quickBtnPressed: { backgroundColor: theme.accentPressed, borderColor: theme.infoBorder },
  quickBtnText: { fontSize: 15, fontWeight: "700", color: theme.text },
});
