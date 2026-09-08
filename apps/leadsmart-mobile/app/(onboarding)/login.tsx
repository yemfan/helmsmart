import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Toggle } from "../../components/Toggle";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { getLeadsmartApiBaseUrl, getSupabaseAnonKey, getSupabaseUrl } from "../../lib/env";
import { useOnboardingStyles } from "../../lib/onboarding/styles";
import type { ThemeTokens } from "../../lib/theme";
import { useThemeTokens } from "../../lib/useThemeTokens";
import { useLeadsmartSession } from "../../lib/session/LeadsmartSessionContext";
import { BackRow } from "../../components/onboarding/BackRow";
import { HOME_ROUTE } from "../../lib/homeRoute";

/**
 * OAuth button styles — factory form so Google button surface
 * flips to a dark-compatible color in dark mode. Apple button
 * stays pure black regardless of theme (that's the Apple brand
 * requirement from HIG).
 */
/**
 * Coerce any thrown value into a clean, displayable string. Supabase
 * AuthError, a thrown string, a `{ message }`/`{ error }` object, or a
 * network failure whose payload isn't a string all used to render as the
 * literal "[object Object]" — this guarantees the user sees real text.
 */
function toSignInError(e: unknown, fallback: string): string {
  if (e instanceof Error && typeof e.message === "string" && e.message.trim()) return e.message;
  if (typeof e === "string" && e.trim()) return e;
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; error?: unknown };
    if (typeof o.message === "string" && o.message.trim()) return o.message;
    if (typeof o.error === "string" && o.error.trim()) return o.error;
  }
  return fallback;
}

const createOAuthStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    row: {
      marginTop: 12,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    rowApple: {
      marginTop: 10,
      backgroundColor: "#000",
      borderColor: "#000",
    },
    label: { fontSize: 15, fontWeight: "600", color: theme.text },
    labelApple: { color: "#fff" },
  });

