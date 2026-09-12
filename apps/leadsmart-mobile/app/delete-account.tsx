import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { deleteMobileAccount } from "../lib/closeBossMobileApi";
import { useCloseBossSession } from "../lib/session/CloseBossSessionContext";
import { useThemeTokens } from "../lib/useThemeTokens";
import type { ThemeTokens } from "../lib/theme";
import { hapticError, hapticWarning } from "../lib/haptics";

export default function DeleteAccountScreen() {
  const router = useRouter();
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { signOut } = useCloseBossSession();
  const { t } = useTranslation(["settings", "common"]);

  const confirmToken = t("delete_account.confirm_token");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = typed.trim().toUpperCase() === confirmToken && !busy;

  const onConfirm = useCallback(async () => {
    if (!canDelete) return;
    hapticWarning();
    setBusy(true);
    setError(null);
    const res = await deleteMobileAccount();
    if (res.ok === false) {
      hapticError();
      setBusy(false);
      setError(res.message || t("delete_account.error_generic"));
      return;
    }
    try {
      await signOut();
    } finally {
      router.replace("/(onboarding)/login");
    }
  }, [canDelete, router, signOut, t]);

  const onCancel = useCallback(() => {
    if (busy) return;
    router.back();
  }, [busy, router]);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>{t("delete_account.headline")}</Text>
      <Text style={styles.body}>{t("delete_account.body")}</Text>
      <Text style={styles.retention}>{t("delete_account.retention_note")}</Text>

      <View style={styles.card}>
        <Text style={styles.prompt}>
          {t("delete_account.confirm_prompt", { token: confirmToken })}
        </Text>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="characters"
          autoCorrect={false}
          spellCheck={false}
          editable={!busy}
          style={styles.input}
          placeholder={confirmToken}
          placeholderTextColor={tokens.textSubtle}
          accessibilityLabel={t("delete_account.input_a11y")}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        onPress={() => void onConfirm()}
        disabled={!canDelete}
        style={({ pressed }) => [
          styles.confirmBtn,
          !canDelete && styles.confirmBtnDisabled,
          pressed && canDelete && styles.confirmBtnPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={t("delete_account.confirm_button")}
        accessibilityState={{ disabled: !canDelete }}
      >
        {busy ? (
          <ActivityIndicator color={tokens.textOnAccent} />
        ) : (
          <Text style={styles.confirmBtnText}>
            {t("delete_account.confirm_button")}
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={onCancel}
        disabled={busy}
        style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel={t("delete_account.cancel_button")}
      >
        <Text style={styles.cancelBtnText}>{t("delete_account.cancel_button")}</Text>
      </Pressable>
    </ScrollView>
  );
}

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: theme.bg },
    content: { padding: 20, paddingBottom: 40 },
    h1: { fontSize: 28, fontWeight: "700", color: theme.text },
    body: { marginTop: 12, fontSize: 15, lineHeight: 22, color: theme.text },
    retention: {
      marginTop: 12,
      fontSize: 13,
      lineHeight: 18,
      color: theme.textMuted,
    },
    card: {
      marginTop: 24,
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
    },
    prompt: { fontSize: 14, color: theme.text, marginBottom: 10 },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      letterSpacing: 2,
      color: theme.text,
      backgroundColor: theme.bg,
    },
    error: {
      marginTop: 16,
      fontSize: 13,
      color: theme.danger,
    },
    confirmBtn: {
      marginTop: 24,
      backgroundColor: theme.danger,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 48,
    },
    confirmBtnDisabled: { opacity: 0.4 },
    confirmBtnPressed: { opacity: 0.9 },
    confirmBtnText: { color: theme.textOnAccent, fontSize: 16, fontWeight: "700" },
    cancelBtn: {
      marginTop: 12,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: "center",
    },
    cancelBtnPressed: { opacity: 0.9 },
    cancelBtnText: { fontSize: 16, fontWeight: "600", color: theme.text },
  });
