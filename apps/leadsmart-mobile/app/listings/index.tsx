import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { BrandRefreshControl } from "../../components/BrandRefreshControl";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { FadeIn } from "../../components/Reveal";
import { LeadRowSkeleton, SkeletonList } from "../../components/Skeleton";
import { fetchMobileListings, type MobileListing } from "../../lib/closeBossMobileApi";
import { useCachedFetch } from "../../lib/offline/useCachedFetch";
import type { ThemeTokens } from "../../lib/theme";
import { useThemeTokens } from "../../lib/useThemeTokens";

/**
 * Listings — the agent's listing-side inventory, first in the web sidebar's
 * Deals group and until now absent from the app.
 *
 * Read-only, for the same reason Transactions is: a listing is created with
 * MLS data and photos attached, which is desk work. What this screen answers
 * is the question an agent gets asked in a car — how is my listing doing — so
 * each row leads with the address and carries the showing activity the web
 * list rolls up from the `showings` table.
 */
export default function ListingsScreen() {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("mobile_misc_screens");

  const { data, loading, error, stale, refresh } = useCachedFetch(
    "listings:list",
    () => fetchMobileListings(),
  );

  const items = useMemo<MobileListing[]>(() => data?.listings ?? [], [data]);

  const renderItem = useCallback(
    ({ item }: { item: MobileListing }) => <ListingRow row={item} />,
    [],
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t("listings.title"),
          headerBackTitle: t("listings.back"),
        }}
      />

      {error && data == null ? (
        <View style={styles.banner}>
          <ErrorBanner
            title={t("listings.load_failed")}
            message={error.message}
            onRetry={refresh}
          />
        </View>
      ) : null}

      {loading && items.length === 0 ? (
        <SkeletonList count={5} renderRow={() => <LeadRowSkeleton />} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t("listings.empty_title")}
          subtitle={t("listings.empty_body")}
        />
      ) : (
        <FadeIn>
          <FlatList
            data={items}
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

const ListingRow = memo(function ListingRow({ row }: { row: MobileListing }) {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("mobile_misc_screens");

  // An unmapped status renders as nothing rather than as its own slug.
  const status = row.status
    ? t(`listings.status.${row.status}`, { defaultValue: "" }) || null
    : null;

  const tone =
    row.status === "closed"
      ? { bg: tokens.successBg, fg: tokens.successText }
      : row.status === "pending"
        ? { bg: tokens.warningBg, fg: tokens.warningText }
        : { bg: tokens.infoBg, fg: tokens.infoText };

  const place = [row.city, row.state].filter(Boolean).join(", ");
  const showings = row.showings_total ?? 0;
  const upcoming = row.showings_upcoming ?? 0;

  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={styles.address} numberOfLines={2}>
          {row.property_address}
        </Text>
        {status ? (
          <View style={[styles.pill, { backgroundColor: tone.bg }]}>
            <Text style={[styles.pillText, { color: tone.fg }]}>{status}</Text>
          </View>
        ) : null}
      </View>

      {place ? (
        <Text style={styles.meta} numberOfLines={1}>
          {place}
        </Text>
      ) : null}

      <View style={styles.factRow}>
        {/* A listing with no price yet is a draft, not a $0 listing. */}
        {row.list_price != null && row.list_price > 0 ? (
          <Text style={styles.fact}>{formatMoney(row.list_price)}</Text>
        ) : null}
        {row.listing_start_date ? (
          <Text style={styles.factMuted}>
            {t("listings.listed", { date: formatDate(row.listing_start_date) })}
          </Text>
        ) : null}
      </View>

      {showings > 0 ? (
        <View style={styles.taskRow}>
          <Ionicons name="eye-outline" size={13} color={tokens.textSubtle} />
          <Text style={styles.taskText}>
            {t("listings.showings", { count: showings })}
          </Text>
          {upcoming > 0 ? (
            <Text style={styles.upcoming}>
              {t("listings.upcoming", { count: upcoming })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

/** Date-only column: parsed as local, so a list date cannot slip a day. */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function createStyles(t: ThemeTokens) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    banner: { padding: 12 },
    listContent: { paddingVertical: 8 },
    row: {
      backgroundColor: t.surface,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
      gap: 6,
    },
    rowHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    address: { flex: 1, fontSize: 15, fontWeight: "700", color: t.text, lineHeight: 20 },
    pill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    pillText: { fontSize: 10, fontWeight: "700" },
    meta: { fontSize: 13, color: t.textMuted },
    factRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
    fact: { fontSize: 15, fontWeight: "700", color: t.text },
    factMuted: { fontSize: 13, color: t.textMuted },
    taskRow: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
    taskText: { fontSize: 12, color: t.textSubtle },
    upcoming: { fontSize: 12, fontWeight: "700", color: t.infoAccent },
  });
}
