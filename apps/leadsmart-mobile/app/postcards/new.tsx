import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  fetchMobilePostcardTemplates,
  sendMobilePostcard,
  type MobilePostcardChannel,
  type MobilePostcardTemplate,
  type MobilePostcardTemplateKey,
} from "../../lib/leadsmartMobileApi";
import {
  hapticButtonPress,
  hapticError,
  hapticSelectionChange,
  hapticSuccess,
} from "../../lib/haptics";
import { useThemeTokens } from "../../lib/useThemeTokens";
import type { ThemeTokens } from "../../lib/theme";

/** `label` is an i18n key under `postcards.channels.*`. */
const ALL_CHANNELS: Array<{ value: MobilePostcardChannel; label: string }> = [
  { value: "email", label: "channels.email" },
  { value: "sms", label: "channels.sms" },
  { value: "wechat", label: "channels.wechat" },
];

/**
 * Postcard composer.
 *
 * Three vertical sections:
 *   1. Template picker — emoji + title + tagline. Tapping picks the
 *      template AND seeds the personal message with the template's
 *      default copy (the agent can edit before sending).
 *   2. Recipient — name + email + phone, plus channel toggles.
 *      Channel availability is gated by what the recipient supplies
 *      (no email = email channel disabled).
 *   3. Personal message — multiline textarea.
 *
 * Send dispatches all selected channels in one shot via the existing
 * createPostcardSend service. On success, surfaces the public URL and
 * navigates back to the list.
 */
