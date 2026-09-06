import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ErrorBanner } from "../components/ErrorBanner";
import { BrandRefreshControl } from "../components/BrandRefreshControl";
import { Skeleton } from "../components/Skeleton";
import { FadeIn } from "../components/Reveal";
import {
  fetchMobileCoaching,
  type MobileCoachingProgram,
  type MobileCoachingProgramStatus,
} from "../lib/leadsmartMobileApi";
import { useCachedFetch } from "../lib/offline/useCachedFetch";
import { hapticButtonPress } from "../lib/haptics";
import { getLeadsmartApiBaseUrl } from "../lib/env";
import { useThemeTokens } from "../lib/useThemeTokens";
import type { ThemeTokens } from "../lib/theme";

/**
 * Mobile coaching screen. Surfaces the agent's enrollment in the
 * Producer Track / Top Producer Track programs — same data the web
 * CoachingProgramsCard renders on /dashboard. Read-only: enroll/
 * opt-out happens on the web settings panel, with a deep link from
 * the bottom of this screen.
 *
 * Status branches:
 *   - has eligible programs → render program cards with target
 *     stats + status pill + plan-aware copy
 *   - no eligible programs (Starter / no plan) → upgrade CTA
 *     pointing at /agent/pricing on web
 */
export default function CoachingScreen() {
  const { t } = useTranslation("mobile_misc_screens");
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const { data, loading, error, refresh } = useCachedFetch(
    "coaching:me",
    fetchMobileCoaching,
  );

  const programs = useMemo<MobileCoachingProgram[]>(() => {
    if (!data) return [];
    return data.programs.filter((p) => p.status !== "not_eligible");
  }, [data]);

  const onUpgrade = useCallback(() => {
    hapticButtonPress();
    const base = getLeadsmartApiBaseUrl();
    if (!base) return;
    void Linking.openURL(`${base}/agent/pricing`);
  }, []);

  const onManage = useCallback(() => {
    hapticButtonPress();
    const base = getLeadsmartApiBaseUrl();
    if (!base) return;
    void Linking.openURL(`${base}/dashboard/settings#coaching`);
  }, []);

  const initialDone = !loading || data !== null;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: "Coaching" }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<BrandRefreshControl refreshing={loading} onRefresh={refresh} />}
      >
        <View style={styles.heroBlock}>
          <Text style={styles.eyebrow}>{t("coaching.leadsmartAiCoaching")}</Text>
          <Text style={styles.title}>{t("coaching.producerDevelopmentBuiltIn")}</Text>
          <Text style={styles.subtitle}>
            {t("coaching.dailyPlansWeeklyPlaybooksMonthly")}
          </Text>
        </View>

        {error ? <ErrorBanner title={t("coaching.loadFailed")} message={error.message} onRetry={refresh} /> : null}

        {!initialDone ? (
          <View style={styles.skeletonList}>
            <Skeleton width="100%" height={140} borderRadius={12} />
            <Skeleton
              width="100%"
              height={140}
              borderRadius={12}
              style={{ marginTop: 12 }}
            />
          </View>
        ) : programs.length === 0 ? (
          <UpgradeCard styles={styles} tokens={tokens} onUpgrade={onUpgrade} />
        ) : (
          <View style={styles.programs}>
            {programs.map((p, i) => (
              <FadeIn key={p.slug} delay={i * 80}>
                <ProgramCard program={p} styles={styles} tokens={tokens} />
              </FadeIn>
            ))}
            <Pressable
              onPress={onManage}
              style={({ pressed }) => [styles.manageRow, pressed && styles.manageRowPressed]}
            >
              <Ionicons name="settings-outline" size={16} color={tokens.textMuted} />
              <Text style={styles.manageText}>{t("coaching.manageEnrollmentOnWeb")}</Text>
              <Ionicons name="open-outline" size={14} color={tokens.textMuted} />
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ProgramCard({
  program,
  styles,
  tokens,
}: {
  program: MobileCoachingProgram;
  styles: ReturnType<typeof createStyles>;
  tokens: ThemeTokens;
}) {
  const { t } = useTranslation("mobile_misc_screens");
  const isEnrolled = program.status === "enrolled";
  const isOptedOut = program.status === "opted_out";

  return (
    <View
      style={[
        styles.programCard,
        isEnrolled && styles.programCardEnrolled,
      ]}
    >
      <View style={styles.programHeader}>
        <Text style={styles.programName}>{program.meta.name}</Text>
        <StatusPill status={program.status} styles={styles} />
      </View>
      <Text style={styles.programTagline}>{program.meta.tagline}</Text>
      <View style={styles.statsRow}>
        <Stat
          label={t("coaching.annualDeals")}
          value={String(program.meta.annualTransactionTarget)}
          styles={styles}
          tone={isEnrolled ? "primary" : "neutral"}
        />
        <Stat
          label={t("coaching.leadClose")}
          value={`${program.meta.conversionRateTargetPct}%`}
          styles={styles}
          tone={isEnrolled ? "primary" : "neutral"}
        />
      </View>
      <Text style={styles.programFooter}>
        {isEnrolled
          ? "Your dashboard tasks + weekly playbooks are tracking toward this goal."
          : isOptedOut
            ? "You opted out earlier. Re-enroll any time from settings."
            : "Auto-enrollment runs on your next sign-in. Or enroll now from settings."}
      </Text>
    </View>
  );
}

function StatusPill({
  status,
  styles,
}: {
  status: MobileCoachingProgramStatus;
  styles: ReturnType<typeof createStyles>;
}) {
  const { t } = useTranslation("mobile_misc_screens");
  if (status === "enrolled") {
    return (
      <View style={[styles.pill, styles.pillEnrolled]}>
        <Text style={styles.pillEnrolledText}>{t("coaching.enrolled")}</Text>
      </View>
    );
  }
  if (status === "opted_out") {
    return (
      <View style={[styles.pill, styles.pillOptedOut]}>
        <Text style={styles.pillOptedOutText}>{t("coaching.optedOut")}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.pill, styles.pillEligible]}>
      <Text style={styles.pillEligibleText}>{t("coaching.eligible")}</Text>
    </View>
  );
}

function Stat({
  label,
  value,
  styles,
  tone,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
  tone: "primary" | "neutral";
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        style={[
          styles.statValue,
          tone === "primary" && styles.statValuePrimary,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function UpgradeCard({
  styles,
  tokens,
  onUpgrade,
}: {
  styles: ReturnType<typeof createStyles>;
  tokens: ThemeTokens;
  onUpgrade: () => void;
}) {
  const { t } = useTranslation("mobile_misc_screens");
  // iOS: App Store Guideline 3.1.3 forbids steering users to an external
  // purchase flow, so we show a neutral "not available" message with no
  // pricing/upgrade CTA and no link to the web. Android keeps the upgrade link.
  const neutral = Platform.OS === "ios";
  return (
    <View style={styles.upgradeCard}>
      <Ionicons name="ribbon-outline" size={28} color={tokens.infoText} />
      {neutral ? (
        <>
          <Text style={styles.upgradeTitle}>
            {t("coaching.coachingIsnTAvailableOn")}
          </Text>
          <Text style={styles.upgradeBody}>
            {t("coaching.coachingProgramsProducerTrackAnd")}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.upgradeTitle}>{t("coaching.coachingUnlocksOnPro")}</Text>
          <Text style={styles.upgradeBody}>
            {t("coaching.producerTrackAutoEnrollsOn")}
          </Text>
          <Pressable
            onPress={onUpgrade}
            style={({ pressed }) => [styles.upgradeBtn, pressed && styles.upgradeBtnPressed]}
          >
            <Text style={styles.upgradeBtnText}>{t("coaching.seePricing")}</Text>
            <Ionicons name="open-outline" size={14} color="#ffffff" />
          </Pressable>
        </>
      )}
    </View>
  );
}

function createStyles(t: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.background },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 32 },

    heroBlock: { marginBottom: 16 },
    eyebrow: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.5,
      color: t.infoText,
      marginBottom: 6,
    },
    title: {
      fontSize: 24,
      fontWeight: "700",
      color: t.text,
      marginBottom: 6,
      lineHeight: 30,
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: t.textMuted,
    },

    skeletonList: { marginTop: 8 },

    programs: { gap: 12 },

    programCard: {
      backgroundColor: t.card,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: t.border,
    },
    programCardEnrolled: {
      borderColor: t.infoText,
      backgroundColor: t.infoBg,
    },
    programHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 4,
    },
    programName: {
      fontSize: 16,
      fontWeight: "700",
      color: t.text,
    },
    programTagline: {
      fontSize: 13,
      lineHeight: 18,
      color: t.textMuted,
      marginBottom: 12,
    },
    statsRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 12,
    },
    stat: {
      flex: 1,
      backgroundColor: t.background,
      borderRadius: 8,
      padding: 10,
      borderWidth: 1,
      borderColor: t.borderSubtle,
    },
    statLabel: {
      fontSize: 10,
      fontWeight: "600",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: t.textMuted,
      marginBottom: 4,
    },
    statValue: {
      fontSize: 22,
      fontWeight: "700",
      color: t.text,
    },
    statValuePrimary: {
      color: t.infoText,
    },
    programFooter: {
      fontSize: 11,
      lineHeight: 16,
      color: t.textMuted,
    },

    pill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
    },
    pillEnrolled: { backgroundColor: t.infoBg },
    pillEnrolledText: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: t.infoText,
    },
    pillOptedOut: { backgroundColor: t.borderSubtle },
    pillOptedOutText: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: t.textMuted,
    },
    pillEligible: { backgroundColor: t.warningBg },
    pillEligibleText: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: t.warningText,
    },

    manageRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
      marginTop: 8,
    },
    manageRowPressed: { opacity: 0.6 },
    manageText: {
      fontSize: 13,
      color: t.textMuted,
      fontWeight: "500",
    },

    upgradeCard: {
      backgroundColor: t.infoBg,
      borderRadius: 12,
      padding: 20,
      borderWidth: 1,
      borderColor: t.infoText,
      alignItems: "flex-start",
    },
    upgradeTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: t.text,
      marginTop: 10,
      marginBottom: 6,
    },
    upgradeBody: {
      fontSize: 13,
      lineHeight: 20,
      color: t.textMuted,
      marginBottom: 14,
    },
    upgradeBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: t.brand,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
    },
    upgradeBtnPressed: { opacity: 0.85 },
    upgradeBtnText: {
      color: "#ffffff",
      fontSize: 14,
      fontWeight: "600",
    },
  });
}
