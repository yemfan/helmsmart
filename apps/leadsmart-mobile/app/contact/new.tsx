import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useTranslation } from "react-i18next";
import {
  claimQueueLead,
  createMobileContact,
  fetchLeadQueue,
  type CreateMobileContactInput,
} from "../../lib/closeBossMobileApi";
import { hapticButtonPress, hapticError, hapticSuccess } from "../../lib/haptics";
import { useThemeTokens } from "../../lib/useThemeTokens";
import type { ThemeTokens } from "../../lib/theme";

const QUEUE_PREVIEW_LIMIT = 5;

type QueueLeadRow = {
  id: string;
  name: string;
  details: string;
  source: string;
  createdAt: string;
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * New-contact form. Mirrors the field set of the web `/dashboard/leads/add`
 * page (Name + Email + Phone + Address + Notes) and posts through the
 * shared intake pipeline via `/api/mobile/contacts/intake`.
 *
 * UX notes:
 *   - Every field has a *visible* label above the input. (Web's
 *     ContactsClient had placeholder-only labels that vanished when
 *     the user typed — see PR #463 for the parallel fix on the web
 *     side. Same lesson applied here pre-emptively.)
 *   - Validation errors from the server's zod schema land in
 *     `addErrors` keyed by field, rendered inline in red below the
 *     offending input.
 *   - HTTP 409 (duplicate match) flips a "Save anyway" inline action
 *     instead of opening a confirm dialog — keeps the flow on one
 *     screen so the agent can decide without losing the entered data.
 *   - Save dispatches haptic feedback (success on add, error on
 *     failure) to match the rest of the app.
 */
export default function NewContactScreen() {
  const router = useRouter();
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("leads");

  const [fields, setFields] = useState({
    name: "",
    email: "",
    phone: "",
    property_address: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [topError, setTopError] = useState<string | null>(null);
  const [duplicateLeadId, setDuplicateLeadId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /**
   * Available-lead queue preview. Mirrors `/dashboard/leads/add` on
   * the web: top N unclaimed leads shown above the manual form, each
   * with a Claim action. When the queue is empty or load fails, the
   * section is hidden entirely so the manual form sits at the top of
   * the screen — same visual as the no-queue web fallback.
   */
  const [queue, setQueue] = useState<QueueLeadRow[]>([]);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchLeadQueue();
      if (cancelled) return;
      setQueueLoaded(true);
      if (res.ok === false) return;
      const rows: QueueLeadRow[] = res.leads.slice(0, QUEUE_PREVIEW_LIMIT).map((l) => ({
        id: String(l.id),
        name: (l.name && l.name.trim()) || `Lead ${l.id}`,
        details: l.property_address || l.email || t("add_contact.queue_no_details"),
        source: l.source || t("add_contact.queue_unknown_source"),
        createdAt: l.created_at,
      }));
      setQueue(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const handleClaim = useCallback(
    async (leadId: string) => {
      if (claiming) return;
      hapticButtonPress();
      setClaiming(leadId);
      setClaimMsg(null);
      const res = await claimQueueLead(leadId);
      if (res.ok === false) {
        hapticError();
        setClaiming(null);
        setClaimMsg(
          res.status === 409
            ? t("add_contact.queue_already_claimed")
            : res.message || t("add_contact.queue_claim_failed"),
        );
        // Drop the now-stale row so the agent doesn't get stuck retrying it.
        if (res.status === 409) {
          setQueue((q) => q.filter((row) => row.id !== leadId));
        }
        return;
      }
      hapticSuccess();
      setClaiming(null);
      router.replace({ pathname: "/lead/[id]", params: { id: res.leadId } });
    },
    [claiming, router, t],
  );

  const setField = useCallback((key: keyof typeof fields, value: string) => {
    setFields((f) => ({ ...f, [key]: value }));
    // Clear that field's error as the user edits — small win that
    // prevents stale red borders after the obvious correction.
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const submit = useCallback(
    async (forceCreate: boolean) => {
      hapticButtonPress();
      setSaving(true);
      setErrors({});
      setTopError(null);

      const payload: CreateMobileContactInput = {
        name: fields.name.trim() || null,
        email: fields.email.trim() || null,
        phone: fields.phone.trim() || null,
        property_address: fields.property_address.trim() || null,
        notes: fields.notes.trim() || null,
        forceCreate,
      };

      const res = await createMobileContact(payload);

      if (res.ok === false) {
        hapticError();
        setSaving(false);
        if (res.status === 400 && res.details) {
          setErrors(res.details);
          setTopError(t("add_contact.validation_failed"));
          return;
        }
        if (res.status === 409 && res.code === "DUPLICATE_CANDIDATE") {
          // Server returned a likely duplicate; surface inline so the
          // agent can confirm with the same data they already typed.
          setDuplicateLeadId(null);
          setTopError(t("add_contact.duplicate_warning"));
          return;
        }
        setTopError(res.message || t("add_contact.validation_failed"));
        return;
      }

      hapticSuccess();
      setSaving(false);
      Alert.alert(t("add_contact.success"));
      // Land on the lead detail screen so the agent can immediately
      // act on the new contact (call, message, schedule, etc.).
      router.replace({ pathname: "/lead/[id]", params: { id: res.leadId } });
    },
    [fields, router, t]
  );

  return (
    <>
      <Stack.Screen options={{ title: t("add_contact.header") }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.intro}>{t("add_contact.intro")}</Text>

          {queueLoaded && queue.length > 0 ? (
            <View style={styles.queueSection}>
              <Text style={styles.sectionLabel}>{t("add_contact.queue_title")}</Text>
              {claimMsg ? (
                <View style={styles.claimMsgBox}>
                  <Text style={styles.claimMsgText}>{claimMsg}</Text>
                </View>
              ) : null}
              {queue.map((lead) => (
                <View key={lead.id} style={styles.queueRow}>
                  <View style={styles.queueRowText}>
                    <Text style={styles.queueName} numberOfLines={1}>
                      {lead.name}
                    </Text>
                    <Text style={styles.queueDetails} numberOfLines={1}>
                      {lead.details} · {lead.source} · {timeAgo(lead.createdAt)}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void handleClaim(lead.id)}
                    disabled={claiming !== null}
                    style={({ pressed }) => [
                      styles.claimBtn,
                      pressed && styles.btnPressed,
                      claiming !== null && styles.btnDisabled,
                    ]}
                  >
                    <Text style={styles.claimBtnText}>
                      {claiming === lead.id
                        ? t("add_contact.queue_claiming")
                        : t("add_contact.queue_claim")}
                    </Text>
                  </Pressable>
                </View>
              ))}
              <View style={styles.queueDivider} />
              <Text style={styles.manualDivider}>{t("add_contact.manual_divider")}</Text>
            </View>
          ) : null}

          {topError ? (
            <View style={styles.topErrorBox}>
              <Text style={styles.topErrorText}>{topError}</Text>
            </View>
          ) : null}

          <Field
            label={t("add_contact.name")}
            value={fields.name}
            onChangeText={(v) => setField("name", v)}
            errors={errors.name}
            tokens={tokens}
            autoCapitalize="words"
            autoComplete="name"
          />
          <Field
            label={t("add_contact.email")}
            value={fields.email}
            onChangeText={(v) => setField("email", v)}
            errors={errors.email}
            tokens={tokens}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <Field
            label={t("add_contact.phone")}
            value={fields.phone}
            onChangeText={(v) => setField("phone", v)}
            errors={errors.phone}
            tokens={tokens}
            keyboardType="phone-pad"
            autoComplete="tel"
          />
          <Field
            label={t("add_contact.address")}
            value={fields.property_address}
            onChangeText={(v) => setField("property_address", v)}
            errors={errors.property_address}
            tokens={tokens}
            autoCapitalize="words"
            autoComplete="street-address"
          />
          <Field
            label={t("add_contact.notes")}
            value={fields.notes}
            onChangeText={(v) => setField("notes", v)}
            errors={errors.notes}
            tokens={tokens}
            multiline
          />

          {topError === t("add_contact.duplicate_warning") ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void submit(true)}
              disabled={saving}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.btnPressed,
                saving && styles.btnDisabled,
              ]}
            >
              <Text style={styles.secondaryBtnText}>{t("add_contact.force_create")}</Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => void submit(false)}
            disabled={saving || (!fields.name.trim() && !fields.email.trim() && !fields.phone.trim())}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && styles.btnPressed,
              (saving || (!fields.name.trim() && !fields.email.trim() && !fields.phone.trim())) && styles.btnDisabled,
            ]}
          >
            {saving ? (
              <ActivityIndicator color={tokens.textOnAccent} />
            ) : (
              <Text style={styles.primaryBtnText}>{t("add_contact.submit")}</Text>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.cancelBtn, pressed && styles.btnPressed]}
          >
            <Text style={styles.cancelBtnText}>{t("add_contact.cancel")}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  errors?: string[];
  tokens: ThemeTokens;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoComplete?:
    | "name"
    | "email"
    | "tel"
    | "street-address"
    | "off";
  keyboardType?: "default" | "email-address" | "phone-pad";
  multiline?: boolean;
};

function Field({
  label,
  value,
  onChangeText,
  errors,
  tokens,
  autoCapitalize,
  autoComplete,
  keyboardType,
  multiline,
}: FieldProps) {
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const hasError = (errors?.length ?? 0) > 0;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={[
          styles.input,
          multiline ? styles.inputMultiline : null,
          hasError ? styles.inputError : null,
        ]}
        autoCapitalize={autoCapitalize ?? "sentences"}
        autoComplete={autoComplete}
        keyboardType={keyboardType ?? "default"}
        multiline={multiline}
        placeholderTextColor={tokens.textSubtle}
      />
      {hasError ? (
        <Text style={styles.fieldError}>{errors!.join(" ")}</Text>
      ) : null}
    </View>
  );
}

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.bg },
    scrollContent: { padding: 16, paddingBottom: 48 },
    intro: {
      fontSize: 13,
      color: theme.textMuted,
      marginBottom: 16,
      lineHeight: 18,
    },
    queueSection: { marginBottom: 18 },
    sectionLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: theme.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    queueRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 8,
    },
    queueRowText: { flex: 1, minWidth: 0 },
    queueName: { fontSize: 14, fontWeight: "600", color: theme.text },
    queueDetails: { fontSize: 12, color: theme.textSubtle, marginTop: 2 },
    claimBtn: {
      marginLeft: 10,
      backgroundColor: theme.accent,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      minWidth: 64,
      alignItems: "center",
    },
    claimBtnText: {
      color: theme.textOnAccent,
      fontSize: 12,
      fontWeight: "700",
    },
    claimMsgBox: {
      backgroundColor: theme.infoBg,
      borderWidth: 1,
      borderColor: theme.infoBorder,
      borderRadius: 10,
      padding: 10,
      marginBottom: 10,
    },
    claimMsgText: { color: theme.infoTextDeep, fontSize: 13, lineHeight: 18 },
    queueDivider: {
      height: 1,
      backgroundColor: theme.border,
      marginTop: 8,
      marginBottom: 10,
    },
    manualDivider: {
      textAlign: "center",
      fontSize: 11,
      color: theme.textSubtle,
      marginBottom: 4,
    },
    topErrorBox: {
      backgroundColor: theme.dangerBg,
      borderWidth: 1,
      borderColor: theme.dangerBorder,
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
    },
    topErrorText: { color: theme.dangerText, fontSize: 13, lineHeight: 18 },
    field: { marginBottom: 14 },
    label: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.textMuted,
      marginBottom: 6,
    },
    input: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: theme.text,
      minHeight: 48,
    },
    inputMultiline: {
      minHeight: 96,
      textAlignVertical: "top",
      paddingTop: 12,
    },
    inputError: { borderColor: theme.dangerBorder },
    fieldError: {
      marginTop: 4,
      fontSize: 12,
      color: theme.dangerText,
    },
    primaryBtn: {
      marginTop: 16,
      backgroundColor: theme.accent,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 48,
    },
    primaryBtnText: {
      color: theme.textOnAccent,
      fontSize: 16,
      fontWeight: "700",
    },
    secondaryBtn: {
      marginTop: 12,
      backgroundColor: theme.warningBg,
      borderWidth: 1,
      borderColor: theme.warningBorder,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 44,
    },
    secondaryBtnText: {
      color: theme.warningText,
      fontSize: 14,
      fontWeight: "700",
    },
    cancelBtn: {
      marginTop: 12,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 44,
    },
    cancelBtnText: { color: theme.textMuted, fontSize: 14, fontWeight: "600" },
    btnPressed: { opacity: 0.7 },
    btnDisabled: { opacity: 0.5 },
  });
