import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BrandRefreshControl } from "../../components/BrandRefreshControl";
import { ErrorBanner } from "../../components/ErrorBanner";
import { FadeIn } from "../../components/Reveal";
import { ScreenLoading } from "../../components/ScreenLoading";
import {
  fetchMobileShowingDetail,
  updateMobileShowingStatus,
  upsertMobileShowingFeedback,
  type MobileApiFailure,
  type MobileShowingDetail,
  type MobileShowingFeedback,
  type MobileShowingFeedbackInput,
  type MobileShowingListItem,
  type MobileShowingReaction,
  type MobileShowingStatus,
} from "../../lib/closeBossMobileApi";
import { useCachedFetch } from "../../lib/offline/useCachedFetch";
import {
  hapticButtonPress,
  hapticError,
  hapticSelectionChange,
  hapticSuccess,
} from "../../lib/haptics";
import { useThemeTokens } from "../../lib/useThemeTokens";
import type { ThemeTokens } from "../../lib/theme";

/**
 * Status / reaction option ids — labels resolve per-render via
 * `t(`status.${value}`)` and `t(`detail.reactions.${value}`)` so a
 * locale flip re-renders the picker without an app restart.
 */
const STATUS_OPTION_VALUES: MobileShowingStatus[] = [
  "scheduled",
  "attended",
  "cancelled",
  "no_show",
];

const REACTION_OPTIONS: Array<{ value: MobileShowingReaction; emoji: string }> = [
  { value: "love", emoji: "❤️" },
  { value: "like", emoji: "👍" },
  { value: "maybe", emoji: "🤔" },
  { value: "pass", emoji: "👎" },
];

/**
 * Showing detail + feedback capture. Mirrors the web
 * /dashboard/showings/[id] flow but tuned for one-handed agent use
 * after a property tour:
 *
 *  1. Status picker — flip Scheduled → Attended once the buyer
 *     actually walked the property. PATCHes immediately so the
 *     list view's filter chips stay accurate.
 *  2. Property card — address + date/time + MLS + access notes,
 *     read-only here. Edits happen on the web for now.
 *  3. Feedback block (revealed once status is "attended") —
 *     reaction emoji, would-offer toggle, three concern checkboxes,
 *     pros/cons/notes free-text. Saved via PUT on blur of the
 *     "Save feedback" button rather than per-keystroke; agents
 *     usually fill this once standing in the driveway.
 *
 * No write queue (offline replay) yet — the dashboard service
 * doesn't have an offline path for showings, so we surface the
 * API failure inline. The list screen reads from cache and stays
 * usable; this screen just fails the save.
 */