export default function NewPostcardScreen() {
  const router = useRouter();
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("postcards");

  const [templates, setTemplates] = useState<MobilePostcardTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templateKey, setTemplateKey] = useState<MobilePostcardTemplateKey | null>(null);

  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [personalMessage, setPersonalMessage] = useState("");

  const [channels, setChannels] = useState<Set<MobilePostcardChannel>>(
    () => new Set<MobilePostcardChannel>(),
  );

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load templates once on mount.
  useEffect(() => {
    void (async () => {
      setTemplatesLoading(true);
      const res = await fetchMobilePostcardTemplates();
      setTemplatesLoading(false);
      if (res.ok) {
        setTemplates(res.templates);
      } else {
        setError(res.message || t("new.templates_failed"));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.key === templateKey) ?? null,
    [templates, templateKey],
  );

  const onPickTemplate = useCallback(
    (t: MobilePostcardTemplate) => {
      hapticSelectionChange();
      setTemplateKey(t.key);
      // Seed the message with the template's default copy ONLY if
      // the agent hasn't already typed something — never overwrite
      // mid-edit.
      setPersonalMessage((prev) => (prev.trim() ? prev : t.defaultMessage));
    },
    [],
  );

  const toggleChannel = useCallback((c: MobilePostcardChannel) => {
    hapticSelectionChange();
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }, []);

  const canSendChannel = (c: MobilePostcardChannel): boolean => {
    if (c === "email") return Boolean(recipientEmail.trim());
    if (c === "sms" || c === "wechat") return Boolean(recipientPhone.trim());
    return false;
  };

  // Auto-prune channels that lose their input (e.g. agent clears
  // email after picking the email channel).
  useEffect(() => {
    setChannels((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const c of Array.from(next)) {
        if (!canSendChannel(c)) {
          next.delete(c);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientEmail, recipientPhone]);

  const onSend = useCallback(async () => {
    setError(null);
    if (!templateKey) {
      setError(t("new.pick_template_first"));
      return;
    }
    if (!recipientName.trim()) {
      setError(t("new.name_required"));
      return;
    }
    if (channels.size === 0) {
      setError(t("new.channel_required"));
      return;
    }
    hapticButtonPress();
    setSending(true);
    const res = await sendMobilePostcard({
      templateKey,
      recipientName: recipientName.trim(),
      recipientEmail: recipientEmail.trim() || null,
      recipientPhone: recipientPhone.trim() || null,
      personalMessage: personalMessage.trim() || null,
      channels: Array.from(channels),
    });
    setSending(false);
    if (res.ok === false) {
      hapticError();
      setError(res.message || t("new.send_failed"));
      return;
    }
    hapticSuccess();
    // Show a quick confirmation and bounce to list.
    const sentNames = ALL_CHANNELS.filter((c) => channels.has(c.value))
      .map((c) => t(c.label))
      .join(", ");
    Alert.alert(
      t("new.sent_title"),
      t("new.sent_body", { channels: sentNames, name: recipientName.trim() }),
      [
        {
          text: t("new.ok"),
          onPress: () => {
            if (router.canGoBack()) router.back();
            else router.replace("/postcards" as never);
          },
        },
      ],
    );
  }, [
    templateKey,
    recipientName,
    recipientEmail,
    recipientPhone,
    personalMessage,
    channels,
    router,
    t,
  ]);

  return (
    <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <Stack.Screen
        options={{
          title: t("new.title"),
          headerBackTitle: t("new.back"),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Template picker */}
        <Text style={styles.sectionHeading}>{t("new.section_template")}</Text>
        {templatesLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={tokens.accent} />
          </View>
        ) : templates.length === 0 ? (
          <Text style={styles.muted}>{t("new.no_templates")}</Text>
        ) : (
          <View style={styles.templateGrid}>
            {templates.map((t) => {
              const active = templateKey === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => onPickTemplate(t)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.templateCard,
                    active && {
                      borderColor: t.accentColor,
                      backgroundColor: t.accentColor + "12",
                    },
                    pressed && styles.templateCardPressed,
                  ]}
                >
                  <Text style={styles.templateEmoji}>{t.emojiBadge}</Text>
                  <Text style={styles.templateTitle}>{t.title}</Text>
                  <Text style={styles.templateTagline} numberOfLines={2}>
                    {t.tagline}
                  </Text>
                  <Text style={styles.templateWhen} numberOfLines={1}>
                    {t.suggestedWhen}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.divider} />

        {/* Recipient */}
        <Text style={styles.sectionHeading}>{t("new.section_recipient")}</Text>
        <Text style={styles.label}>{t("new.name_label")}</Text>
        <TextInput
          value={recipientName}
          onChangeText={setRecipientName}
          placeholder={t("new.name_placeholder")}
          placeholderTextColor={tokens.textSubtle}
          style={styles.input}
        />
        <Text style={styles.label}>{t("new.email_label")}</Text>
        <TextInput
          value={recipientEmail}
          onChangeText={setRecipientEmail}
          placeholder={t("new.email_placeholder")}
          placeholderTextColor={tokens.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          style={styles.input}
        />
        <Text style={styles.label}>{t("new.phone_label")}</Text>
        <TextInput
          value={recipientPhone}
          onChangeText={setRecipientPhone}
          placeholder={t("new.phone_placeholder")}
          placeholderTextColor={tokens.textSubtle}
          keyboardType="phone-pad"
          style={styles.input}
        />

        <Text style={styles.label}>{t("new.channels_label")}</Text>
        <View style={styles.channelRow}>
          {ALL_CHANNELS.map((c) => {
            const allowed = canSendChannel(c.value);
            const active = channels.has(c.value);
            return (
              <Pressable
                key={c.value}
                onPress={() => allowed && toggleChannel(c.value)}
                disabled={!allowed}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: !allowed }}
                style={({ pressed }) => [
                  styles.channelBtn,
                  active && styles.channelBtnActive,
                  !allowed && styles.channelBtnDisabled,
                  pressed && styles.channelBtnPressed,
                ]}
              >
                <Text
                  style={[
                    styles.channelText,
                    active && styles.channelTextActive,
                    !allowed && styles.channelTextDisabled,
                  ]}
                >
                  {t(c.label)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.helper}>{t("new.channels_helper")}</Text>

        <View style={styles.divider} />

        {/* Personal message */}
        <Text style={styles.sectionHeading}>{t("new.section_message")}</Text>
        <TextInput
          multiline
          value={personalMessage}
          onChangeText={setPersonalMessage}
          placeholder={
            selectedTemplate?.defaultMessage ??
            t("new.message_placeholder")
          }
          placeholderTextColor={tokens.textSubtle}
          style={styles.textArea}
        />

        {error ? <Text style={styles.inlineError}>{error}</Text> : null}

        <Pressable
          onPress={() => void onSend()}
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel={t("new.send")}
          accessibilityState={{ disabled: sending }}
          style={({ pressed }) => [
            styles.sendBtn,
            pressed && styles.sendBtnPressed,
            sending && styles.sendBtnDisabled,
          ]}
        >
          <Ionicons name="send" size={16} color={tokens.textOnAccent} />
          <Text style={styles.sendBtnText}>
            {sending ? t("new.sending") : t("new.send")}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(t: ThemeTokens) {
  return StyleSheet.create({
    kav: { flex: 1, backgroundColor: t.bg },
    scrollContent: { padding: 16, paddingBottom: 48 },

    sectionHeading: {
      fontSize: 12,
      fontWeight: "800",
      color: t.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 10,
    },

    center: { padding: 24, alignItems: "center" },
    muted: { fontSize: 13, color: t.textMuted, paddingVertical: 8 },

    templateGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    templateCard: {
      flexBasis: "48%",
      flexGrow: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
      padding: 12,
      gap: 4,
    },
    templateCardPressed: { opacity: 0.85 },
    templateEmoji: { fontSize: 24 },
    templateTitle: { fontSize: 14, fontWeight: "700", color: t.text },
    templateTagline: { fontSize: 12, color: t.textMuted, lineHeight: 16 },
    templateWhen: {
      marginTop: 4,
      fontSize: 11,
      color: t.textSubtle,
      fontStyle: "italic",
    },

    divider: { height: 1, backgroundColor: t.border, marginVertical: 24 },

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
    helper: {
      marginTop: 6,
      fontSize: 11,
      color: t.textSubtle,
      lineHeight: 14,
    },

    channelRow: { flexDirection: "row", gap: 8 },
    channelBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
      alignItems: "center",
      minHeight: 44,
      justifyContent: "center",
    },
    channelBtnActive: { borderColor: t.accent, backgroundColor: t.accentPressed },
    channelBtnDisabled: { opacity: 0.4 },
    channelBtnPressed: { opacity: 0.85 },
    channelText: { fontSize: 13, fontWeight: "600", color: t.text },
    channelTextActive: { color: t.accent },
    channelTextDisabled: { color: t.textMuted },

    textArea: {
      minHeight: 120,
      textAlignVertical: "top",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
      padding: 12,
      fontSize: 14,
      color: t.text,
      lineHeight: 20,
    },

    inlineError: {
      marginTop: 12,
      fontSize: 13,
      color: t.dangerTitle,
    },

    sendBtn: {
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
    sendBtnPressed: { opacity: 0.85 },
    sendBtnDisabled: { opacity: 0.5 },
    sendBtnText: { fontSize: 15, fontWeight: "700", color: t.textOnAccent },
  });
}
