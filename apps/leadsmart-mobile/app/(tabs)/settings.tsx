import { SUPPORTED_LOCALES, type SupportedLocale } from "@leadsmart/i18n";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useLeadsmartSession } from "../../lib/session/LeadsmartSessionContext";
import {
  fetchMobileNotificationPreferences,
  patchMobileNotificationPreferences,
  saveUiLanguage,
} from "../../lib/leadsmartMobileApi";
import { getSupabaseAuthClient } from "../../lib/supabaseAuthClient";
import { setStoredLocale } from "../../lib/i18n";
import { useThemeTokens } from "../../lib/useThemeTokens";
import type { ThemeTokens } from "../../lib/theme";
import {
  hapticButtonPress,
  hapticError,
  hapticSelectionChange,
  hapticWarning,
} from "../../lib/haptics";

const LANGUAGE_LABEL_KEY: Record<SupportedLocale, string> = {
  en: "language.english",
  "zh-Hans": "language.chinese_simplified",
};

export default function SettingsScreen() {
  const router = useRouter();
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { signOut } = useLeadsmartSession();
  const { t, i18n } = useTranslation(["settings", "common"]);
  const [email, setEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [pushHot, setPushHot] = useState(true);
  const [pushMissed, setPushMissed] = useState(true);
  const [pushReminder, setPushReminder] = useState(true);
  const [pushMilestone, setPushMilestone] = useState(true);
  const currentLocale = (i18n.language as SupportedLocale) ?? "en";

  const onPickLocale = useCallback(async (loc: SupportedLocale) => {
    if (loc === currentLocale) return;
    hapticSelectionChange();
    try {
      await setStoredLocale(loc);
    } catch {
      hapticError();
      return;
    }
    // Durable copy for server work that has no request to read the language
    // from — the overnight Boss run, the instruction cron — so Max writes in
    // this language too. Best-effort: the app has already switched.
    void saveUiLanguage(loc);
  }, [currentLocale]);
  const [digestMin, setDigestMin] = useState(15);

  useEffect(() => {
    const sb = getSupabaseAuthClient();
    if (!sb) return;
    void sb.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null);
    });
  }, []);

  useEffect(() => {
    void (async () => {
      setPrefsLoading(true);
      const res = await fetchMobileNotificationPreferences();
      setPrefsLoading(false);
      if (res.ok === false) return;
      setPushHot(res.preferences.push_hot_lead);
      setPushMissed(res.preferences.push_missed_call);
      setPushReminder(res.preferences.push_reminder);
      setPushMilestone(res.preferences.push_post_milestone);
      setDigestMin(res.preferences.reminder_digest_minutes);
    })();
  }, []);

  const savePrefs = useCallback(
    async (patch: {
      push_hot_lead?: boolean;
      push_missed_call?: boolean;
      push_reminder?: boolean;
      push_post_milestone?: boolean;
      reminder_digest_minutes?: number;
    }) => {
      // Lightweight "selection changed" tick when toggling any
      // preference switch. Fires before the network round-trip
      // so the switch feels instant even on flaky connections.
      hapticSelectionChange();
      setPrefsSaving(true);
      const res = await patchMobileNotificationPreferences(patch);
      setPrefsSaving(false);
      if (res.ok === false) {
        hapticError();
        return;
      }
      setPushHot(res.preferences.push_hot_lead);
      setPushMissed(res.preferences.push_missed_call);
      setPushReminder(res.preferences.push_reminder);
      setPushMilestone(res.preferences.push_post_milestone);
      setDigestMin(res.preferences.reminder_digest_minutes);
    },
    []
  );

  const onSignOut = useCallback(async () => {
    // Warning haptic before the destructive path — same vocab
    // iOS uses for any "are you sure?" moment. The actual sign
    // out happens right after because the red button press is
    // already the confirmation.
    hapticWarning();
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/(onboarding)/login");
    } catch {
      hapticError();
    } finally {
      setSigningOut(false);
    }
  }, [router, signOut]);

  const version = Constants.expoConfig?.version ?? "—";

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>{t("title")}</Text>
      <Text style={styles.sub}>{t("subtitle")}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>{t("signed_in_as")}</Text>
        <Text style={styles.email}>{email ?? "—"}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>{t("language.title")}</Text>
        <Text style={styles.hint}>{t("language.description")}</Text>
        {SUPPORTED_LOCALES.map((loc) => {
          const active = loc === currentLocale;
          return (
            <Pressable
              key={loc}
              onPress={() => void onPickLocale(loc)}
              style={({ pressed }) => [
                styles.localeRow,
                active && styles.localeRowActive,
                pressed && styles.localeRowPressed,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.localeLabel, active && styles.localeLabelActive]}>
                {t(LANGUAGE_LABEL_KEY[loc], { ns: "common" })}
              </Text>
              {active && <Text style={styles.localeCheck}>✓</Text>}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>{t("push.title")}</Text>
        <Text style={styles.hint}>{t("push.description")}</Text>
        {prefsLoading ? (
          <ActivityIndicator style={styles.prefsSpinner} color={tokens.accent} />
        ) : (
          <>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t("push.hot_leads")}</Text>
              <Switch
                value={pushHot}
                onValueChange={(v) => {
                  setPushHot(v);
                  void savePrefs({ push_hot_lead: v });
                }}
                disabled={prefsSaving}
              />
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t("push.missed_calls")}</Text>
              <Switch
                value={pushMissed}
                onValueChange={(v) => {
                  setPushMissed(v);
                  void savePrefs({ push_missed_call: v });
                }}
                disabled={prefsSaving}
              />
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t("push.follow_ups")}</Text>
              <Switch
                value={pushReminder}
                onValueChange={(v) => {
                  setPushReminder(v);
                  void savePrefs({ push_reminder: v });
                }}
                disabled={prefsSaving}
              />
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t("push.post_milestones")}</Text>
              <Switch
                value={pushMilestone}
                onValueChange={(v) => {
                  setPushMilestone(v);
                  void savePrefs({ push_post_milestone: v });
                }}
                disabled={prefsSaving}
              />
            </View>
            <Text style={styles.digestNote}>
              {t("push.digest_window", { minutes: digestMin })}
            </Text>
          </>
        )}
      </View>

      <Pressable
        onPress={() => {
          hapticButtonPress();
          router.push("/notifications");
        }}
        style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel={t("links.notification_center")}
      >
        <Text style={styles.secondaryBtnText}>{t("links.notification_center")}</Text>
      </Pressable>

      {/*
       * Re-entry path back into the onboarding walkthrough. Users
       * who swiped past the value slides on their first launch had
       * no way to see them again — this button lets them revisit
       * the "why LeadSmart" pitch and notification permissions.
       * It enters the onboarding stack at the value screen (not
       * welcome), which avoids the "Get started" CTA repeating
       * while still showing the back button.
       */}
      <Pressable
        onPress={() => {
          hapticButtonPress();
          router.push("/(onboarding)/value");
        }}
        style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel={t("links.replay_onboarding")}
      >
        <Text style={styles.secondaryBtnText}>{t("links.replay_onboarding")}</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.label}>{t("links.legal_section")}</Text>
        <Pressable
          onPress={() => {
            hapticButtonPress();
            void Linking.openURL("https://www.closebossai.com/privacy");
          }}
          style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
          accessibilityRole="link"
          accessibilityLabel={t("links.privacy_policy")}
        >
          <Text style={styles.linkRowText}>{t("links.privacy_policy")}</Text>
          <Text style={styles.linkRowChevron}>›</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            hapticButtonPress();
            void Linking.openURL("https://www.closebossai.com/terms");
          }}
          style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
          accessibilityRole="link"
          accessibilityLabel={t("links.terms_of_service")}
        >
          <Text style={styles.linkRowText}>{t("links.terms_of_service")}</Text>
          <Text style={styles.linkRowChevron}>›</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>{t("app_section.title")}</Text>
        <Text style={styles.meta}>{t("app_section.version", { version })}</Text>
      </View>

      <Pressable
        onPress={() => void onSignOut()}
        disabled={signingOut}
        style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
        accessibilityRole="button"
        accessibilityLabel={t("sign_out_a11y")}
      >
        {signingOut ? (
          <ActivityIndicator color={tokens.textOnAccent} />
        ) : (
          <Text style={styles.signOutText}>{t("actions.sign_out", { ns: "common" })}</Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => {
          hapticButtonPress();
          router.push("/delete-account");
        }}
        style={({ pressed }) => [styles.deleteRow, pressed && styles.deleteRowPressed]}
        accessibilityRole="button"
        accessibilityLabel={t("delete_account.row_label")}
      >
        <Text style={styles.deleteRowText}>{t("delete_account.row_label")}</Text>
        <Text style={styles.deleteRowHint}>{t("delete_account.row_hint")}</Text>
      </Pressable>
    </ScrollView>
  );
}

