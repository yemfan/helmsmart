import type {
  MobileAgentInboxNotificationDto,
  MobileNotificationDeepScreen,
} from "@leadsmart/shared";
import { Ionicons } from "@expo/vector-icons";
import { HOME_ROUTE } from "../lib/homeRoute";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ErrorBanner } from "../components/ErrorBanner";
import { ScreenLoading } from "../components/ScreenLoading";
import { BrandRefreshControl } from "../components/BrandRefreshControl";
import {
  fetchMobileNotifications,
  postMobileNotificationRead,
} from "../lib/leadsmartMobileApi";
import type { MobileApiFailure } from "../lib/leadsmartMobileApi";
import { useThemeTokens } from "../lib/useThemeTokens";
import type { ThemeTokens } from "../lib/theme";

/**
 * Notifications inbox.
 *
 * The DB-stored `type` column is constrained to a small enum
 * (hot_lead / missed_call / reminder / new_lead). After Phase 2D
 * + the briefing / publish-failure pushes shipped this session we
 * have several distinct "reminder" sub-kinds — briefings, publish
 * failures — that the agent benefits from filtering separately.
 * Rather than widening the DB enum + migrating, this screen
 * classifies display-side via title-prefix sniffing + the
 * `data.deep_link.screen` hint. Filter chips let the agent narrow
 * by classified bucket.
 */

type ClassifiedKind =
  | "hot_lead"
  | "missed_call"
  | "briefing"
  | "publish_failure"
  | "reminder";

/**
 * Filter chip ids — labels resolve per-render via
 * `t(`notifications.filters.${id}`)` so a locale flip rebuilds the chip
 * strip without an app restart.
 */
const FILTER_IDS: Array<"all" | ClassifiedKind> = [
  "all",
  "hot_lead",
  "briefing",
  "publish_failure",
  "missed_call",
  "reminder",
];

function classify(
  n: MobileAgentInboxNotificationDto,
): ClassifiedKind {
  if (n.type === "hot_lead") return "hot_lead";
  if (n.type === "missed_call") return "missed_call";
  // `type === "reminder"` covers briefings + publish failures + raw
  // reminders. Discriminate by title prefix (emoji) — both pushes
  // emit a distinctive emoji that we control server-side.
  const title = n.title ?? "";
  if (title.startsWith("☀️") || title.startsWith("🌙")) return "briefing";
  if (title.startsWith("⚠️")) return "publish_failure";
  // Some failure pushes might carry a `screen: "scheduled"` deep link
  // even without the emoji — catch those too.
  const screen = n.data?.deep_link?.screen as MobileNotificationDeepScreen | undefined;
  if (screen === "scheduled") return "publish_failure";
  return "reminder";
}

type NotificationsT = (key: string, options?: Record<string, unknown>) => string;

function priorityLabel(
  p: MobileAgentInboxNotificationDto["priority"],
  t: NotificationsT,
): string {
  if (p === "high") return t("notifications.priority.high");
  if (p === "medium") return t("notifications.priority.medium");
  return t("notifications.priority.low");
}

function kindLabel(k: ClassifiedKind, t: NotificationsT): string {
  return t(`notifications.kinds.${k}`);
}

function kindIcon(k: ClassifiedKind): keyof typeof Ionicons.glyphMap {
  if (k === "hot_lead") return "flame-outline";
  if (k === "missed_call") return "call-outline";
  if (k === "briefing") return "sunny-outline";
  if (k === "publish_failure") return "alert-circle-outline";
  return "notifications-outline";
}

function kindColor(
  k: ClassifiedKind,
  tokens: ThemeTokens,
): { bg: string; fg: string } {
  if (k === "hot_lead") return { bg: "#FEE2E2", fg: "#DC2626" };
  if (k === "missed_call") return { bg: "#FEF3C7", fg: "#D97706" };
  if (k === "briefing") return { bg: "#FEF3C7", fg: "#92400E" };
  if (k === "publish_failure") return { bg: "#FEE2E2", fg: "#B91C1C" };
  return { bg: tokens.accentLight, fg: tokens.accent };
}

