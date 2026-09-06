import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  generateMobileCma,
  type MobileCmaComp,
  type MobileCmaReport,
} from "../lib/leadsmartMobileApi";
import {
  hapticButtonPress,
  hapticError,
  hapticSuccess,
} from "../lib/haptics";
import { useThemeTokens } from "../lib/useThemeTokens";
import type { ThemeTokens } from "../lib/theme";

/**
 * Mobile CMA generator. Single screen — type an address (plus
 * optional sqft + condition), tap Generate, see the report:
 *
 *   - Subject card (address, beds/baths/sqft, condition, year built)
 *   - Estimated value pill (low — mid — high)
 *   - Three pricing strategies (aggressive / market / premium) with
 *     days-on-market predictions
 *   - List of comparable sold properties with price, sqft, $/sqft,
 *     distance, sold-date
 *   - Plain-English summary suitable for forwarding
 *
 * Reuses the existing /api/mobile/cma endpoint which mirrors the
 * web smart-CMA computation. CMA reports aren't persisted (the web
 * flow doesn't save them either) so this screen is "viewer" in the
 * sense of "look up a property's value", not "open a saved report".
 *
 * Each generation counts against the agent's daily CMA quota — the
 * 402 response surfaces inline so they know to upgrade or wait.
 */
export default function CmaScreen() {
  const { t } = useTranslation("mobile_misc_screens");
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const [address, setAddress] = useState("");
  const [sqft, setSqft] = useState("");
  const [condition, setCondition] = useState<string>("Average");
  const [report, setReport] = useState<MobileCmaReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onGenerate = useCallback(async () => {
    const trimmed = address.trim();
    if (!trimmed) {
      setError("Address is required.");
      return;
    }
    hapticButtonPress();
    setBusy(true);
    setError(null);

    const sqftNum = sqft.trim()
      ? Number(sqft.replace(/[^0-9.]/g, ""))
      : null;
    if (sqftNum !== null && (!Number.isFinite(sqftNum) || sqftNum <= 0)) {
      setBusy(false);
      setError("Sqft must be a positive number.");
      return;
    }

    const res = await generateMobileCma({
      address: trimmed,
      sqft: sqftNum,
      condition: condition || null,
    });
    setBusy(false);
    if (res.ok === false) {
      hapticError();
      setError(res.message);
      setReport(null);
      return;
    }
    hapticSuccess();
    setReport(res);
  }, [address, sqft, condition]);

  return (
    <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <Stack.Screen
        options={{
          title: "CMA",
          headerBackTitle: "Back",
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Input form */}
        <View style={styles.formCard}>
          <Text style={styles.sectionHeading}>{t("cma.lookUpAProperty")}</Text>
          <Text style={styles.label}>Address *</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="123 Main St, Austin TX 78701"
            placeholderTextColor={tokens.textSubtle}
            autoCapitalize="words"
            style={styles.input}
          />
          <View style={styles.row}>
            <View style={styles.flex1}>
              <Text style={styles.label}>{t("cma.sqftOptional")}</Text>
              <TextInput
                value={sqft}
                onChangeText={setSqft}
                placeholder="1500"
                placeholderTextColor={tokens.textSubtle}
                keyboardType="numeric"
                inputMode="numeric"
                style={styles.input}
              />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.label}>{t("cma.condition")}</Text>
              <View style={styles.conditionRow}>
                {["Below", "Average", "Above"].map((c) => {
                  const active = condition === c;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => setCondition(c)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        styles.conditionBtn,
                        active && styles.conditionBtnActive,
                        pressed && styles.conditionBtnPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.conditionText,
                          active && styles.conditionTextActive,
                        ]}
                      >
                        {c}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
          {error ? <Text style={styles.inlineError}>{error}</Text> : null}
          <Pressable
            onPress={() => void onGenerate()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t("cma.generateCma")}
            style={({ pressed }) => [
              styles.generateBtn,
              pressed && styles.generateBtnPressed,
              busy && styles.generateBtnDisabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={tokens.textOnAccent} />
            ) : (
              <>
                <Ionicons name="analytics" size={16} color={tokens.textOnAccent} />
                <Text style={styles.generateBtnText}>{t("cma.generateCma")}</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Report */}
        {report ? <ReportView report={report} styles={styles} tokens={tokens} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ReportView({
  report,
  styles,
  tokens,
}: {
  report: MobileCmaReport;
  styles: ReturnType<typeof createStyles>;
  tokens: ThemeTokens;
}) {
  const { t } = useTranslation("mobile_misc_screens");
  return (
    <View style={styles.reportCard}>
      {/* Subject */}
      <Text style={styles.subjectAddress}>{report.subject.address}</Text>
      <Text style={styles.subjectMeta}>
        {report.subject.beds} bd · {report.subject.baths} ba ·{" "}
        {Math.round(report.subject.sqft).toLocaleString()} sqft
        {report.subject.yearBuilt ? ` · ${report.subject.yearBuilt}` : ""}
        {report.subject.propertyType ? ` · ${report.subject.propertyType}` : ""}
      </Text>

      {/* Estimated value range */}
      <View style={styles.valueBlock}>
        <Text style={styles.valueLabel}>{t("cma.estimatedValue")}</Text>
        <Text style={styles.valueAmount}>{formatMoney(report.estimatedValue)}</Text>
        <View style={styles.rangeBar}>
          <Text style={styles.rangeLow}>{formatMoney(report.low)}</Text>
          <View style={styles.rangeTrack}>
            <View style={styles.rangeMid} />
          </View>
          <Text style={styles.rangeHigh}>{formatMoney(report.high)}</Text>
        </View>
        <Text style={styles.ppsfLine}>
          Avg ${report.avgPricePerSqft.toFixed(0)}/sqft across{" "}
          {report.comps.length} comp{report.comps.length === 1 ? "" : "s"}
        </Text>
      </View>

      {/* Strategies */}
      <View style={styles.divider} />
      <Text style={styles.sectionHeading}>{t("cma.pricingStrategies")}</Text>
      <View style={styles.strategyRow}>
        <StrategyCard
          label={t("cma.aggressive")}
          price={report.strategies.aggressive}
          dom={report.strategies.daysOnMarket.aggressive}
          tone="amber"
          styles={styles}
          tokens={tokens}
        />
        <StrategyCard
          label={t("cma.market")}
          price={report.strategies.market}
          dom={report.strategies.daysOnMarket.market}
          tone="blue"
          styles={styles}
          tokens={tokens}
        />
        <StrategyCard
          label={t("cma.premium")}
          price={report.strategies.premium}
          dom={report.strategies.daysOnMarket.premium}
          tone="green"
          styles={styles}
          tokens={tokens}
        />
      </View>

      {/* Comps */}
      <View style={styles.divider} />
      <Text style={styles.sectionHeading}>
        Comparable sales ({report.comps.length})
      </Text>
      {report.comps.length === 0 ? (
        <Text style={styles.muted}>
          {t("cma.noComparableSalesFoundIn")}
        </Text>
      ) : (
        report.comps.map((c, idx) => (
          <CompRow key={`${idx}-${c.address}`} comp={c} styles={styles} />
        ))
      )}

      {/* Summary */}
      {report.summary ? (
        <>
          <View style={styles.divider} />
          <Text style={styles.sectionHeading}>{t("cma.summary")}</Text>
          <Text style={styles.summaryText}>{report.summary}</Text>
        </>
      ) : null}
    </View>
  );
}

function StrategyCard({
  label,
  price,
  dom,
  tone,
  styles,
  tokens,
}: {
  label: string;
  price: number;
  dom: number;
  tone: "blue" | "green" | "amber";
  styles: ReturnType<typeof createStyles>;
  tokens: ThemeTokens;
}) {
  const palette = {
    blue: { bg: tokens.infoBg, text: tokens.infoText },
    green: { bg: tokens.successBg, text: tokens.successText },
    amber: { bg: tokens.warningBg, text: tokens.warning },
  }[tone];
  return (
    <View style={[styles.strategyCard, { backgroundColor: palette.bg }]}>
      <Text style={[styles.strategyLabel, { color: palette.text }]}>{label}</Text>
      <Text style={[styles.strategyPrice, { color: palette.text }]}>
        {formatMoney(price)}
      </Text>
      <Text style={[styles.strategyDom, { color: palette.text }]}>
        ~{dom} days
      </Text>
    </View>
  );
}

function CompRow({
  comp,
  styles,
}: {
  comp: MobileCmaComp;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.compRow}>
      <View style={styles.compHeader}>
        <Text style={styles.compAddress} numberOfLines={1}>
          {comp.address}
        </Text>
        <Text style={styles.compPrice}>{formatMoney(comp.price)}</Text>
      </View>
      <Text style={styles.compMeta} numberOfLines={1}>
        {comp.beds ?? "—"} bd · {comp.baths ?? "—"} ba ·{" "}
        {Math.round(comp.sqft).toLocaleString()} sqft · ${comp.pricePerSqft.toFixed(0)}/sqft
      </Text>
      <Text style={styles.compMetaDim} numberOfLines={1}>
        {comp.distanceMiles.toFixed(1)} mi · sold {comp.soldDate}
      </Text>
    </View>
  );
}

function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

function createStyles(t: ThemeTokens) {
  return StyleSheet.create({
    kav: { flex: 1, backgroundColor: t.bg },
    scrollContent: { padding: 16, paddingBottom: 48 },

    formCard: {
      backgroundColor: t.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: t.border,
      marginBottom: 16,
    },

    sectionHeading: {
      fontSize: 12,
      fontWeight: "800",
      color: t.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 10,
    },

    label: {
      marginTop: 12,
      marginBottom: 6,
      fontSize: 13,
      fontWeight: "600",
      color: t.text,
    },

    input: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
      fontSize: 14,
      color: t.text,
    },

    row: { flexDirection: "row", gap: 8 },
    flex1: { flex: 1 },

    conditionRow: { flexDirection: "row", gap: 4, marginTop: 1 },
    conditionBtn: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
      alignItems: "center",
    },
    conditionBtnActive: { borderColor: t.accent, backgroundColor: t.accentPressed },
    conditionBtnPressed: { opacity: 0.85 },
    conditionText: { fontSize: 12, fontWeight: "600", color: t.text },
    conditionTextActive: { color: t.accent },

    inlineError: { marginTop: 12, fontSize: 13, color: t.dangerTitle },

    generateBtn: {
      marginTop: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: t.accent,
      minHeight: 48,
    },
    generateBtnPressed: { opacity: 0.85 },
    generateBtnDisabled: { opacity: 0.5 },
    generateBtnText: { fontSize: 15, fontWeight: "700", color: t.textOnAccent },

    reportCard: {
      backgroundColor: t.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: t.border,
    },
    subjectAddress: { fontSize: 18, fontWeight: "700", color: t.text },
    subjectMeta: { marginTop: 4, fontSize: 13, color: t.textMuted },

    valueBlock: { marginTop: 16, alignItems: "center" },
    valueLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: t.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1.2,
    },
    valueAmount: {
      marginTop: 4,
      fontSize: 32,
      fontWeight: "800",
      color: t.text,
      fontVariant: ["tabular-nums"],
    },
    rangeBar: {
      marginTop: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      width: "100%",
    },
    rangeLow: { fontSize: 11, color: t.textMuted, fontVariant: ["tabular-nums"] },
    rangeHigh: { fontSize: 11, color: t.textMuted, fontVariant: ["tabular-nums"] },
    rangeTrack: {
      flex: 1,
      height: 4,
      borderRadius: 999,
      backgroundColor: t.surfaceMuted,
      overflow: "hidden",
    },
    rangeMid: {
      width: "60%",
      height: "100%",
      marginLeft: "20%",
      backgroundColor: t.accent,
      borderRadius: 999,
    },
    ppsfLine: { marginTop: 8, fontSize: 12, color: t.textSubtle },

    divider: { height: 1, backgroundColor: t.border, marginVertical: 20 },

    strategyRow: { flexDirection: "row", gap: 8 },
    strategyCard: {
      flex: 1,
      borderRadius: 10,
      padding: 12,
      alignItems: "center",
    },
    strategyLabel: {
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    strategyPrice: {
      marginTop: 4,
      fontSize: 14,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },
    strategyDom: { marginTop: 4, fontSize: 10, opacity: 0.85 },

    muted: { fontSize: 13, color: t.textMuted, lineHeight: 18 },

    compRow: {
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
    },
    compHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      gap: 8,
    },
    compAddress: { flex: 1, fontSize: 13, fontWeight: "600", color: t.text },
    compPrice: { fontSize: 13, fontWeight: "700", color: t.text, fontVariant: ["tabular-nums"] },
    compMeta: { marginTop: 2, fontSize: 11, color: t.textMuted, fontVariant: ["tabular-nums"] },
    compMetaDim: { marginTop: 1, fontSize: 11, color: t.textSubtle, fontVariant: ["tabular-nums"] },

    summaryText: { fontSize: 13, color: t.textMuted, lineHeight: 19 },
  });
}
