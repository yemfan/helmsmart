import type { MobileLeadRecordDto } from "@leadsmart/shared";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { BrandRefreshControl } from "../../components/BrandRefreshControl";
import { leadField } from "../../lib/leadRecord";
import { DEMO_LEAD_ID, getDemoLeadRecord } from "../../lib/demoLead";
import { fetchMobileLeads } from "../../lib/leadsmartMobileApi";
import type { MobileApiFailure, MobileLeadsFilter } from "../../lib/leadsmartMobileApi";
import { useThemeTokens } from "../../lib/useThemeTokens";
import type { ThemeTokens } from "../../lib/theme";
import { LeadRowSkeleton, SkeletonList } from "../../components/Skeleton";
import { FadeIn } from "../../components/Reveal";
import { hapticRowTap } from "../../lib/haptics";
import { useCachedFetch } from "../../lib/offline/useCachedFetch";

const PAGE_SIZE = 30;

/**
 * Local UI filter key — `"all"` is the UI-only "no filter" state,
 * the rest correspond 1:1 with `MobileLeadsFilter` from the API
 * client so this union stays narrow.
 *
 * Labels are resolved at render time via `t("filters.<key>")` so
 * the chip row re-renders cleanly when the agent flips locale.
 */
type FilterKey = "all" | MobileLeadsFilter;
const FILTER_KEYS: FilterKey[] = ["all", "hot", "high_engagement", "inactive"];

function paramStr(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  const x = Array.isArray(v) ? v[0] : v;
  const s = String(x).trim();
  return s.length ? s : undefined;
}

/**
 * Row body (unwrapped). Exported as a memo below so FlatList only
 * re-renders rows whose `lead` or `onPress` identity changed — a
 * large list previously re-rendered every row on every scroll
 * because `renderItem` built a fresh arrow function each cycle.
 */
