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
import { fetchMobileOffers, type MobileOffer } from "../../lib/leadsmartMobileApi";
import { useCachedFetch } from "../../lib/offline/useCachedFetch";
import type { ThemeTokens } from "../../lib/theme";
import { useThemeTokens } from "../../lib/useThemeTokens";

/**
 * Offers — third in the web sidebar's Deals group. Every offer the agent has
 * written or had forwarded in, newest first.
 *
 * The Offer Desk tab is where an offer gets *built*; this is the ledger of
 * what is outstanding. The two are different questions and the app had only
 * the first, which meant an agent could write an offer on the phone and then
 * had no way to see it again there.
 */
export default function OffersScreen() {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("mobile_misc_screens");

  const { data, loading, error, stale, refresh } = useCachedFetch(
    "offers:list",
    () => fetchMobileOffers(),
  );

  const items = useMemo<MobileOffer[]>(() => data?.offers ?? [], [data]);

  const renderItem = useCallback(
    ({ item }: { item: MobileOffer }) => <OfferRowView row={item} />,
    [],
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t("offers.title"),
          headerBackTitle: t("offers.back"),
        }}
      />

      {error && data == null ? (
        <View style={styles.banner}>
          <ErrorBanner
            title={t("offers.load_failed")}
            message={error.message}
            onRetry={refresh}
          />
        </View>
      ) : null}

      {loading && items.length === 0 ? (
        <SkeletonList count={5} renderRow={() => <LeadRowSkeleton />} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t("offers.empty_title")}
          subtitle={t("offers.empty_body")}
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

const OfferRowView = memo(function OfferRowView({ row }: { row: MobileOffer }) {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("mobile_misc_screens");

  const status = row.status
    ? t(`offers.status.${row.status}`, { defaultValue: "" }) || null
    : null;

  const tone =
    row.status === "accepted"
      ? { bg: tokens.successBg, fg: tokens.successText }
      : row.status === "rejected" || row.status === "withdrawn" || row.status === "expired"
        ? { bg: tokens.dangerBg, fg: tokens.dangerText }
        : row.status === "countered"
          ? { bg: tokens.warningBg, fg: tokens.warningText }
          : { bg: tokens.infoBg, fg: tokens.infoText };

  // After a counter, the number on the table is `current_price` — showing the
  // original would answer a question nobody is asking by then.
  const price =
    row.current_price != null && row.current_price > 0 ? row.current_price : row.offer_price;
  const counters = row.counter_count ?? 0;

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

      {row.contact_name ? (
        <Text style={styles.meta} numberOfLines={1}>
          {row.contact_name}
        </Text>
      ) : null}

      <View style={styles.factRow}>
        {price > 0 ? <Text style={styles.fact}>{formatMoney(price)}</Text> : null}
        {/* Against the ask, which is what makes the offer price mean anything. */}
        {row.list_price != null && row.list_price > 0 ? (
          <Text style={styles.factMuted}>
            {t("offers.vs_list", { price: formatMoney(row.list_price) })}
          </Text>
        ) : null}
      </View>

      {counters > 0 ? (
        <View style={styles.taskRow}>
          <Ionicons name="swap-horizontal-outline" size={13} color={tokens.textSubtle} />
          <Text style={styles.taskText}>{t("offers.counters", { count: counters })}</Text>
        </View>
      ) : null}
    </View>
  );
});

function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
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
  });
}
