import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { fetchMobileLeads, postMobileCalendarEvent } from "../../lib/leadsmartMobileApi";
import type { MobileCalendarEventDto, MobileLeadRecordDto } from "@leadsmart/shared";
import { useThemeTokens } from "../../lib/useThemeTokens";
import type { ThemeTokens } from "../../lib/theme";
import { hapticButtonPress, hapticError, hapticSuccess } from "../../lib/haptics";

type PickedContact = { id: string; name: string };

function contactLabel(lead: MobileLeadRecordDto): string {
  const name = typeof lead.name === "string" ? lead.name.trim() : "";
  return name || lead.display_phone || "Unnamed contact";
}

function hoursFromNow(h: number): string {
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
}

/**
 * Offset ids — labels resolve per-render via
 * `t(\`appointment_composer.offsets.${id}\`)`.
 */
const OFFSETS: { id: "1h" | "4h" | "24h" | "3d" | "1wk"; h: number }[] = [
  { id: "1h", h: 1 },
  { id: "4h", h: 4 },
  { id: "24h", h: 24 },
  { id: "3d", h: 72 },
  { id: "1wk", h: 168 },
];

type Props = {
  visible: boolean;
  /** When set, the appointment is pinned to this contact (picker hidden). */
  leadIdFixed?: string | null;
  /** Display name for the pinned contact — shown as a read-only chip. */
  leadNameFixed?: string | null;
  onClose: () => void;
  onCreated?: (event: MobileCalendarEventDto) => void;
};