function LeadRowInner({
  lead,
  onPress,
}: {
  lead: MobileLeadRecordDto;
  onPress: () => void;
}) {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("leads");
  const name = leadField(lead, "name") || t("unnamed");
  const phone = lead.display_phone || leadField(lead, "phone") || leadField(lead, "phone_number");
  const address = leadField(lead, "property_address");
  const rating = leadField(lead, "rating");
  const stage = leadField(lead, "pipeline_stage_name") || leadField(lead, "lead_status");
  const hot = rating.toLowerCase() === "hot";

  /**
   * Accessibility label: assembled from name + hot state + phone + stage
   * so screen reader users hear a complete description of each row.
   * Previously the row was an unlabeled <Pressable> so VoiceOver / TalkBack
   * announced only "double-tap to activate" with no content context.
   */
  const accessibilityLabel = [
    name,
    hot ? t("a11y.hot_lead") : null,
    phone ? t("a11y.phone", { phone }) : null,
    stage ? t("a11y.stage", { stage }) : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={t("a11y.open_lead")}
      style={({ pressed }) => [styles.row, hot && styles.rowHot, pressed && styles.rowPressed]}
    >
      <View style={styles.rowTop}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {hot ? (
          <View style={styles.hotPill}>
            <Text style={styles.hotText}>{t("hot_pill")}</Text>
          </View>
        ) : null}
      </View>
      {phone ? <Text style={styles.sub}>{phone}</Text> : null}
      {address ? (
        <Text style={styles.address} numberOfLines={2}>
          {address}
        </Text>
      ) : null}
      <View style={styles.footer}>
        {stage ? (
          <View style={styles.stagePill}>
            <Text style={styles.stageText}>{stage}</Text>
          </View>
        ) : null}
        {lead.ai_lead_score != null ? (
          <Text style={styles.score}>
            {t("ai_score", { score: Math.round(lead.ai_lead_score) })}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const LeadRow = memo(LeadRowInner);

export default function LeadsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("leads");

  // Header "+" button — wires into the new-contact flow.
  // Set via `navigation.setOptions` instead of in `(tabs)/_layout.tsx`
  // so the layout file doesn't need a leads-specific branch.
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("a11y.add_contact")}
          onPress={() => router.push("/contact/new")}
          style={({ pressed }) => ({
            paddingHorizontal: 14,
            paddingVertical: 6,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="add" size={26} color={tokens.accent} />
        </Pressable>
      ),
    });
  }, [navigation, router, t, tokens.accent]);
  const params = useLocalSearchParams<{ filter?: string | string[]; booking?: string | string[] }>();
  const filterRaw = paramStr(params.filter);
  const initialFilter: FilterKey =
    filterRaw === "hot"
      ? "hot"
      : filterRaw === "inactive"
        ? "inactive"
        : filterRaw === "high_engagement"
          ? "high_engagement"
          : "all";
  const showBookingHint = paramStr(params.booking) === "1";

  const [activeFilter, setActiveFilter] = useState<FilterKey>(initialFilter);
  const [search, setSearch] = useState("");
  const [leads, setLeads] = useState<MobileLeadRecordDto[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<MobileApiFailure | null>(null);

  const listFilter = activeFilter === "all" ? undefined : activeFilter;
  const cacheKey = "leads:" + (listFilter ?? "all");

  // ── Cached first-page fetch ────────────────────────────────────
  type LeadsPage1 = { leads: MobileLeadRecordDto[]; total: number; page: number };
  const page1Fetcher = useCallback(async (): Promise<LeadsPage1 | MobileApiFailure> => {
    const res = await fetchMobileLeads({ page: 1, pageSize: PAGE_SIZE, filter: listFilter });
    if (res.ok === false) return res;
    let rows = res.leads;
    if (!listFilter && rows.length === 0 && res.total === 0) {
      rows = [getDemoLeadRecord()];
    }
    return { leads: rows, total: res.total, page: res.page };
  }, [listFilter]);

  const {
    data: cachedPage1,
    loading: cacheLoading,
    error: cacheError,
    refresh: cacheRefresh,
  } = useCachedFetch<LeadsPage1>(cacheKey, page1Fetcher);

  // Sync cached first page into local state
  const prevCacheKey = useRef(cacheKey);
  useEffect(() => {
    if (cachedPage1) {
      setLeads(cachedPage1.leads);
      setTotal(cachedPage1.total);
      setPage(cachedPage1.page);
      setError(null);
      setLoading(false);
    }
    if (cacheError) {
      setError(cacheError);
      if (prevCacheKey.current !== cacheKey) setLeads([]);
    }
    if (cacheLoading && !cachedPage1) {
      setLoading(true);
    }
    prevCacheKey.current = cacheKey;
  }, [cachedPage1, cacheError, cacheLoading, cacheKey]);

  // ── Pagination (page 2+) — not cached ─────────────────────────
  const loadPage = useCallback(
    async (nextPage: number, mode: "append") => {
      setLoadingMore(true);
      const res = await fetchMobileLeads({
        page: nextPage,
        pageSize: PAGE_SIZE,
        filter: listFilter,
      });
      setLoadingMore(false);

      if (res.ok === false) {
        setError(res);
        return;
      }

      setError(null);
      setTotal(res.total);
      setLeads((prev) => [...prev, ...res.leads]);
      setPage(res.page);
    },
    [listFilter]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    cacheRefresh();
    setTimeout(() => setRefreshing(false), 600);
  }, [cacheRefresh]);

  const hasMore = leads.length < total;

  const onEndReached = useCallback(() => {
    if (loading || loadingMore || !hasMore || error) return;
    void loadPage(page + 1, "append" as const);
  }, [loadPage, loading, loadingMore, hasMore, page, error]);

  /**
   * Stable navigation handler passed to every row. Row memoization
   * only helps when `onPress` identity is stable — the previous
   * inline arrow function in `renderItem` invalidated the memo on
   * every parent render, negating the optimization entirely.
   */
  const handleRowPress = useCallback(
    (leadId: string | number) => {
      hapticRowTap();
      router.push({
        pathname: "/lead/[id]",
        params: { id: String(leadId) },
      });
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: MobileLeadRecordDto }) => (
      <LeadRow lead={item} onPress={() => handleRowPress(item.id)} />
    ),
    [handleRowPress]
  );

  const keyExtractor = useCallback(
    (l: MobileLeadRecordDto) => String(l.id),
    []
  );

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return leads;
    const s = search.toLowerCase();
    return leads.filter((l) => {
      const name = leadField(l, "name").toLowerCase();
      const phone = (l.display_phone || leadField(l, "phone")).toLowerCase();
      const addr = leadField(l, "property_address").toLowerCase();
      return name.includes(s) || phone.includes(s) || addr.includes(s);
    });
  }, [leads, search]);

  const listEmpty = useMemo(() => {
    if (error) return null;
    if (search.trim()) {
      return (
        <EmptyState
          title={t("empty.no_matches_title")}
          subtitle={t("empty.no_matches_sub")}
        />
      );
    }
    return (
      <EmptyState
        title={t("empty.no_leads_title")}
        subtitle={t("empty.no_leads_sub")}
      />
    );
  }, [error, search, t]);

  /*
   * First-load state: show a stack of skeleton rows inside the
   * same list container so the search bar and filter chips stay
   * stable (no layout shift when real data arrives). Previously
   * this routed to a full-screen `ScreenLoading` spinner, which
   * made the screen feel like it was "booting" on every tab
   * switch on slow networks.
   */
  if (loading && leads.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.searchWrap}>
          <TextInput
            editable={false}
            placeholder={t("search_placeholder")}
            placeholderTextColor={tokens.textSubtle}
            style={styles.searchInput}
          />
        </View>
        <View style={styles.chipRow}>
          {FILTER_KEYS.map((key) => (
            <View
              key={key}
              style={[styles.chip, activeFilter === key && styles.chipActive]}
            >
              <Text
                style={[styles.chipText, activeFilter === key && styles.chipTextActive]}
              >
                {t(`filters.${key}`)}
              </Text>
            </View>
          ))}
        </View>
        <SkeletonList count={6} renderRow={() => <LeadRowSkeleton />} />
      </View>
    );
  }

  return (
    <FadeIn style={styles.container}>
      {error ? (
        <ErrorBanner
          title={t("errors.load_failed")}
          message={error.message}
          onRetry={cacheRefresh}
        />
      ) : null}

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t("search_placeholder")}
          placeholderTextColor={tokens.textSubtle}
          style={styles.searchInput}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Filter chips */}
      <View style={styles.chipRow}>
        {FILTER_KEYS.map((key) => (
          <Pressable
            key={key}
            onPress={() => setActiveFilter(key)}
            style={[styles.chip, activeFilter === key && styles.chipActive]}
          >
            <Text style={[styles.chipText, activeFilter === key && styles.chipTextActive]}>
              {t(`filters.${key}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={keyExtractor}
        refreshControl={<BrandRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        /*
         * Performance knobs for long lead lists. Defaults are fine
         * for ~50 rows but the inbox can grow to hundreds; these
         * trade a small amount of scroll-in latency for much
         * lower memory + fewer layout passes while scrolling.
         */
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
        ListFooterComponent={
          loadingMore ? (
            // Skeleton row during pagination — matches the height
            // of a real row so the end-of-list spring bounce
            // doesn't jump when the real data arrives.
            <LeadRowSkeleton />
          ) : null
        }
        ListEmptyComponent={listEmpty}
        ListHeaderComponent={
          <>
            {showBookingHint ? (
              <View style={styles.hintBanner}>
                <Text style={styles.hintText}>{t("booking_hint")}</Text>
              </View>
            ) : null}
            {total > 0 ? (
              <Text style={styles.count}>
                {filtered.length === total
                  ? t("count", { count: total })
                  : t("count_partial", {
                      count: filtered.length,
                      total,
                    })}
              </Text>
            ) : leads.length === 1 && String(leads[0].id) === DEMO_LEAD_ID ? (
              <Text style={styles.count}>{t("demo_label")}</Text>
            ) : null}
          </>
        }
        renderItem={renderItem}
        contentContainerStyle={filtered.length === 0 ? styles.emptyList : styles.listPad}
      />
    </FadeIn>
  );
}

/**
 * Style factory — rebuilt inside each component via `useMemo`
 * whenever `tokens` changes (OS dark-mode toggle, accessibility
 * theme swap). Previously this StyleSheet was module-scoped and
 * captured the light palette at import time, which meant the
 * leads screen stayed stuck in light mode even after the rest of
 * the app learned to honor `useColorScheme()`.
 */
const createStyles = (theme: ThemeTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  searchWrap: { paddingHorizontal: 12, paddingTop: 8 },
  searchInput: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.text,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  chipActive: {
    backgroundColor: theme.chipActiveBg,
    borderColor: theme.chipActiveBorder,
  },
  chipText: { fontSize: 12, fontWeight: "700", color: theme.text },
  chipTextActive: { color: theme.chipActiveText },
  hintBanner: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    borderRadius: 10,
    backgroundColor: theme.infoBg,
    borderWidth: 1,
    borderColor: theme.infoBorder,
  },
  hintText: { fontSize: 13, color: theme.infoTextDeep, lineHeight: 18 },
  count: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 12, color: theme.textMuted },
  listPad: { paddingVertical: 4 },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  footerLoad: { paddingVertical: 16 },
  row: {
    marginHorizontal: 12,
    marginVertical: 5,
    padding: 14,
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  rowHot: {
    borderColor: theme.hotBorder,
    backgroundColor: theme.hotBg,
    borderLeftWidth: 4,
    borderLeftColor: theme.hotBorder,
  },
  rowPressed: { opacity: 0.92 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  name: { flex: 1, fontSize: 16, fontWeight: "600", color: theme.text },
  hotPill: {
    backgroundColor: theme.hotPillBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.hotBorder,
  },
  hotText: { fontSize: 10, fontWeight: "800", color: theme.hotPillText },
  sub: { fontSize: 14, color: theme.textSecondary, marginTop: 2 },
  address: { fontSize: 13, color: theme.textMuted, marginTop: 4, lineHeight: 18 },
  footer: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 8, flexWrap: "wrap" },
  stagePill: {
    backgroundColor: theme.infoBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.infoBorder,
  },
  stageText: { fontSize: 11, fontWeight: "600", color: theme.infoText },
  score: { fontSize: 11, color: theme.accent, fontWeight: "600" },
});

