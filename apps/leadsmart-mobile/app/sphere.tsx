import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  fetchMobileLikelyBuyers,
  fetchMobileLikelySellers,
  type MobileSphereRow,
} from "../lib/closeBossMobileApi";
import { hapticButtonPress } from "../lib/haptics";
import { useThemeTokens } from "../lib/useThemeTokens";
import type { ThemeTokens } from "../lib/theme";

/**
 * Sphere — mobile answer to "who do I call today?"
 *
 * Two sections, both ranked by AI prediction score:
 *   1. Likely buyers — contacts in past_client / sphere whose
 *      signals suggest they may be entering the buy window.
 *   2. Likely sellers — same cohort, different scoring factors
 *      (AVM appreciation, listing-page visits, time-since-close).
 *
 * Tapping a row routes to the lead detail screen. Tapping the
 * phone icon fires a tel:/sms: link directly — agent stays in the
 * sphere context for batch-calling.
 *
 * Mode switcher at the top: Buyers / Sellers. Defaults to Buyers
 * because that's the more time-sensitive signal (sellers tend to
 * have months of runway; buyers may close in weeks).
 */

type Mode = "buyers" | "sellers";

export default function SphereScreen() {
  const tokens = useThemeTokens();
  const router = useRouter();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("sphere_screen");

  const [mode, setMode] = useState<Mode>("buyers");
  const [buyers, setBuyers] = useState<MobileSphereRow[] | null>(null);
  const [sellers, setSellers] = useState<MobileSphereRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      setError(null);
      // Fetch both in parallel — small payloads (10 each) so we
      // can switch modes instantly without a second round-trip.
      const [bRes, sRes] = await Promise.all([
        fetchMobileLikelyBuyers({ limit: 25 }),
        fetchMobileLikelySellers({ limit: 25 }),
      ]);
      if (refresh) setRefreshing(false);
      if (bRes.ok === false && sRes.ok === false) {
        setError(bRes.message || sRes.message);
        setBuyers([]);
        setSellers([]);
        return;
      }
      setBuyers(bRes.ok ? bRes.buyers : []);
      setSellers(sRes.ok ? sRes.sellers : []);
    },
    [],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const rows = mode === "buyers" ? buyers : sellers;
  const isLoading = rows === null;

  const onOpenLead = useCallback(
    (contactId: string) => {
      hapticButtonPress();
      router.push({ pathname: "/lead/[id]", params: { id: contactId } });
    },
    [router],
  );

  const onCall = useCallback((phone: string) => {
    hapticButtonPress();
    const digits = phone.replace(/[^\d+]/g, "");
    if (!digits) return;
    void Linking.openURL(`tel:${digits}`);
  }, []);

  const onText = useCallback((phone: string) => {
    hapticButtonPress();
    const digits = phone.replace(/[^\d+]/g, "");
    if (!digits) return;
    void Linking.openURL(`sms:${digits}`);
  }, []);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load(true)}
          tintColor={tokens.accent}
        />
      }
    >
      <Stack.Screen options={{ title: t("title"), headerBackTitle: t("back") }} />

      <Text style={styles.intro}>{t("intro")}</Text>

      <View style={styles.modeRow}>
        {(["buyers", "sellers"] as Mode[]).map((m) => {
          const active = mode === m;
          const count = m === "buyers" ? buyers?.length ?? 0 : sellers?.length ?? 0;
          return (
            <Pressable
              key={m}
              onPress={() => {
                setMode(m);
                hapticButtonPress();
              }}
              style={[styles.modeTab, active && styles.modeTabActive]}
            >
              <Text
                style={[
                  styles.modeTabText,
                  active && styles.modeTabTextActive,
                ]}
              >
                {t(`modes.${m}`)}
                {count > 0 ? ` · ${count}` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={tokens.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator color={tokens.accent} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyTitle}>
            {mode === "buyers" ? t("empty.buyers_title") : t("empty.sellers_title")}
          </Text>
          <Text style={styles.emptyBody}>{t("empty.body")}</Text>
        </View>
      ) : (
        rows.map((row) => (
          <SphereRowCard
            key={row.contactId}
            row={row}
            mode={mode}
            styles={styles}
            onOpen={() => onOpenLead(row.contactId)}
            onCall={row.phone ? () => onCall(row.phone!) : undefined}
            onText={row.phone ? () => onText(row.phone!) : undefined}
          />
        ))
      )}
    </ScrollView>
  );
}

function SphereRowCard({
  row,
  mode,
  styles,
  onOpen,
  onCall,
  onText,
}: {
  row: MobileSphereRow;
  mode: Mode;
  styles: ReturnType<typeof createStyles>;
  onOpen: () => void;
  onCall?: () => void;
  onText?: () => void;
}) {
  const { t, i18n } = useTranslation("sphere_screen");
  const bandColor = (() => {
    if (row.label === "high") return { bg: "#FEE2E2", fg: "#B91C1C" };
    if (row.label === "medium") return { bg: "#FEF3C7", fg: "#92400E" };
    return { bg: "#E5E7EB", fg: "#374151" };
  })();
  const score = Math.round(row.score);
  const bandLabel = t(`row.band.${row.label}`, { defaultValue: row.label.toUpperCase() });

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.cardName} numberOfLines={1}>
            {row.fullName}
          </Text>
          <View
            style={[styles.bandPill, { backgroundColor: bandColor.bg }]}
          >
            <Text style={[styles.bandPillText, { color: bandColor.fg }]}>
              {bandLabel} · {score}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
      </View>

      {row.topReason ? (
        <Text style={styles.cardReason} numberOfLines={2}>
          {mode === "buyers" ? "💡 " : "📈 "}
          {row.topReason}
        </Text>
      ) : null}

      {row.closingAddress ? (
        <Text style={styles.cardClosing} numberOfLines={1}>
          {row.closingAddress}
          {row.closingDate
            ? ` · ${t("row.sold_on", { date: new Date(row.closingDate).toLocaleDateString(i18n.language) })}`
            : ""}
        </Text>
      ) : null}

      {(onCall || onText || row.email) && (
        <View style={styles.cardActions}>
          {onCall && (
            <Pressable onPress={onCall} style={styles.cardActionBtn}>
              <Ionicons name="call-outline" size={14} color="#059669" />
              <Text style={[styles.cardActionText, { color: "#059669" }]}>
                {t("row.actions.call")}
              </Text>
            </Pressable>
          )}
          {onText && (
            <Pressable onPress={onText} style={styles.cardActionBtn}>
              <Ionicons
                name="chatbubble-outline"
                size={14}
                color="#2563EB"
              />
              <Text style={[styles.cardActionText, { color: "#2563EB" }]}>
                {t("row.actions.text")}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </Pressable>
  );
}

function createStyles(t: ThemeTokens) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: t.bg },
    scrollContent: { padding: 16, paddingBottom: 48 },
    intro: {
      fontSize: 13,
      lineHeight: 18,
      color: t.textSubtle,
      marginBottom: 12,
    },
    modeRow: {
      flexDirection: "row",
      gap: 6,
      marginBottom: 12,
    },
    modeTab: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
      alignItems: "center",
    },
    modeTabActive: {
      backgroundColor: t.accentLight,
      borderColor: t.accent,
    },
    modeTabText: {
      fontSize: 13,
      fontWeight: "700",
      color: t.text,
    },
    modeTabTextActive: {
      color: t.accent,
    },
    errorBox: {
      flexDirection: "row",
      gap: 8,
      padding: 10,
      borderRadius: 8,
      backgroundColor: t.dangerBg,
      borderWidth: 1,
      borderColor: t.dangerBorder,
      marginBottom: 12,
    },
    errorText: { flex: 1, fontSize: 13, color: t.danger },
    loadingBlock: { paddingVertical: 48, alignItems: "center" },
    emptyBlock: {
      padding: 24,
      borderRadius: 14,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderStyle: "dashed",
      alignItems: "center",
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: t.text,
      textAlign: "center",
    },
    emptyBody: {
      marginTop: 6,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
      color: t.textSubtle,
    },
    card: {
      backgroundColor: t.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      padding: 12,
      marginBottom: 10,
    },
    cardPressed: { opacity: 0.92 },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: 6,
    },
    cardHeaderLeft: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minWidth: 0,
    },
    cardName: {
      flex: 1,
      fontSize: 15,
      fontWeight: "700",
      color: t.text,
    },
    bandPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
    },
    bandPillText: {
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    cardReason: {
      fontSize: 13,
      lineHeight: 18,
      color: t.text,
    },
    cardClosing: {
      marginTop: 4,
      fontSize: 11,
      color: t.textSubtle,
    },
    cardActions: {
      marginTop: 10,
      flexDirection: "row",
      gap: 14,
    },
    cardActionBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 4,
    },
    cardActionText: {
      fontSize: 12,
      fontWeight: "700",
    },
  });
}