/**
 * Style factory — consumed via `useMemo` inside `SettingsScreen`
 * so the StyleSheet rebuilds when the OS color scheme flips.
 */
const createStyles = (theme: ThemeTokens) => StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, paddingBottom: 40 },
  h1: { fontSize: 28, fontWeight: "700", color: theme.text },
  sub: { marginTop: 6, fontSize: 15, color: theme.textMuted },
  card: {
    marginTop: 20,
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: theme.textSubtle,
    marginBottom: 8,
  },
  hint: { fontSize: 13, color: theme.textMuted, lineHeight: 18, marginBottom: 12 },
  email: { fontSize: 16, fontWeight: "600", color: theme.text },
  meta: { fontSize: 15, color: theme.textMuted },
  prefsSpinner: { marginVertical: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 12,
  },
  rowLabel: { flex: 1, fontSize: 15, color: theme.text, fontWeight: "600" },
  digestNote: { fontSize: 12, color: theme.textSubtle, marginTop: 4 },
  localeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.bg,
    marginTop: 8,
  },
  localeRowActive: {
    backgroundColor: theme.accentLight,
    borderColor: theme.accent,
  },
  localeRowPressed: { opacity: 0.85 },
  localeLabel: { fontSize: 15, fontWeight: "600", color: theme.text },
  localeLabelActive: { color: theme.accent },
  localeCheck: { fontSize: 17, fontWeight: "800", color: theme.accent },
  secondaryBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    alignItems: "center",
  },
  secondaryBtnPressed: { opacity: 0.9 },
  secondaryBtnText: { fontSize: 16, fontWeight: "700", color: theme.accent },
  signOut: {
    marginTop: 28,
    backgroundColor: theme.danger,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  signOutPressed: { opacity: 0.9 },
  signOutText: { color: theme.textOnAccent, fontSize: 16, fontWeight: "700" },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  linkRowPressed: { opacity: 0.7 },
  linkRowText: { fontSize: 15, fontWeight: "600", color: theme.text },
  linkRowChevron: { fontSize: 18, color: theme.textSubtle, fontWeight: "600" },
  deleteRow: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    alignItems: "center",
  },
  deleteRowPressed: { opacity: 0.85 },
  deleteRowText: { fontSize: 15, fontWeight: "700", color: theme.danger },
  deleteRowHint: { marginTop: 2, fontSize: 12, color: theme.textMuted },
});
