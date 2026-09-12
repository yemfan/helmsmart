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
import { fetchMobileTransactions, type MobileTransaction } from "../../lib/leadsmartMobileApi";
import { useCachedFetch } from "../../lib/offline/useCachedFetch";
import type { ThemeTokens } from "../../lib/theme";
import { useThemeTokens } from "../../lib/useThemeTokens";

/**
 * Transactions — the Deals group's fourth member, and the one the app was
 * missing. The web sidebar has had Listings · Showings · Offers ·
 * Transactions for a while; mobile shipped Deals with three tiles because a
 * tile that goes nowhere is worse than an absent one.
 *
 * Read-only on purpose. A deal under contract is edited where the documents
 * and the contingency dates are, and a half-built editor on a phone invites
 * someone to change a closing date with no paperwork in front of them. What
 * an agent needs away from the desk is the answer to "where does this stand
 * and what is overdue", which is exactly what the list carries.
 */

/** Sorted by the server: soonest closing first, newest when undated. */
export default function TransactionsScreen() {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("mobile_misc_screens");

  const { data, loading, error, stale, refresh } = useCachedFetch(
    "transactions:list",
    () => fetchMobileTransactions(),
  );

  const items = useMemo<MobileTransaction[]>(() => data?.transactions ?? [], [data]);

  const renderItem = useCallback(
    ({ item }: { item: MobileTransaction }) => <TransactionRow row={item} />,
    [],
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t("transactions.title"),
          headerBackTitle: t("transactions.back"),
        }}
      />

      {error && data == null ? (
        <View style={styles.banner}>
          <ErrorBanner
            title={t("transactions.load_failed")}
            message={error.message}
            onRetry={refresh}
          />
        </View>
      ) : null}

      {loading && items.length === 0 ? (
        <SkeletonList count={5} renderRow={() => <LeadRowSkeleton />} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t("transactions.empty_title")}
          subtitle={t("transactions.empty_body")}
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

const TransactionRow = memo(function TransactionRow({ row }: { row: MobileTransaction }) {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("mobile_misc_screens");

  // Unknown values never render as a slug — the same rule as the rest of the app.
  const status = row.status
    ? t(`transactions.status.${row.status}`, { defaultValue: "" }) || null
    : null;
  const kind = row.transaction_type
    ? t(`transactions.types.${row.transaction_type}`, { defaultValue: "" }) || null
    : null;

  const tone =
    row.status === "closed"
      ? { bg: tokens.successBg, fg: tokens.successText }
      : row.status === "pending"
        ? { bg: tokens.warningBg, fg: tokens.warningText }
        : { bg: tokens.infoBg, fg: tokens.infoText };

  // Once a deal has actually closed, that is the date an agent is looking
  // for — the scheduled one is now just what the contract used to say.
  const closing = row.closing_date_actual || row.closing_date;

  const done = row.task_completed ?? 0;
  const total = row.task_total ?? 0;
  const overdue = row.task_overdue ?? 0;

  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={styles.address} numberOfLines={2}>
          {row.property_address || t("transactions.no_address")}
        </Text>
        {status ? (
          <View style={[styles.pill, { backgroundColor: tone.bg }]}>
            <Text style={[styles.pillText, { color: tone.fg }]}>{status}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.meta} numberOfLines={1}>
        {[row.contact_name, kind].filter(Boolean).join(" · ") || "—"}
      </Text>

      <View style={styles.factRow}>
        {/* Money only when there is money: a real 0 and a missing price are
            different facts, and $0 beside a closing date reads as the price. */}
        {row.purchase_price != null && row.purchase_price > 0 ? (
          <Text style={styles.fact}>{formatMoney(row.purchase_price)}</Text>
        ) : null}
        {closing ? (
          <Text style={styles.fact}>
            {t(row.closing_date_actual ? "transactions.closed_on" : "transactions.closing", {
              date: formatDate(closing),
            })}
          </Text>
        ) : null}
      </View>

      {total > 0 ? (
        <View style={styles.taskRow}>
          <Ionicons
            name="checkmark-circle-outline"
            size={13}
            color={tokens.textSubtle}
          />
          <Text style={styles.taskText}>
            {t("transactions.tasks", { done, total })}
          </Text>
          {overdue > 0 ? (
            <Text style={styles.overdue}>
              {t("transactions.overdue", { count: overdue })}
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

/** Date-only column: parsed as local, so a closing date cannot slip a day. */
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
    factRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    fact: { fontSize: 13, fontWeight: "600", color: t.text },
    taskRow: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
    taskText: { fontSize: 12, color: t.textSubtle },
    overdue: { fontSize: 12, fontWeight: "700", color: t.dangerTitle },
  });
}