export function AppointmentComposerModal({
  visible,
  leadIdFixed,
  leadNameFixed,
  onClose,
  onCreated,
}: Props) {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("task_calendar_components");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [offsetHours, setOffsetHours] = useState(24);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Contact picker (only used when the appointment isn't already pinned to a
  // lead). We resolve a name/phone query to a real contact_id under the hood so
  // the agent never has to see or type a UUID (BUG-5).
  const [picked, setPicked] = useState<PickedContact | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<MobileLeadRecordDto[]>([]);
  const [searching, setSearching] = useState(false);
  // The trimmed term the current `results` belong to — lets us show "no
  // matches" only after a fetch settles, never in the gap before it runs.
  const [resultsTerm, setResultsTerm] = useState("");
  const searchSeq = useRef(0);

  const reset = useCallback(() => {
    setTitle("");
    setDescription("");
    setOffsetHours(24);
    setSubmitting(false);
    setError(null);
    setPicked(null);
    setSearch("");
    setResults([]);
    setResultsTerm("");
    setSearching(false);
  }, []);

  // Debounced lead search. Skips while a contact is already picked or the
  // field is pinned; a monotonic sequence guards against out-of-order
  // responses landing after a newer keystroke.
  useEffect(() => {
    if (leadIdFixed || picked) return;
    const term = search.trim();
    if (term.length < 2) {
      setResults([]);
      setResultsTerm("");
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const handle = setTimeout(async () => {
      const res = await fetchMobileLeads({ search: term, pageSize: 8 });
      if (seq !== searchSeq.current) return; // superseded
      setSearching(false);
      setResults(res.ok ? res.leads : []);
      setResultsTerm(term);
    }, 250);
    return () => clearTimeout(handle);
  }, [search, picked, leadIdFixed]);

  const handleClose = useCallback(() => {
    if (submitting) return;
    reset();
    onClose();
  }, [onClose, reset, submitting]);

  const onPickContact = useCallback((lead: MobileLeadRecordDto) => {
    hapticButtonPress();
    setPicked({ id: lead.id, name: contactLabel(lead) });
    setSearch("");
    setResults([]);
    setError(null);
  }, []);

  const onClearContact = useCallback(() => {
    setPicked(null);
    setSearch("");
    setResults([]);
  }, []);

  const submit = useCallback(async () => {
    const lid = (leadIdFixed ?? picked?.id ?? "").trim();
    const trimmedTitle = title.trim();
    if (!lid) {
      setError(t("appointment_composer.errors.contact_required"));
      return;
    }
    if (!trimmedTitle) {
      setError(t("appointment_composer.errors.title_required"));
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await postMobileCalendarEvent({
      lead_id: lid,
      title: trimmedTitle,
      description: description.trim() || null,
      starts_at: hoursFromNow(offsetHours),
      calendar_provider: "local",
    });
    setSubmitting(false);
    if (res.ok === false) {
      hapticError();
      setError(res.message);
      return;
    }
    hapticSuccess();
    onCreated?.(res.event);
    reset();
    onClose();
  }, [leadIdFixed, picked, title, description, offsetHours, onCreated, onClose, reset, t]);

  const pinnedName = leadIdFixed ? leadNameFixed?.trim() : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={handleClose} accessibilityLabel={t("actions.dismiss_a11y")} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet} accessibilityViewIsModal>
            <Text style={styles.sheetTitle}>{t("appointment_composer.title")}</Text>
            {/* Lead with something human — the title — then who it's for. */}
            <TextInput
              style={styles.input}
              placeholder={t("appointment_composer.placeholder_title")}
              placeholderTextColor={tokens.textSubtle}
              value={title}
              onChangeText={setTitle}
              editable={!submitting}
            />

            {!leadIdFixed ? (
              <View style={styles.pickerBlock}>
                <Text style={styles.label}>{t("appointment_composer.label_contact")}</Text>
                {picked ? (
                  <View style={styles.pickedChip}>
                    <Text style={styles.pickedName} numberOfLines={1}>
                      {picked.name}
                    </Text>
                    <Pressable
                      onPress={onClearContact}
                      disabled={submitting}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t("appointment_composer.contact_clear_a11y")}
                    >
                      <Text style={styles.pickedClear}>✕</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <TextInput
                      style={styles.input}
                      placeholder={t("appointment_composer.placeholder_contact_search")}
                      placeholderTextColor={tokens.textSubtle}
                      value={search}
                      onChangeText={setSearch}
                      editable={!submitting}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {searching ? (
                      <Text style={styles.hint}>{t("appointment_composer.contact_searching")}</Text>
                    ) : resultsTerm === search.trim() && search.trim().length >= 2 && results.length === 0 ? (
                      <Text style={styles.hint}>{t("appointment_composer.contact_no_results")}</Text>
                    ) : results.length > 0 ? (
                      <ScrollView
                        style={styles.resultsList}
                        keyboardShouldPersistTaps="handled"
                        nestedScrollEnabled
                      >
                        {results.map((lead) => (
                          <Pressable
                            key={lead.id}
                            onPress={() => onPickContact(lead)}
                            style={({ pressed }) => [styles.resultRow, pressed && styles.resultRowPressed]}
                            accessibilityRole="button"
                          >
                            <Text style={styles.resultName} numberOfLines={1}>
                              {contactLabel(lead)}
                            </Text>
                            {lead.display_phone ? (
                              <Text style={styles.resultMeta} numberOfLines={1}>
                                {lead.display_phone}
                              </Text>
                            ) : null}
                          </Pressable>
                        ))}
                      </ScrollView>
                    ) : null}
                  </>
                )}
              </View>
            ) : pinnedName ? (
              <View style={styles.pickerBlock}>
                <Text style={styles.label}>{t("appointment_composer.label_contact")}</Text>
                <View style={[styles.pickedChip, styles.pickedChipPinned]}>
                  <Text style={styles.pickedName} numberOfLines={1}>
                    {pinnedName}
                  </Text>
                </View>
              </View>
            ) : null}

            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder={t("appointment_composer.placeholder_notes")}
              placeholderTextColor={tokens.textSubtle}
              value={description}
              onChangeText={setDescription}
              multiline
              editable={!submitting}
            />
            <Text style={styles.label}>{t("appointment_composer.label_starts_in")}</Text>
            <View style={styles.chipRow}>
              {OFFSETS.map(({ id, h }) => (
                <Pressable
                  key={id}
                  onPress={() => setOffsetHours(h)}
                  disabled={submitting}
                  style={[styles.chip, offsetHours === h && styles.chipOn]}
                >
                  <Text style={[styles.chipText, offsetHours === h && styles.chipTextOn]}>
                    {t(`appointment_composer.offsets.${id}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <Pressable onPress={handleClose} disabled={submitting} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>{t("actions.cancel")}</Text>
              </Pressable>
              <Pressable onPress={() => void submit()} disabled={submitting} style={styles.saveBtn}>
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
    modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  sheetWrap: { maxHeight: "90%" },
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
    marginBottom: 8,
  },
  pickerBlock: { marginBottom: 10 },
  hint: { color: theme.textMuted, fontSize: 13, paddingVertical: 6 },
  resultsList: {
    maxHeight: 180,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    backgroundColor: theme.bg,
  },
  resultRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  resultRowPressed: { backgroundColor: theme.surfaceElevated },
  resultName: { fontSize: 15, fontWeight: "600", color: theme.text },
  resultMeta: { fontSize: 13, color: theme.textMuted, marginTop: 2 },
  pickedChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.accent,
    backgroundColor: theme.infoBg,
  },
  pickedChipPinned: { borderColor: theme.border, backgroundColor: theme.bg },
  pickedName: { flex: 1, fontSize: 15, fontWeight: "700", color: theme.text },
  pickedClear: { fontSize: 15, fontWeight: "700", color: theme.textMuted, paddingHorizontal: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  chipOn: { backgroundColor: theme.infoBg, borderColor: theme.accent },
  chipText: { fontSize: 13, fontWeight: "700", color: theme.textMuted },
  chipTextOn: { color: theme.accent },
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