export default function ShowingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const showingId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : "";

  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t, i18n } = useTranslation("showings_screen");

  const fetcher = useCallback(async (): Promise<MobileShowingDetail | MobileApiFailure> => {
    if (!showingId) {
      return { ok: false, status: 0, message: t("detail.errors.missing_id") };
    }
    const res = await fetchMobileShowingDetail(showingId);
    if (res.ok === false) return res;
    return {
      showing: res.showing,
      feedback: res.feedback,
      contactName: res.contactName,
    };
  }, [showingId, t]);

  const { data, loading, error, refresh } = useCachedFetch<MobileShowingDetail>(
    `showing:${showingId}`,
    fetcher,
    { enabled: Boolean(showingId) },
  );

  // Local mirror of server state — needed because we PATCH/PUT to
  // partial endpoints and want to update a chip immediately rather
  // than wait for a refetch.
  const [showing, setShowing] = useState<MobileShowingListItem | null>(null);
  const [feedback, setFeedback] = useState<MobileShowingFeedback | null>(null);
  const [contactName, setContactName] = useState<string | null>(null);

  // Form state — initialized from feedback when it loads, then
  // tracked locally as the agent fills in the form.
  const [reaction, setReaction] = useState<MobileShowingReaction | null>(null);
  const [wouldOffer, setWouldOffer] = useState<boolean | null>(null);
  const [priceConcerns, setPriceConcerns] = useState(false);
  const [locationConcerns, setLocationConcerns] = useState(false);
  const [conditionConcerns, setConditionConcerns] = useState(false);
  const [pros, setPros] = useState("");
  const [cons, setCons] = useState("");
  const [notes, setNotes] = useState("");

  const [statusBusy, setStatusBusy] = useState<MobileShowingStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSavedAt, setFeedbackSavedAt] = useState<number | null>(null);

  // Hydrate local state from cache/refetch.
  useEffect(() => {
    if (!data) return;
    setShowing(data.showing);
    setFeedback(data.feedback);
    setContactName(data.contactName ?? data.showing.contact_name ?? null);
    if (data.feedback) {
      setReaction(data.feedback.overall_reaction);
      setWouldOffer(data.feedback.would_offer);
      setPriceConcerns(Boolean(data.feedback.price_concerns));
      setLocationConcerns(Boolean(data.feedback.location_concerns));
      setConditionConcerns(Boolean(data.feedback.condition_concerns));
      setPros(data.feedback.pros ?? "");
      setCons(data.feedback.cons ?? "");
      setNotes(data.feedback.notes ?? "");
    }
  }, [data]);

  const onPickStatus = useCallback(
    async (next: MobileShowingStatus) => {
      if (!showing || statusBusy || showing.status === next) return;
      hapticSelectionChange();
      setStatusError(null);
      setStatusBusy(next);
      const res = await updateMobileShowingStatus(showing.id, next);
      setStatusBusy(null);
      if (res.ok === false) {
        hapticError();
        setStatusError(res.message);
        return;
      }
      hapticSuccess();
      setShowing(res.showing);
    },
    [showing, statusBusy],
  );

  const onSaveFeedback = useCallback(async () => {
    if (!showing) return;
    hapticButtonPress();
    setFeedbackError(null);
    setFeedbackSaving(true);
    const input: MobileShowingFeedbackInput = {
      ...(reaction ? { overall_reaction: reaction } : {}),
      ...(wouldOffer !== null ? { would_offer: wouldOffer } : {}),
      price_concerns: priceConcerns,
      location_concerns: locationConcerns,
      condition_concerns: conditionConcerns,
      pros: pros.trim(),
      cons: cons.trim(),
      notes: notes.trim(),
    };
    const res = await upsertMobileShowingFeedback(showing.id, input);
    setFeedbackSaving(false);
    if (res.ok === false) {
      hapticError();
      setFeedbackError(res.message);
      return;
    }
    hapticSuccess();
    setFeedback(res.feedback);
    setFeedbackSavedAt(Date.now());
  }, [
    showing,
    reaction,
    wouldOffer,
    priceConcerns,
    locationConcerns,
    conditionConcerns,
    pros,
    cons,
    notes,
  ]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/showings");
  }, [router]);

  if (loading && !showing) {
    return <ScreenLoading message={t("detail.loading")} />;
  }

  if (error && !showing) {
    return (
      <View style={styles.errorWrap}>
        <Stack.Screen options={{ title: t("detail.title"), headerBackTitle: t("detail.back") }} />
        <ErrorBanner
          title={t("detail.errors.load_title")}
          message={error.message || t("detail.errors.unknown")}
          onRetry={refresh}
        />
      </View>
    );
  }

  if (!showing) {
    return (
      <View style={styles.errorWrap}>
        <Stack.Screen options={{ title: t("detail.title"), headerBackTitle: t("detail.back") }} />
        <ErrorBanner
          title={t("detail.errors.not_found_title")}
          message={t("detail.errors.not_found_body")}
          onRetry={goBack}
          retryLabel={t("detail.errors.back_to_list")}
        />
      </View>
    );
  }

  const when = formatWhen(showing.scheduled_at, i18n.language, t);
  const showFeedbackBlock = showing.status === "attended" || feedback != null;

  return (
    <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <Stack.Screen
        options={{
          title: t("detail.title"),
          headerBackTitle: t("detail.back"),
        }}
      />
      <FadeIn style={styles.flex}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={<BrandRefreshControl refreshing={loading} onRefresh={refresh} />}
        >
          {/* Hero / property card */}
          <View style={styles.hero}>
            <Text style={styles.address} numberOfLines={2}>
              {showing.property_address}
            </Text>
            {showing.city || showing.state || showing.zip ? (
              <Text style={styles.cityLine}>
                {[showing.city, showing.state, showing.zip].filter(Boolean).join(", ")}
              </Text>
            ) : null}
            <Text style={styles.whenLine}>{when}</Text>
            {contactName ? (
              <Text style={styles.contactLine}>{t("detail.contact_with", { name: contactName })}</Text>
            ) : null}
            {showing.mls_number ? (
              <Text style={styles.mlsLine}>{t("detail.mls_label", { number: showing.mls_number })}</Text>
            ) : null}
            {showing.access_notes ? (
              <View style={styles.accessNotes}>
                <Ionicons name="key-outline" size={14} color={tokens.textMuted} />
                <Text style={styles.accessNotesText}>{showing.access_notes}</Text>
              </View>
            ) : null}
            {showing.notes ? (
              <View style={styles.accessNotes}>
                <Ionicons name="document-text-outline" size={14} color={tokens.textMuted} />
                <Text style={styles.accessNotesText}>{showing.notes}</Text>
              </View>
            ) : null}
          </View>

          {/* Status picker */}
          <Text style={styles.sectionHeading}>{t("detail.section_status")}</Text>
          <View style={styles.statusGrid}>
            {STATUS_OPTION_VALUES.map((value) => {
              const active = showing.status === value;
              const busy = statusBusy === value;
              const label = t(`status.${value}`);
              return (
                <Pressable
                  key={value}
                  onPress={() => void onPickStatus(value)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={t("detail.status_a11y", { label })}
                  accessibilityState={{ selected: active, disabled: busy }}
                  style={({ pressed }) => [
                    styles.statusBtn,
                    active && styles.statusBtnActive,
                    pressed && styles.statusBtnPressed,
                  ]}
                >
                  <Text style={[styles.statusBtnText, active && styles.statusBtnTextActive]}>
                    {busy ? t("detail.status_saving") : label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {statusError ? <Text style={styles.inlineError}>{statusError}</Text> : null}

          {/* Quick contact actions */}
          <View style={styles.quickRow}>
            <ContactActionButton
              icon="call-outline"
              label={t("detail.quick.call")}
              styles={styles}
              tokens={tokens}
              onPress={() => {
                hapticButtonPress();
                // Hand off to dialler — the contact phone number lives on the
                // lead record, not the showing row, so we route through the
                // lead detail screen rather than building a half-baked tel: link
                // from a missing number.
                router.push({ pathname: "/lead/[id]", params: { id: showing.contact_id } });
              }}
            />
            <ContactActionButton
              icon="chatbubble-outline"
              label={t("detail.quick.open")}
              styles={styles}
              tokens={tokens}
              onPress={() => {
                hapticButtonPress();
                router.push({ pathname: "/lead/[id]", params: { id: showing.contact_id } });
              }}
            />
            <ContactActionButton
              icon="map-outline"
              label={t("detail.quick.directions")}
              styles={styles}
              tokens={tokens}
              onPress={() => {
                hapticButtonPress();
                const q = encodeURIComponent(
                  [
                    showing.property_address,
                    showing.city,
                    showing.state,
                    showing.zip,
                  ]
                    .filter(Boolean)
                    .join(", "),
                );
                const url =
                  Platform.OS === "ios"
                    ? `http://maps.apple.com/?q=${q}`
                    : `https://www.google.com/maps/search/?api=1&query=${q}`;
                void Linking.openURL(url);
              }}
            />
          </View>

          {/* Feedback section — only meaningful once the showing actually
              happened. Hiding it for scheduled/cancelled keeps the screen
              focused and cuts the chance the agent fills it out for the
              wrong record. */}
          {showFeedbackBlock ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.sectionHeading}>{t("detail.feedback.section_title")}</Text>

              <Text style={styles.label}>{t("detail.feedback.overall_reaction")}</Text>
              <View style={styles.reactionRow}>
                {REACTION_OPTIONS.map((r) => {
                  const active = reaction === r.value;
                  const label = t(`detail.reactions.${r.value}`);
                  return (
                    <Pressable
                      key={r.value}
                      onPress={() => {
                        hapticSelectionChange();
                        setReaction(active ? null : r.value);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        styles.reactionBtn,
                        active && styles.reactionBtnActive,
                        pressed && styles.reactionBtnPressed,
                      ]}
                    >
                      <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                      <Text
                        style={[
                          styles.reactionLabel,
                          active && styles.reactionLabelActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>{t("detail.feedback.ready_to_offer")}</Text>
              <View style={styles.offerRow}>
                {[
                  { value: true, key: "yes" as const },
                  { value: false, key: "no" as const },
                ].map((o) => {
                  const active = wouldOffer === o.value;
                  const label = t(`detail.feedback.${o.key}`);
                  return (
                    <Pressable
                      key={String(o.value)}
                      onPress={() => {
                        hapticSelectionChange();
                        setWouldOffer(active ? null : o.value);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t("detail.feedback.would_offer_a11y", { label })}
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        styles.offerBtn,
                        active && styles.offerBtnActive,
                        pressed && styles.offerBtnPressed,
                      ]}
                    >
                      <Text style={[styles.offerText, active && styles.offerTextActive]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>{t("detail.feedback.concerns")}</Text>
              <View style={styles.checkboxColumn}>
                <ConcernCheckbox
                  label={t("detail.feedback.concern_price")}
                  checked={priceConcerns}
                  onChange={setPriceConcerns}
                  styles={styles}
                  tokens={tokens}
                />
                <ConcernCheckbox
                  label={t("detail.feedback.concern_location")}
                  checked={locationConcerns}
                  onChange={setLocationConcerns}
                  styles={styles}
                  tokens={tokens}
                />
                <ConcernCheckbox
                  label={t("detail.feedback.concern_condition")}
                  checked={conditionConcerns}
                  onChange={setConditionConcerns}
                  styles={styles}
                  tokens={tokens}
                />
              </View>

              <Text style={styles.label}>{t("detail.feedback.pros")}</Text>
              <TextInput
                multiline
                value={pros}
                onChangeText={setPros}
                placeholder={t("detail.feedback.pros_placeholder")}
                placeholderTextColor={tokens.textSubtle}
                style={styles.textArea}
              />

              <Text style={styles.label}>{t("detail.feedback.cons")}</Text>
              <TextInput
                multiline
                value={cons}
                onChangeText={setCons}
                placeholder={t("detail.feedback.cons_placeholder")}
                placeholderTextColor={tokens.textSubtle}
                style={styles.textArea}
              />

              <Text style={styles.label}>{t("detail.feedback.notes")}</Text>
              <TextInput
                multiline
                value={notes}
                onChangeText={setNotes}
                placeholder={t("detail.feedback.notes_placeholder")}
                placeholderTextColor={tokens.textSubtle}
                style={styles.textArea}
              />

              {feedbackError ? <Text style={styles.inlineError}>{feedbackError}</Text> : null}
              {feedbackSavedAt && !feedbackError ? (
                <Text style={styles.inlineSaved}>{t("detail.feedback.saved")}</Text>
              ) : null}

              <Pressable
                onPress={() => void onSaveFeedback()}
                disabled={feedbackSaving}
                accessibilityRole="button"
                accessibilityLabel={t("detail.feedback.save_a11y")}
                accessibilityState={{ disabled: feedbackSaving }}
                style={({ pressed }) => [
                  styles.saveBtn,
                  pressed && styles.saveBtnPressed,
                  feedbackSaving && styles.saveBtnDisabled,
                ]}
              >
                <Text style={styles.saveBtnText}>
                  {feedbackSaving ? t("detail.feedback.saving") : t("detail.feedback.save")}
                </Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.feedbackHint}>
              <Text style={styles.feedbackHintText}>{t("detail.feedback.hint_attend_first")}</Text>
            </View>
          )}
        </ScrollView>
      </FadeIn>
    </KeyboardAvoidingView>
  );
}

function ContactActionButton({
  icon,
  label,
  onPress,
  styles,
  tokens,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  tokens: ThemeTokens;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.quickBtn, pressed && styles.quickBtnPressed]}
    >
      <Ionicons name={icon} size={18} color={tokens.accent} />
      <Text style={styles.quickBtnText}>{label}</Text>
    </Pressable>
  );
}

function ConcernCheckbox({
  label,
  checked,
  onChange,
  styles,
  tokens,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  styles: ReturnType<typeof createStyles>;
  tokens: ThemeTokens;
}) {
  return (
    <Pressable
      onPress={() => {
        hapticSelectionChange();
        onChange(!checked);
      }}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      style={({ pressed }) => [styles.checkboxRow, pressed && styles.checkboxRowPressed]}
    >
      <View style={[styles.checkboxBox, checked && styles.checkboxBoxChecked]}>
        {checked ? <Ionicons name="checkmark" size={14} color={tokens.textOnAccent} /> : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

type ShowingsT = (key: string, options?: Record<string, unknown>) => string;

/**
 * Detail-page "when" formatter — different from the list view's
 * compressed format because the hero card has room for the full
 * "Monday, May 12 · 3:00 PM" line. `t` resolves the "Date TBD"
 * fallback in the active locale.
 */
function formatWhen(iso: string | null | undefined, locale: string, t: ShowingsT): string {
  if (!iso) return t("when.tbd");
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return t("when.tbd");
  return `${d.toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })} · ${d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}`;
}

function createStyles(t: ThemeTokens) {
  return StyleSheet.create({
    flex: { flex: 1 },
    kav: { flex: 1, backgroundColor: t.bg },
    scrollContent: { padding: 16, paddingBottom: 48 },
    errorWrap: { flex: 1, backgroundColor: t.bg, padding: 16, justifyContent: "flex-start" },

    hero: {
      backgroundColor: t.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: t.border,
      marginBottom: 16,
    },
    address: { fontSize: 18, fontWeight: "700", color: t.text },
    cityLine: { marginTop: 4, fontSize: 13, color: t.textMuted },
    whenLine: { marginTop: 10, fontSize: 14, fontWeight: "600", color: t.text },
    contactLine: { marginTop: 4, fontSize: 13, color: t.textMuted },
    mlsLine: { marginTop: 4, fontSize: 12, color: t.textSubtle, fontVariant: ["tabular-nums"] },
    accessNotes: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 6,
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border,
    },
    accessNotesText: { flex: 1, fontSize: 13, color: t.textMuted, lineHeight: 18 },

    sectionHeading: {
      fontSize: 12,
      fontWeight: "800",
      color: t.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 8,
    },

    statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    statusBtn: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
      minHeight: 40,
      justifyContent: "center",
    },
    statusBtnActive: {
      backgroundColor: t.chipActiveBg,
      borderColor: t.chipActiveBorder,
    },
    statusBtnPressed: { opacity: 0.85 },
    statusBtnText: { fontSize: 13, fontWeight: "600", color: t.text },
    statusBtnTextActive: { color: t.chipActiveText },

    inlineError: {
      marginTop: 8,
      fontSize: 13,
      color: t.dangerTitle,
    },
    inlineSaved: {
      marginTop: 8,
      fontSize: 13,
      color: t.successTextDark,
    },

    quickRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 16,
    },
    quickBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
      minHeight: 44,
    },
    quickBtnPressed: { backgroundColor: t.surfaceMuted },
    quickBtnText: { fontSize: 13, fontWeight: "600", color: t.text },

    divider: {
      height: 1,
      backgroundColor: t.border,
      marginVertical: 24,
    },

    label: {
      marginTop: 12,
      marginBottom: 6,
      fontSize: 13,
      fontWeight: "600",
      color: t.text,
    },

    reactionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    reactionBtn: {
      flexBasis: "48%",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
    },
    reactionBtnActive: {
      borderColor: t.accent,
      backgroundColor: t.accentPressed,
    },
    reactionBtnPressed: { opacity: 0.85 },
    reactionEmoji: { fontSize: 22 },
    reactionLabel: { fontSize: 13, fontWeight: "600", color: t.text },
    reactionLabelActive: { color: t.accent },

    offerRow: { flexDirection: "row", gap: 8 },
    offerBtn: {
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
    offerBtnActive: {
      borderColor: t.accent,
      backgroundColor: t.accentPressed,
    },
    offerBtnPressed: { opacity: 0.85 },
    offerText: { fontSize: 14, fontWeight: "600", color: t.text },
    offerTextActive: { color: t.accent },

    checkboxColumn: { gap: 4 },
    checkboxRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 8,
      minHeight: 40,
    },
    checkboxRowPressed: { opacity: 0.7 },
    checkboxBox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: t.border,
      backgroundColor: t.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxBoxChecked: {
      backgroundColor: t.accent,
      borderColor: t.accent,
    },
    checkboxLabel: { fontSize: 14, color: t.text },

    textArea: {
      minHeight: 80,
      textAlignVertical: "top",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
      padding: 12,
      fontSize: 14,
      color: t.text,
    },

    saveBtn: {
      marginTop: 20,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: t.accent,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 48,
    },
    saveBtnPressed: { opacity: 0.85 },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: { fontSize: 15, fontWeight: "700", color: t.textOnAccent },

    feedbackHint: {
      marginTop: 16,
      padding: 12,
      borderRadius: 12,
      backgroundColor: t.infoBgAlt,
      borderWidth: 1,
      borderColor: t.infoBorder,
    },
    feedbackHintText: { fontSize: 13, color: t.infoText, lineHeight: 18 },
  });
}
