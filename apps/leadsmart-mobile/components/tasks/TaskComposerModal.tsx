import type { MobileLeadTaskDto, MobileTaskPriority } from "@leadsmart/shared";
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
import { postMobileTask } from "../../lib/leadsmartMobileApi";
import { useThemeTokens } from "../../lib/useThemeTokens";
import type { ThemeTokens } from "../../lib/theme";
import { hapticError, hapticSuccess } from "../../lib/haptics";

function utcNoonTodayIso(): string {
  const n = new Date();
  const u = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 12, 0, 0, 0);
  return new Date(u).toISOString();
}

const PRIORITIES: MobileTaskPriority[] = ["low", "medium", "high", "urgent"];

type Props = {
  visible: boolean;
  leadId: string;
  onClose: () => void;
  onCreated?: (task: MobileLeadTaskDto) => void;
};

export function TaskComposerModal({ visible, leadId, onClose, onCreated }: Props) {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("task_calendar_components");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<MobileTaskPriority>("medium");
  const [dueToday, setDueToday] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setDueToday(false);
    setSubmitting(false);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) return;
    reset();
    onClose();
  }, [onClose, reset, submitting]);

  const submit = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t("task_composer.errors.title_required"));
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await postMobileTask({
      lead_id: leadId,
      title: trimmedTitle,
      description: description.trim() || null,
      priority,
      due_at: dueToday ? utcNoonTodayIso() : null,
      task_type: null,
    });
    setSubmitting(false);
    if (res.ok === false) {
      hapticError();
      setError(res.message);
      return;
    }
    hapticSuccess();
    onCreated?.(res.task);
    reset();
    onClose();
  }, [title, description, priority, dueToday, leadId, onCreated, onClose, reset, t]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={handleClose} accessibilityLabel={t("actions.dismiss_a11y")} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetWrap}
        >
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text style={styles.sheetTitle}>{t("task_composer.title")}</Text>
          <TextInput
            style={styles.input}
            placeholder={t("task_composer.placeholder_title")}
            placeholderTextColor={tokens.textSubtle}
            value={title}
            onChangeText={setTitle}
            editable={!submitting}
          />
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder={t("task_composer.placeholder_notes")}
            placeholderTextColor={tokens.textSubtle}
            value={description}
            onChangeText={setDescription}
            multiline
            editable={!submitting}
          />
          <Text style={styles.label}>{t("task_composer.label_priority")}</Text>
          <View style={styles.priorityRow}>
            {PRIORITIES.map((p) => (
              <Pressable
                key={p}
                onPress={() => setPriority(p)}
                disabled={submitting}
                style={[
                  styles.priorityChip,
                  priority === p && styles.priorityChipOn,
                ]}
              >
                <Text style={[styles.priorityChipText, priority === p && styles.priorityChipTextOn]}>
                  {t(`task_card.priority.${p}`, { defaultValue: p })}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>{t("task_composer.label_due")}</Text>
          <View style={styles.dueRow}>
            <Pressable
              onPress={() => setDueToday(false)}
              disabled={submitting}
              style={[styles.dueChip, !dueToday && styles.dueChipOn]}
            >
              <Text style={[styles.dueChipText, !dueToday && styles.dueChipTextOn]}>{t("task_composer.due_none")}</Text>
            </Pressable>
            <Pressable
              onPress={() => setDueToday(true)}
              disabled={submitting}
              style={[styles.dueChip, dueToday && styles.dueChipOn]}
            >
              <Text style={[styles.dueChipText, dueToday && styles.dueChipTextOn]}>{t("task_composer.due_today")}</Text>
            </Pressable>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable onPress={handleClose} disabled={submitting} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>{t("actions.cancel")}</Text>
            </Pressable>
            <Pressable
              onPress={() => void submit()}
              disabled={submitting}
              style={styles.saveBtn}
            >
              {submitting ? (
                <ActivityIndicator color={tokens.textOnAccent} />
              ) : (
                <Text style={styles.saveText}>{t("actions.save")}</Text>
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
    modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  sheetWrap: {
    maxHeight: "88%",
  },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: theme.text, marginBottom: 16 },
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
  inputMultiline: { minHeight: 72, textAlignVertical: "top" },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 8,
  },
  priorityRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  priorityChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  priorityChipOn: {
    backgroundColor: theme.infoBg,
    borderColor: theme.accent,
  },
  priorityChipText: { fontSize: 12, fontWeight: "700", color: theme.textMuted, textTransform: "capitalize" },
  priorityChipTextOn: { color: theme.accent },
  dueRow: { flexDirection: "row", gap: 8 },
  dueChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  dueChipOn: { backgroundColor: theme.accent, borderColor: theme.accent },
  dueChipText: { fontSize: 14, fontWeight: "700", color: theme.text },
  dueChipTextOn: { color: theme.textOnAccent },
  error: { color: theme.dangerTitle, marginTop: 8, fontSize: 14 },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 8 },
  cancelText: { fontSize: 16, fontWeight: "600", color: theme.textMuted },
  saveBtn: {
    backgroundColor: theme.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 100,
    alignItems: "center",
  },
  saveText: { color: theme.textOnAccent, fontSize: 16, fontWeight: "700" },
});