export default function OnboardingLoginScreen() {
  const router = useRouter();
  const s = useOnboardingStyles();
  const { t } = useTranslation("onboarding");
  const tokens = useThemeTokens();
  const oauthBtn = useMemo(() => createOAuthStyles(tokens), [tokens]);
  const inputCompact = useMemo(
    () => [s.input, { minHeight: 52, textAlignVertical: "center" as const }],
    [s.input]
  );
  const {
    signInWithEmailPassword,
    signInWithToken,
    signInWithGoogleOAuth,
    signInWithAppleOAuth,
    onboardingComplete,
  } = useLeadsmartSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [showTokenFallback, setShowTokenFallback] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = getLeadsmartApiBaseUrl();
  const oauthAvailable = Boolean(getSupabaseUrl().trim() && getSupabaseAnonKey().trim());

  function goAfterSignIn() {
    if (onboardingComplete) {
      router.replace(HOME_ROUTE);
    } else {
      router.replace("/(onboarding)/notifications");
    }
  }

  async function onSubmitEmailPassword() {
    setError(null);
    setBusy(true);
    try {
      await signInWithEmailPassword(email, password, rememberDevice);
      goAfterSignIn();
    } catch (e) {
      setError(toSignInError(e, t("login.error_generic")));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitToken() {
    setError(null);
    setBusy(true);
    try {
      await signInWithToken(token, rememberDevice);
      goAfterSignIn();
    } catch (e) {
      setError(toSignInError(e, t("login.error_generic")));
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogleOAuth(rememberDevice);
      goAfterSignIn();
    } catch (e) {
      setError(toSignInError(e, t("login.error_generic")));
    } finally {
      setBusy(false);
    }
  }

  async function onApple() {
    setError(null);
    setBusy(true);
    try {
      await signInWithAppleOAuth(rememberDevice);
      goAfterSignIn();
    } catch (e) {
      setError(toSignInError(e, t("login.error_generic")));
    } finally {
      setBusy(false);
    }
  }

  return (
    /*
     * Keyboard handling — before this refactor, the form used
     * `<KeyboardAvoidingView>` + a flex `<View>` with
     * `justifyContent: space-between`. When the iOS keyboard slid up,
     * the submit button (anchored at the bottom) was covered on
     * smaller Android devices and older iPhones because "padding"
     * KAV behavior doesn't move a center-aligned flex block — it
     * only adds bottom inset, which the centerBlock ignores.
     *
     * New pattern: SafeAreaView (for notch) → KeyboardAvoidingView →
     * ScrollView. When the keyboard appears, the ScrollView pushes
     * content up so the focused input + the submit button below it
     * stay visible. `keyboardShouldPersistTaps="handled"` lets users
     * tap buttons without losing the keyboard focus first.
     */
    <SafeAreaView style={s.flex} edges={["top", "bottom"]}>
      <BackRow fallbackHref="/(onboarding)/value" />
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          /*
           * Do NOT spread `s.safePad` here: it carries `flex: 1`
           * (→ flexShrink: 1, which clamps the content to the
           * viewport and clips overflow instead of scrolling) and
           * `justifyContent: "space-between"` (which pins the Sign
           * in button to the bottom edge, right under the keyboard).
           * Both are correct for the plain-View onboarding screens
           * but broke sign-in: on iPad's taller keyboard the button
           * was pinned off-screen and unreachable (App Store review
           * Guideline 4.0, build 1.6 (28)). Use plain padding +
           * flexGrow so content flows top-down and scrolls when the
           * keyboard shrinks the viewport.
           */
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 20,
            paddingBottom: 40,
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
        <View style={[s.centerBlock, { flex: 0, justifyContent: "flex-start" }]}>
          <Text style={s.kicker}>{t("login.kicker")}</Text>
          <Text style={s.title}>{t("login.title")}</Text>
          {!showTokenFallback ? (
            <Text style={s.body}>{t("login.body")}</Text>
          ) : (
            <Text style={s.body}>{t("login.token_body")}</Text>
          )}
          {/* Endpoint readout and the token fallback are developer tools. In a
              release build they read as an unfinished app to the agent. */}
          {!apiUrl ? (
            <Text style={s.error}>{t("login.missing_api_url")}</Text>
          ) : __DEV__ ? (
            <Text style={s.muted} numberOfLines={2}>
              {t("login.endpoint", { url: apiUrl })}
            </Text>
          ) : null}

          {!showTokenFallback && oauthAvailable ? (
            <>
              <Text style={[s.muted, { marginTop: 20 }]}>{t("login.continue_with")}</Text>
              <Pressable
                style={[oauthBtn.row, busy && { opacity: 0.6 }]}
                onPress={() => void onGoogle()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t("login.google")}
              >
                <Text style={oauthBtn.label}>{t("login.google")}</Text>
              </Pressable>
              <Pressable
                style={[oauthBtn.row, oauthBtn.rowApple, busy && { opacity: 0.6 }]}
                onPress={() => void onApple()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t("login.apple")}
              >
                <Text style={[oauthBtn.label, oauthBtn.labelApple]}>{t("login.apple")}</Text>
              </Pressable>
              <Text style={[s.muted, { marginTop: 16, textAlign: "center" }]}>{t("login.or_email")}</Text>
            </>
          ) : null}

          {!showTokenFallback ? (
            <>
              {!oauthAvailable && (
                <View style={{ height: 8 }} />
              )}
              <TextInput
                style={inputCompact}
                placeholder={t("login.email")}
                placeholderTextColor="#94a3b8"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                textContentType="username"
                editable={!busy}
                accessibilityLabel={t("login.email")}
              />
              <TextInput
                style={inputCompact}
                placeholder={t("login.password")}
                placeholderTextColor="#94a3b8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                editable={!busy}
                accessibilityLabel={t("login.password")}
              />
            </>
          ) : (
            <>
              <TextInput
                style={s.input}
                placeholder={t("login.token_placeholder")}
                placeholderTextColor="#94a3b8"
                value={token}
                onChangeText={setToken}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                editable={!busy}
                accessibilityLabel={t("login.token_a11y")}
              />
            </>
          )}

          {error ? (
            <Text style={s.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
              {error}
            </Text>
          ) : null}

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "flex-start",
              marginTop: 16,
              gap: 12,
            }}
          >
            <Text style={[s.muted, { flexShrink: 1, marginTop: 0 }]}>{t("login.remember")}</Text>
            <Toggle
              value={rememberDevice}
              onValueChange={setRememberDevice}
              disabled={busy}
              accessibilityLabel={t("login.remember")}
            />
          </View>
          <Text style={[s.muted, { fontSize: 12, marginTop: 6 }]}>{t("login.remember_hint")}</Text>

          {__DEV__ ? (
            <Pressable
              onPress={() => {
                setShowTokenFallback((v) => !v);
                setError(null);
              }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={showTokenFallback ? t("login.use_email_a11y") : t("login.use_token_a11y")}
            >
              <Text style={[s.muted, { textDecorationLine: "underline", marginTop: 8 }]}>
                {showTokenFallback ? t("login.back_to_email") : t("login.advanced_token")}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <View style={{ marginTop: 24 }}>
          {!showTokenFallback ? (
            <Pressable
              style={[s.primaryBtn, (busy || !email.trim() || !password) && { opacity: 0.5 }]}
              onPress={() => void onSubmitEmailPassword()}
              disabled={busy || !email.trim() || !password}
              accessibilityRole="button"
              accessibilityLabel={t("login.sign_in")}
            >
              {busy ? (
                <ActivityIndicator color={tokens.textOnAccent} />
              ) : (
                <Text style={s.primaryBtnText}>{t("login.sign_in")}</Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={[s.primaryBtn, (busy || !token.trim()) && { opacity: 0.5 }]}
              onPress={() => void onSubmitToken()}
              disabled={busy || !token.trim()}
              accessibilityRole="button"
              accessibilityLabel={t("login.sign_in_token_a11y")}
            >
              {busy ? (
                <ActivityIndicator color={tokens.textOnAccent} />
              ) : (
                <Text style={s.primaryBtnText}>{t("login.continue_token")}</Text>
              )}
            </Pressable>
          )}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