function navigateForDeepLink(
  router: ReturnType<typeof useRouter>,
  n: MobileAgentInboxNotificationDto,
) {
  const dl = n.data?.deep_link;
  const screen = dl?.screen as MobileNotificationDeepScreen | undefined;
  // The shared DTO uses `contact_id` (per the type def). Previous
  // code here read `lead_id` which is never present — so deep-link
  // taps for hot leads never routed correctly. Fix included.
  const contactId =
    (dl as { contact_id?: string } | undefined)?.contact_id ??
    (dl as unknown as { lead_id?: string } | undefined)?.lead_id;
  const taskId = dl?.task_id;
  const kind = classify(n);

  if (screen === "task" && taskId) {
    router.push({ pathname: "/tasks", params: { focusTaskId: taskId } });
    return;
  }
  if (screen === "call_log" && contactId) {
    router.push({ pathname: "/lead/[id]", params: { id: contactId } });
    return;
  }
  if (kind === "publish_failure" || screen === "scheduled") {
    router.push("/scheduled" as never);
    return;
  }
  if (kind === "briefing" || screen === "home") {
    router.push(HOME_ROUTE);
    return;
  }
  if (contactId) {
    router.push({ pathname: "/lead/[id]", params: { id: contactId } });
  }
}

export default function NotificationsCenterScreen() {
  const router = useRouter();
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t, i18n } = useTranslation("mobile_misc_screens");
  const [items, setItems] = useState<MobileAgentInboxNotificationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<MobileApiFailure | null>(null);
  const [filter, setFilter] = useState<(typeof FILTER_IDS)[number]>("all");

  const load = useCallback(async (mode: "full" | "refresh") => {
    if (mode === "full") {
      setLoading(true);
      setError(null);
    }
    if (mode === "refresh") setRefreshing(true);

    const res = await fetchMobileNotifications({ limit: 40 });

    if (mode === "full") setLoading(false);
    if (mode === "refresh") setRefreshing(false);

    if (res.ok === false) {
      setError(res);
      setItems([]);
      return;
    }
    setItems(res.notifications);
    setError(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load("full");
    }, [load])
  );

  const onOpen = useCallback(
    async (n: MobileAgentInboxNotificationDto) => {
      if (!n.read) {
        const res = await postMobileNotificationRead({ notificationId: n.id });
        if (res.ok) {
          setItems((prev) =>
            prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
          );
        }
      }
      navigateForDeepLink(router, n);
    },
    [router]
  );

  const onMarkAll = useCallback(async () => {
    const res = await postMobileNotificationRead({ markAllRead: true });
    if (res.ok) {
      setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    }
  }, []);

  // Counts per classified kind for the chip badges.
  const counts = useMemo(() => {
    const c: Record<ClassifiedKind, number> = {
      hot_lead: 0,
      missed_call: 0,
      briefing: 0,
      publish_failure: 0,
      reminder: 0,
    };
    for (const n of items) {
      if (!n.read) c[classify(n)] += 1;
    }
    return c;
  }, [items]);

  const filteredItems = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((n) => classify(n) === filter);
  }, [items, filter]);

  if (loading) {
    return <ScreenLoading message={t("notifications.loading")} />;
  }

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarHint}>{t("notifications.toolbar_hint")}</Text>
        <Pressable
          onPress={() => void onMarkAll()}
          style={({ pressed }) => [styles.markAll, pressed && styles.markAllPressed]}
          accessibilityRole="button"
          accessibilityLabel={t("notifications.mark_all_a11y")}
        >
          <Text style={styles.markAllText}>{t("notifications.mark_all")}</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTER_IDS.map((id) => {
          const active = filter === id;
          const badge = id === "all" ? items.filter((n) => !n.read).length : counts[id];
          return (
            <Pressable
              key={id}
              onPress={() => setFilter(id)}
              style={[
                styles.filterChip,
                active && styles.filterChipActive,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  active && styles.filterChipTextActive,
                ]}
              >
                {t(`notifications.filters.${id}`)}
              </Text>
              {badge > 0 && (
                <View style={styles.filterChipBadge}>
                  <Text style={styles.filterChipBadgeText}>{badge}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {error ? (
        <ErrorBanner
          title={t("notifications.error_title")}
          message={error.message}
          onRetry={() => void load("full")}
        />
      ) : null}

      <FlatList
        data={filteredItems}
        keyExtractor={(n) => n.id}
        refreshControl={
          <BrandRefreshControl
            refreshing={refreshing}
            onRefresh={() => void load("refresh")}
          />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {filter === "all"
              ? t("notifications.empty_all")
              : t("notifications.empty_kind", {
                  kind: kindLabel(filter as ClassifiedKind, t),
                })}
          </Text>
        }
        renderItem={({ item: n }) => {
          const kind = classify(n);
          const colors = kindColor(kind, tokens);
          return (
            <Pressable
              onPress={() => void onOpen(n)}
              style={({ pressed }) => [
                styles.card,
                !n.read && styles.cardUnread,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.cardTop}>
                <View
                  style={[styles.kindPill, { backgroundColor: colors.bg }]}
                >
                  <Ionicons
                    name={kindIcon(kind)}
                    size={11}
                    color={colors.fg}
                  />
                  <Text style={[styles.kindPillText, { color: colors.fg }]}>
                    {kindLabel(kind, t)} · {priorityLabel(n.priority, t)}
                  </Text>
                </View>
                <Text style={styles.time}>
                  {new Date(n.created_at).toLocaleString(i18n.language)}
                </Text>
              </View>
              <Text style={styles.title}>{n.title}</Text>
              <Text style={styles.body} numberOfLines={3}>
                {n.body}
              </Text>
              <Text style={styles.cta}>{t("notifications.open")}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bg },
    toolbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    toolbarHint: { flex: 1, fontSize: 13, color: theme.textMuted, marginRight: 12 },
    markAll: { paddingVertical: 6, paddingHorizontal: 10 },
    markAllPressed: { opacity: 0.75 },
    markAllText: { fontSize: 14, fontWeight: "700", color: theme.accent },
    filterRow: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
    },
    filterChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    filterChipActive: {
      backgroundColor: theme.accentLight,
      borderColor: theme.accent,
    },
    filterChipText: {
      fontSize: 12,
      fontWeight: "700",
      color: theme.text,
    },
    filterChipTextActive: {
      color: theme.accent,
    },
    filterChipBadge: {
      minWidth: 16,
      height: 16,
      paddingHorizontal: 4,
      borderRadius: 8,
      backgroundColor: theme.danger,
      alignItems: "center",
      justifyContent: "center",
    },
    filterChipBadgeText: {
      fontSize: 10,
      fontWeight: "700",
      color: "#fff",
    },
    listContent: { padding: 16, paddingBottom: 32, flexGrow: 1 },
    empty: {
      fontSize: 15,
      color: theme.textMuted,
      textAlign: "center",
      marginTop: 32,
      paddingHorizontal: 24,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      marginBottom: 12,
    },
    cardUnread: {
      borderColor: theme.infoBorder,
      backgroundColor: theme.surfaceMuted,
    },
    cardPressed: { opacity: 0.92 },
    cardTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    kindPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    kindPillText: {
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.4,
    },
    time: { fontSize: 11, color: theme.textSubtle },
    title: {
      fontSize: 17,
      fontWeight: "700",
      color: theme.text,
      marginBottom: 6,
    },
    body: {
      fontSize: 15,
      color: theme.textMuted,
      lineHeight: 22,
    },
    cta: {
      marginTop: 10,
      fontSize: 14,
      fontWeight: "700",
      color: theme.accent,
    },
  });
