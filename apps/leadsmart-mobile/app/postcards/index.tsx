import { memo, useCallback, useMemo } from "react";
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
  fetchMobilePostcards,
  type MobilePostcardSend,
  type MobilePostcardTemplateKey,
} from "../../lib/leadsmartMobileApi";
import { useCachedFetch } from "../../lib/offline/useCachedFetch";
import { hapticButtonPress, hapticRowTap } from "../../lib/haptics";
import { useThemeTokens } from "../../lib/useThemeTokens";
import type { ThemeTokens } from "../../lib/theme";

const TEMPLATE_EMOJI: Record<MobilePostcardTemplateKey, string> = {
  birthday: "🎉",
  anniversary: "🏡",
  holiday_seasonal: "🍂",
  thinking_of_you: "💌",
};

/** i18n keys under `postcards.templates.*`. */
const TEMPLATE_LABEL: Record<MobilePostcardTemplateKey, string> = {
  birthday: "templates.birthday",
  anniversary: "templates.anniversary",
  holiday_seasonal: "templates.holiday_seasonal",
  thinking_of_you: "templates.thinking_of_you",
};

/**
 * Postcards list — agent's recent sphere outreach. Shows template
 * + recipient + channel badges + open status. Tap a row to view its
 * public URL (deep link via the slug — already handled by the
 * existing /postcard/[slug] page on web).
 *
 * "+ New" header button drops the agent into the composer flow.
 */
export default function PostcardsListScreen() {
  const router = useRouter();
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("postcards");

  const { data, loading, error, stale, refresh } = useCachedFetch(
    "postcards:list",
    () => fetchMobilePostcards({ limit: 100 }),
  );

  const postcards = useMemo<MobilePostcardSend[]>(() => {
    if (!data) return [];
    return data.postcards;
  }, [data]);

  const onNewPostcard = useCallback(() => {
    hapticButtonPress();
    // expo-router's typed routes don't yet know about `/postcards`
    // until the route map regenerates. Cast keeps TS happy without
    // hiding real path errors at runtime.
    router.push("/postcards/new" as never);
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: MobilePostcardSend }) => (
      <PostcardRow row={item} />
    ),
    [],
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t("list.title"),
          headerBackTitle: t("list.back"),
        }}
      />

      <View style={styles.header}>
        <Text style={styles.headerSub}>{t("list.subtitle")}</Text>
        <Pressable
          onPress={onNewPostcard}
          accessibilityRole="button"
          accessibilityLabel={t("list.new_a11y")}
          style={({ pressed }) => [styles.newBtn, pressed && styles.newBtnPressed]}
        >
          <Ionicons name="add" size={16} color={tokens.textOnAccent} />
          <Text style={styles.newBtnText}>{t("list.new")}</Text>
        </Pressable>
      </View>

      {error && data == null ? (
        <View style={styles.banner}>
          <ErrorBanner
            title={t("list.load_failed")}
            message={error.message}
            onRetry={refresh}
          />
        </View>
      ) : null}

      {loading && postcards.length === 0 ? (
        <SkeletonList count={6} renderRow={() => <LeadRowSkeleton />} />
      ) : postcards.length === 0 ? (
        <EmptyState
          title={t("list.empty_title")}
          subtitle={t("list.empty_sub")}
        />
      ) : (
        <FadeIn>
          <FlatList
            data={postcards}
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

const PostcardRow = memo(function PostcardRow({ row }: { row: MobilePostcardSend }) {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("postcards");

  const emoji = TEMPLATE_EMOJI[row.template_key] ?? "💌";
  const labelKey = TEMPLATE_LABEL[row.template_key];
  const label = labelKey ? t(labelKey) : row.template_key;
  const sentChannels = [
    row.email_sent_at ? t("channels.email") : null,
    row.sms_sent_at ? t("channels.sms") : null,
    row.wechat_sent_at ? t("channels.wechat") : null,
  ].filter(Boolean) as string[];
  const failedChannels = [
    row.email_error ? t("channels.email") : null,
    row.sms_error ? t("channels.sms") : null,
    row.wechat_error ? t("channels.wechat") : null,
  ].filter(Boolean) as string[];
  const opened = row.opened_at != null;

  const onTap = useCallback(() => {
    hapticRowTap();
    // No detail screen yet for MVP; row tap is a no-op besides
    // the haptic. Open count + delivery state shown inline.
  }, []);

  return (
    <Pressable
      onPress={onTap}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={t("list.row_a11y", { template: label, name: row.recipient_name })}
    >
      <View style={styles.rowHeader}>
        <View style={styles.emojiBadge}>
          <Text style={styles.emojiText}>{emoji}</Text>
        </View>
        <View style={styles.rowMain}>
          <Text style={styles.rowName} numberOfLines={1}>
            {row.recipient_name}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {label} · {formatShortDate(row.created_at)}
          </Text>
        </View>
        {opened ? (
          <View style={styles.openedPill}>
            <Ionicons name="eye-outline" size={11} color={tokens.successText} />
            <Text style={styles.openedPillText}>
              {row.open_count > 1 ? `${row.open_count}×` : t("list.opened")}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.rowChannels}>
        {sentChannels.map((c) => (
          <View key={`sent-${c}`} style={[styles.chip, styles.chipSent]}>
            <Text style={styles.chipText}>{c} ✓</Text>
          </View>
        ))}
        {failedChannels.map((c) => (
          <View key={`failed-${c}`} style={[styles.chip, styles.chipFailed]}>
            <Text style={styles.chipFailedText}>{c} ✗</Text>
          </View>
        ))}
        {sentChannels.length === 0 && failedChannels.length === 0 ? (
          <Text style={styles.pendingText}>{t("list.pending")}</Text>
        ) : null}
      </View>
      {row.personal_message ? (
        <Text style={styles.rowMessage} numberOfLines={2}>
          "{row.personal_message}"
        </Text>
      ) : null}
    </Pressable>
  );
});

function formatShortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function createStyles(t: ThemeTokens) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    header: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
      backgroundColor: t.surface,
      gap: 10,
    },
    headerSub: { fontSize: 13, color: t.textMuted, lineHeight: 18 },
    newBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: t.accent,
      paddingVertical: 10,
      borderRadius: 12,
      minHeight: 44,
    },
    newBtnPressed: { opacity: 0.85 },
    newBtnText: { fontSize: 14, fontWeight: "700", color: t.textOnAccent },
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
    rowHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
    emojiBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: t.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    emojiText: { fontSize: 18 },
    rowMain: { flex: 1 },
    rowName: { fontSize: 15, fontWeight: "600", color: t.text },
    rowSub: { marginTop: 2, fontSize: 12, color: t.textMuted },
    openedPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: t.successBg,
    },
    openedPillText: { fontSize: 10, fontWeight: "600", color: t.successText },
    rowChannels: {
      marginTop: 8,
      marginLeft: 46,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    chip: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    chipSent: { backgroundColor: t.infoBg },
    chipFailed: { backgroundColor: t.dangerBg },
    chipText: { fontSize: 10, fontWeight: "600", color: t.infoText },
    chipFailedText: { fontSize: 10, fontWeight: "600", color: t.dangerTitle },
    pendingText: { fontSize: 11, color: t.textSubtle, fontStyle: "italic" },
    rowMessage: {
      marginTop: 6,
      marginLeft: 46,
      fontSize: 12,
      color: t.textMuted,
      fontStyle: "italic",
      lineHeight: 16,
    },
  });
}
