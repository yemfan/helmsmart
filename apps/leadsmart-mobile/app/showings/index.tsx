import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BrandRefreshControl } from "../../components/BrandRefreshControl";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { FadeIn } from "../../components/Reveal";
import { LeadRowSkeleton, SkeletonList } from "../../components/Skeleton";
import {
  fetchMobileShowings,
  type MobileShowingListItem,
  type MobileShowingStatus,
} from "../../lib/leadsmartMobileApi";
import { useCachedFetch } from "../../lib/offline/useCachedFetch";
import { hapticRowTap } from "../../lib/haptics";
import { useThemeTokens } from "../../lib/useThemeTokens";
import type { ThemeTokens } from "../../lib/theme";

type FilterKey = "upcoming" | "attended" | "cancelled" | "all";
const FILTER_KEYS: FilterKey[] = ["upcoming", "attended", "cancelled", "all"];

const REACTION_EMOJI: Record<string, string> = {
  love: "❤️",
  like: "👍",
  maybe: "🤔",
  pass: "👎",
};

const STATUS_TONE: Record<MobileShowingStatus, "blue" | "green" | "red" | "gray"> = {
  scheduled: "blue",
  attended: "green",
  cancelled: "red",
  no_show: "gray",
};

/**
 * Showings list — agent's buyer-side property visits, sorted newest
 * first. Uses the same useCachedFetch pattern as the Leads tab so
 * the screen renders instantly from cache on next-open and revalidates
 * in the background.
 *
 * Filter chips do client-side narrowing (the API returns all rows;
 * we slice locally so chip-flip is instant).
 */
