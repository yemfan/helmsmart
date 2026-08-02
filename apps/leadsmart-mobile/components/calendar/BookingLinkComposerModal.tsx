import type { MobileBookingLinkDto } from "@leadsmart/shared";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { postMobileBookingLink } from "../../lib/leadsmartMobileApi";
import { useThemeTokens } from "../../lib/useThemeTokens";
import type { ThemeTokens } from "../../lib/theme";
import { hapticError, hapticSuccess } from "../../lib/haptics";

type Props = {
  visible: boolean;
  leadId: string;
  onClose: () => void;
  onCreated?: (link: MobileBookingLinkDto) => void;
};

export function BookingLinkComposerModal({ visible, leadId, onClose, onCreated }: Props) {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("task_calendar_components");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setUrl("");
    setLabel("");
    setShareMessage("");
    setSubmitting(false);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) return;
    reset();
    onClose();
  }, [onClose, reset, submitting]);

  const submit = useCallback(async () => {
    const u = url.trim();
    if (!u) {
      setError(t("booking_link_composer.errors.url_required"));
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await postMobileBookingLink({
      lead_id: leadId,
      booking_url: u,
      label: label.trim() || null,
      share_message: shareMessage.trim() || null,
    });
    setSubmitting(false);
    if (res.ok === false) {
      hapticError();
      setError(res.message);
      return;
    }
    hapticSuccess();
    onCreated?.(res.booking_link);
    reset();
    onClose();
  }, [leadId, url, label, shareMessage, onCreated, onClose, reset, t]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={handleClose} accessibilityLabel={t("actions.dismiss_a11y")} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet} accessibilityViewIsModal>
            <Text style={styles.sheetTitle}>{t("booking_link_composer.title")}</Text>
            <Text style={styles.hint}>{t("booking_link_composer.hint")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("booking_link_composer.placeholder_url")}
              placeholderTextColor={tokens.textSubtle}
              value={url}
              onChangeText={setUrl}
              editable={!submitting}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TextInput
              style={styles.input}
              placeholder={t("booking_link_composer.placeholder_label")}
              placeholderTextColor={tokens.textSubtle}
              value={label}
              onChangeText={setLabel}
              editable={!submitting}
            />
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder={t("booking_link_composer.placeholder_share_message")}
              placeholderTextColor={tokens.textSubtle}
              value={shareMessage}
              onChangeText={setShareMessage}
              multiline
              editable={!submitting}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <Pressable onPress={handleClose} disabled={submitting} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>{t("actions.cancel")}</Text>
              </Pressable>
              <Pressable onPress={() => void submit()} disabled={submitting} style={styles.saveBtn}>
                {submitting ? (
                  <ActivityIndicator color={tokens.textOnAccent} />
                ) : (
                  <Text style={styles.saveText}>{t("actions.save_link")}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  sheetWrap: { maxHeight: "88%" },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: theme.text, marginBottom: 8 },
  hint: { fontSize: 13, color: theme.textMuted, lineHeight: 18, marginBottom: 14 },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.text,
    marginBottom: 10,
    backgroundColor: theme.bg,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: "top" },
  error: { color: theme.dangerTitle, marginTop: 4, fontSize: 14 },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 18,
  },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 8 },
  cancelText: { fontSize: 16, fontWeight: "600", color: theme.textMuted },
  saveBtn: {
    backgroundColor: theme.successButton,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 108,
    alignItems: "center",
  },
  saveText: { color: theme.textOnAccent, fontSize: 16, fontWeight: "700" },
});