export default function ShowingsListScreen() {
  const router = useRouter();
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("showings_screen");

  const [filter, setFilter] = useState<FilterKey>("upcoming");

  const { data, loading, error, stale, refresh } = useCachedFetch(
    "showings:list",
    () => fetchMobileShowings(),
  );

  const showings = useMemo<MobileShowingListItem[]>(() => data?.showings ?? [], [data]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return showings.filter((s) => {
      if (filter === "all") return true;
      if (filter === "cancelled") return s.status === "cancelled" || s.status === "no_show";
      if (filter === "attended") return s.status === "attended";
      // upcoming — scheduled and in the future, or any scheduled if undated
      const inFuture = !s.scheduled_at || new Date(s.scheduled_at).getTime() >= now;
      return s.status === "scheduled" && inFuture;
    });
  }, [showings, filter]);

  const onRowPress = useCallback(
    (id: string) => {
      hapticRowTap();
      router.push({ pathname: "/showings/[id]", params: { id } });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: MobileShowingListItem }) => (
      <ShowingRow row={item} onPress={() => onRowPress(item.id)} />
    ),
    [onRowPress],
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t("list.title"),
          headerBackTitle: t("list.back"),
        }}
      />

      <View style={styles.filterStrip}>
        {FILTER_KEYS.map((key) => (
          <Pressable
            key={key}
            onPress={() => setFilter(key)}
            style={[styles.chip, filter === key && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === key && styles.chipTextActive]}>
              {t(`list.filters.${key}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {error && data == null ? (
        <View style={styles.banner}>
          <ErrorBanner title={t("list.load_failed")} message={error.message} onRetry={refresh} />
        </View>
      ) : null}

      {loading && filtered.length === 0 ? (
        <SkeletonList count={6} renderRow={() => <LeadRowSkeleton />} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={filter === "upcoming" ? t("list.empty.upcoming_title") : t("list.empty.other_title")}
          subtitle={
            filter === "upcoming"
              ? t("list.empty.upcoming_subtitle")
              : t("list.empty.other_subtitle")
          }
        />
      ) : (
        <FadeIn>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            refreshControl={
              <BrandRefreshControl refreshing={loading && stale} onRefresh={refresh} />
            }
            contentContainerStyle={styles.listContent}
            removeClippedSubviews
          />
        </FadeIn>
      )}
    </View>
  );
}

const ShowingRow = memo(function ShowingRow({
  row,
  onPress,
}: {
  row: MobileShowingListItem;
  onPress: () => void;
}) {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t, i18n } = useTranslation("showings_screen");

  const when = formatWhen(row.scheduled_at, i18n.language, t);
  const reaction = row.feedback_reaction ? REACTION_EMOJI[row.feedback_reaction] : null;
  const tone = STATUS_TONE[row.status];
  const statusLabel = t(`status.${row.status}`, { defaultValue: row.status });

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={t("list.row.a11y_label", {
        address: row.property_address,
        when,
        status: statusLabel,
      })}
    >
      <View style={styles.rowHeader}>
        <Text style={styles.address} numberOfLines={1}>
          {row.property_address}
        </Text>
        <View style={[styles.statusPill, styles[`statusPill_${tone}`]]}>
          <Text style={[styles.statusPillText, styles[`statusPillText_${tone}`]]}>
            {statusLabel}
          </Text>
        </View>
      </View>
      <View style={styles.rowMeta}>
        <Text style={styles.metaText} numberOfLines={1}>
          {when}
          {row.contact_name ? ` · ${row.contact_name}` : ""}
        </Text>
        {reaction || row.feedback_would_offer ? (
          <View style={styles.feedbackChips}>
            {reaction ? <Text style={styles.reactionEmoji}>{reaction}</Text> : null}
            {row.feedback_would_offer ? (
              <View style={styles.offerChip}>
                <Ionicons name="document-text" size={11} color={tokens.successText} />
                <Text style={styles.offerChipText}>{t("list.row.offer_chip")}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

type ShowingsT = (key: string, options?: Record<string, unknown>) => string;

/**
 * `t` should be the function from `useTranslation("showings_screen")` —
 * callers pass it so the "Today"/"Tomorrow"/"Yesterday" / "Date TBD"
 * labels and the underlying date/time strings render in the active
 * locale.
 */
function formatWhen(iso: string | null | undefined, locale: string, t: ShowingsT): string {
  if (!iso) return t("when.tbd");
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return t("when.tbd");
  const now = Date.now();
  const diffMs = d.getTime() - now;
  const diffDays = Math.round(diffMs / 86_400_000);
  const dayLabel =
    diffDays === 0
      ? t("when.today")
      : diffDays === 1
        ? t("when.tomorrow")
        : diffDays === -1
          ? t("when.yesterday")
          : d.toLocaleDateString(locale, {
              weekday: "short",
              month: "short",
              day: "numeric",
            });
  const time = d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  return `${dayLabel} · ${time}`;
}

function createStyles(t: ThemeTokens) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    filterStrip: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
      backgroundColor: t.surface,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
    },
    chipActive: { backgroundColor: t.chipActiveBg, borderColor: t.chipActiveBorder },
    chipText: { fontSize: 13, fontWeight: "500", color: t.textMuted },
    chipTextActive: { color: t.chipActiveText },
    banner: { padding: 12 },
    listContent: { paddingVertical: 8 },
    row: {
      backgroundColor: t.surface,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
    },
    rowPressed: { backgroundColor: t.surfaceMuted },
    rowHeader: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
    address: { flex: 1, fontSize: 15, fontWeight: "600", color: t.text },
    rowMeta: {
      marginTop: 4,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    metaText: { flex: 1, fontSize: 13, color: t.textMuted },
    feedbackChips: { flexDirection: "row", alignItems: "center", gap: 6 },
    reactionEmoji: { fontSize: 16 },
    offerChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: t.successBg,
    },
    offerChipText: { fontSize: 10, fontWeight: "600", color: t.successText },
    statusPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
    },
    statusPill_blue: { backgroundColor: t.infoBg },
    statusPill_green: { backgroundColor: t.successBg },
    statusPill_red: { backgroundColor: t.dangerBg },
    statusPill_gray: { backgroundColor: t.surfaceMuted },
    statusPillText: { fontSize: 10, fontWeight: "600", letterSpacing: 0.3 },
    statusPillText_blue: { color: t.infoText },
    statusPillText_green: { color: t.successText },
    statusPillText_red: { color: t.dangerTitle },
    statusPillText_gray: { color: t.textMuted },
  });
}
