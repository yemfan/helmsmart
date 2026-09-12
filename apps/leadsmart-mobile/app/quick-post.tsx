import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import {
  createMobileRecurringPost,
  fetchMobileConnections,
  fetchMobileQuickPostDraft,
  fetchMobileSubjects,
  lookupMobileProperty,
  publishMobileQuickPost,
  scheduleMobileQuickPost,
  uploadMobileMedia,
  type MobileConnection,
  type MobileMediaItem,
  type MobilePropertyLookupResult,
  type MobileQuickPostPlatform,
  type MobileQuickPostTrigger,
  type MobileSubject,
} from "../lib/closeBossMobileApi";
import {
  hapticButtonPress,
  hapticError,
  hapticSuccess,
} from "../lib/haptics";
import { useThemeTokens } from "../lib/useThemeTokens";
import type { ThemeTokens } from "../lib/theme";

/**
 * Mobile Quick Post — Phase 2 (direct publish + draft).
 *
 * The agent picks a trigger ("New listing", "Open house", …),
 * picks a target platform, types a short brief, and taps
 * Generate. Claude returns a platform-aware caption + hashtags
 * that the agent can publish directly (when a Meta Page is
 * connected) or Share/Copy into the native app (LinkedIn / X, or
 * any platform without a connection).
 *
 * Direct publish path:
 *   - Hits /api/mobile/leads-gen/publish via shared `publishPost`
 *     helper. Same surface area as the web wizard's Publish
 *     button — supports FB Page feed (text-only or text+image)
 *     and IG Business (requires image).
 *   - On mobile, no media picker yet → IG falls back to
 *     Share/Copy; FB allows text-only direct publish.
 *
 * Connection management: a "Connect Facebook" link routes to the
 * connect-platforms screen which runs the OAuth deep-link round
 * trip. Once connected, the publish button replaces the
 * Share/Copy CTA inline.
 */

type TriggerOption = {
  id: MobileQuickPostTrigger;
  icon: keyof typeof Ionicons.glyphMap;
};

/**
 * Trigger pill order + icons. Labels resolve at render time via
 * `t("trigger_options.<id>")` so they translate when the agent
 * flips locale without reloading the screen.
 */
const TRIGGERS: TriggerOption[] = [
  { id: "new_listing", icon: "home-outline" },
  { id: "open_house", icon: "calendar-outline" },
  { id: "price_drop", icon: "trending-down-outline" },
  { id: "just_sold", icon: "trophy-outline" },
  { id: "market_update", icon: "stats-chart-outline" },
  { id: "testimonial", icon: "chatbox-ellipses-outline" },
  { id: "custom", icon: "sparkles-outline" },
  { id: "by_address", icon: "link-outline" },
];

type PlatformOption = {
  id: MobileQuickPostPlatform;
  label: string;
};

const PLATFORMS: PlatformOption[] = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X" },
];

export default function QuickPostScreen() {
  const tokens = useThemeTokens();
  const router = useRouter();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("quick_post");

  // Optional deep-link params from the Home "Suggested next post"
  // card. When present, we pre-select the trigger + auto-pick the
  // CRM subject so the agent lands on a ready-to-edit brief.
  const params = useLocalSearchParams<{
    trigger?: string;
    subjectId?: string;
  }>();
  const initialTrigger: MobileQuickPostTrigger = (() => {
    const t = params.trigger;
    if (
      t === "new_listing" ||
      t === "open_house" ||
      t === "price_drop" ||
      t === "just_sold" ||
      t === "market_update" ||
      t === "testimonial" ||
      t === "custom" ||
      t === "by_address"
    ) {
      return t;
    }
    return "new_listing";
  })();

  const [trigger, setTrigger] =
    useState<MobileQuickPostTrigger>(initialTrigger);
  const [platform, setPlatform] = useState<MobileQuickPostPlatform>("facebook");
  const [brief, setBrief] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

  // CRM subject picker. Fetched on-demand the first time the agent
  // taps "Pick from your <listings | open houses | …>". Tapping a
  // subject pre-fills the brief with the subject's address + sub-
  // label so the agent doesn't have to retype it on a phone
  // keyboard. Synthetic triggers (custom / market_update /
  // testimonial) skip the picker entirely — their "subject" is
  // always the brief itself.
  const [subjects, setSubjects] = useState<MobileSubject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [pickedSubjectId, setPickedSubjectId] = useState<string | null>(null);

  // Connection state — fetched once on mount. When a Meta Page is
  // connected, the action row shows "Publish to Facebook"; when a
  // LinkedIn member is connected, "Publish to LinkedIn". Empty list
  // → fall back to Share/Copy.
  const [connections, setConnections] = useState<MobileConnection[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<
    | {
        ok: true;
        externalPostUrl: string | null;
        platform: "facebook" | "instagram" | "linkedin";
      }
    | { ok: false; error: string }
    | null
  >(null);

  // Image attachment state. The agent picks from camera or library,
  // we upload to media_library on selection, and pass the resulting
  // media id to publishMobileQuickPost. Persists across platform-tab
  // switches because the same image works for FB / IG / LinkedIn / X.
  const [media, setMedia] = useState<MobileMediaItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // by_address trigger — the agent pastes an address or a listing
  // URL (Zillow / Redfin / MLS / Compass), we hit
  // /api/mobile/leads-gen/lookup-property, and pre-fill the brief
  // with a stitched-together property summary the AI can use. The
  // brief textarea remains editable after the lookup lands.
  const [lookupInput, setLookupInput] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] =
    useState<MobilePropertyLookupResult | null>(null);

  // Publish mode — three mutually-exclusive paths for the action
  // button: post now / queue for later / make recurring. Mode picker
  // lives above the image section once a draft exists.
  type Mode = "now" | "schedule" | "recurring";
  const [mode, setMode] = useState<Mode>("now");

  // Schedule state — datetime defaults to tomorrow 9am local. The
  // picker mutates `scheduledAt` in place; we send the resulting ISO
  // to /api/mobile/leads-gen/schedule.
  const [scheduledAt, setScheduledAt] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  });
  const [showSchedulePicker, setShowSchedulePicker] = useState<
    "date" | "time" | null
  >(null);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleResult, setScheduleResult] = useState<
    | { ok: true; scheduledFor: string }
    | { ok: false; error: string }
    | null
  >(null);

  // Recurring config. Same shape as the web wizard — cadence (daily
  // or weekly), HH:MM, optional day-of-week (for weekly), optional
  // max occurrences. Timezone auto-detected from the device.
  const [recurringCadence, setRecurringCadence] = useState<
    "daily" | "weekly"
  >("weekly");
  const [recurringWeekday, setRecurringWeekday] = useState(1); // Monday
  const [recurringTime, setRecurringTime] = useState<Date>(() => {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    return d;
  });
  const [showRecurringTimePicker, setShowRecurringTimePicker] = useState(false);
  const [recurringMax, setRecurringMax] = useState<string>("12");
  const recurringTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);
  const [creatingRecurring, setCreatingRecurring] = useState(false);
  const [recurringResult, setRecurringResult] = useState<
    | { ok: true; recurringScheduleId: string; nextOccurrenceAt: string }
    | { ok: false; error: string }
    | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMobileConnections().then((res) => {
      if (cancelled) return;
      if (res.ok === true) setConnections(res.connections);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Which platforms the agent can publish directly to right now.
  //   - Facebook  : Meta connection (image optional)
  //   - Instagram : Meta connection + IG Business + image attached
  //   - LinkedIn  : LinkedIn connection (image optional)
  //   - X         : no direct publish path; Share/Copy only
  const fbConnection = useMemo(
    () =>
      connections.find((c) => c.platform === "meta" && c.canPublishFacebook) ??
      null,
    [connections],
  );
  const igConnection = useMemo(
    () =>
      connections.find(
        (c) => c.platform === "meta" && c.canPublishInstagram,
      ) ?? null,
    [connections],
  );
  const linkedinConnection = useMemo(
    () =>
      connections.find(
        (c) => c.platform === "linkedin" && c.canPublishLinkedIn,
      ) ?? null,
    [connections],
  );
  const activeDirectPublishConnection =
    platform === "facebook"
      ? fbConnection
      : platform === "instagram"
        ? igConnection
        : platform === "linkedin"
          ? linkedinConnection
          : null;
  // IG also requires an attached image — if the connection's there
  // but no image is set, hide the button and the helper text below
  // nudges the agent to attach one.
  const canDirectPublish =
    activeDirectPublishConnection !== null &&
    (platform !== "instagram" || media !== null);

  // Which triggers benefit from the CRM subject picker. Custom +
  // market_update + testimonial don't anchor on a listing — the
  // brief IS the subject — so we hide the picker for those.
  const triggerAllowsSubjects =
    trigger === "new_listing" ||
    trigger === "open_house" ||
    trigger === "price_drop" ||
    trigger === "just_sold";

  // Picked subject — derive its kind + refId for attribution. The
  // publish / schedule / recurring payloads carry these so the
  // lead_posts row links back to the originating CRM record.
  const pickedSubject = useMemo(
    () => subjects.find((s) => s.id === pickedSubjectId) ?? null,
    [subjects, pickedSubjectId],
  );

  const openSubjectPicker = useCallback(async () => {
    hapticButtonPress();
    setShowSubjectPicker(true);
    if (subjects.length > 0) return; // already loaded for this trigger
    setSubjectsLoading(true);
    setSubjectsError(null);
    const res = await fetchMobileSubjects(trigger);
    setSubjectsLoading(false);
    if (res.ok === false) {
      setSubjectsError(res.message);
      return;
    }
    setSubjects(res.subjects);
  }, [trigger, subjects.length]);

  const onPickSubject = useCallback((s: MobileSubject) => {
    hapticButtonPress();
    setPickedSubjectId(s.id);
    setShowSubjectPicker(false);
    // Pre-fill the brief with the subject's label + sub-label. The
    // model has been told to never invent facts, so concrete details
    // here translate into a much better caption than the agent
    // typing them from memory.
    const lines = [s.label.trim()];
    if (s.sub?.trim()) lines.push(s.sub.trim());
    setBrief(lines.join(" · "));
    setGenerated(false);
  }, []);

  // Deep-link auto-pick. When the Home "Suggested next post" card
  // navigates here with ?trigger=…&subjectId=…, fetch the matching
  // subject from the CRM and pre-fill the brief. Runs once on mount.
  // We do NOT re-trigger when the agent manually changes triggers —
  // the deep-link's intent is honored exactly once.
  useEffect(() => {
    const linkedSubjectId = params.subjectId;
    if (!linkedSubjectId) return;
    const linkedTrigger = params.trigger;
    if (
      linkedTrigger !== "new_listing" &&
      linkedTrigger !== "open_house" &&
      linkedTrigger !== "price_drop" &&
      linkedTrigger !== "just_sold"
    ) {
      // Synthetic triggers don't anchor on a CRM subject — nothing to auto-pick.
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await fetchMobileSubjects(linkedTrigger);
      if (cancelled || res.ok === false) return;
      const match = res.subjects.find((s) => s.id === linkedSubjectId);
      if (!match) return;
      setSubjects(res.subjects);
      onPickSubject(match);
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally omit deps — this is a deep-link initializer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * by_address — resolve a raw address or listing URL into a brief
   * the AI can ground on. On hit, replaces the brief textarea with
   * a stitched-together "Property: … / Specs: … / Estimated value:
   * …" string. On miss, still writes a normalized address brief so
   * the agent can edit + generate without losing what they typed.
   */
  const onLookupAddress = useCallback(async () => {
    const input = lookupInput.trim();
    if (input.length < 3) {
      setLookupError(t("lookup.error_too_short"));
      hapticError();
      return;
    }
    hapticButtonPress();
    setLookupBusy(true);
    setLookupError(null);
    const res = await lookupMobileProperty(input);
    setLookupBusy(false);
    if (res.ok === false) {
      hapticError();
      setLookupError(res.message);
      return;
    }
    hapticSuccess();
    setLookupResult(res.result);
    setBrief(res.result.brief);
    setGenerated(false);
  }, [lookupInput, t]);

  // Reset the picker state when the agent flips triggers — the
  // listing-anchored subjects don't make sense for a different
  // trigger. Also drop any cached by_address lookup result so the
  // brief textarea doesn't keep stale property details after the
  // agent switches away from "By address / URL".
  useEffect(() => {
    setSubjects([]);
    setPickedSubjectId(null);
    setSubjectsError(null);
    setLookupInput("");
    setLookupError(null);
    setLookupResult(null);
  }, [trigger]);

  const onGenerate = useCallback(async () => {
    const trimmed = brief.trim();
    if (!trimmed) {
      setError(
        trigger === "by_address"
          ? t("generate.errors.brief_required_by_address")
          : trigger === "custom" ||
              trigger === "market_update" ||
              trigger === "testimonial"
            ? t("generate.errors.brief_required_synthetic")
            : t("generate.errors.brief_required_default"),
      );
      hapticError();
      return;
    }
    hapticButtonPress();
    setBusy(true);
    setError(null);
    const res = await fetchMobileQuickPostDraft({
      trigger,
      platform,
      brief: trimmed,
    });
    setBusy(false);
    if (res.ok === false) {
      hapticError();
      setError(res.message);
      return;
    }
    hapticSuccess();
    setCaption(res.caption);
    setHashtags(res.hashtags);
    setGenerated(true);
  }, [trigger, platform, brief, t]);

  const onShare = useCallback(async () => {
    if (!caption) return;
    hapticButtonPress();
    // Per-platform: IG already gets hashtags inlined by the model.
    // For FB/LinkedIn/X, append the hashtag tokens at the end so the
    // single payload includes everything the agent might want to share.
    const inlineTags =
      platform === "instagram" || hashtags.length === 0
        ? ""
        : `\n\n${hashtags.map((t) => `#${t.replace(/^#/, "")}`).join(" ")}`;
    try {
      // Native Share sheet — gives the agent Copy + per-app share
      // (Messages, FB app, IG, etc.) in one tap. Avoids pulling
      // expo-clipboard as a native dependency.
      await Share.share({ message: caption + inlineTags });
      hapticSuccess();
    } catch {
      hapticError();
      Alert.alert(t("share.fail_title"), t("share.fail_body"));
    }
  }, [caption, hashtags, platform, t]);

  /**
   * Upload a picked image to the media library. Shared by both
   * camera and library pickers. The MediaItem stays in state so
   * the publish path can reference it by id, and the UI hero
   * preview reads `signedUrl`.
   */
  const handlePicked = useCallback(async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setImageError(null);
    setUploading(true);
    const res = await uploadMobileMedia({
      uri: asset.uri,
      fileName: asset.fileName ?? undefined,
      contentType: asset.mimeType ?? "image/jpeg",
    });
    setUploading(false);
    if (res.ok === false) {
      hapticError();
      setImageError(res.message);
      return;
    }
    hapticSuccess();
    setMedia(res.item);
  }, []);

  const onPickFromLibrary = useCallback(async () => {
    hapticButtonPress();
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setImageError(t("image.permission_library_denied"));
      hapticError();
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      // Quality 0.9 — good enough for FB / IG feed, ~3-5x smaller than raw.
      quality: 0.9,
    });
    await handlePicked(result);
  }, [handlePicked, t]);

  const onPickFromCamera = useCallback(async () => {
    hapticButtonPress();
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setImageError(t("image.permission_camera_denied"));
      hapticError();
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    await handlePicked(result);
  }, [handlePicked, t]);

  const onClearImage = useCallback(() => {
    hapticButtonPress();
    setMedia(null);
    setImageError(null);
  }, []);

  const onSchedule = useCallback(async () => {
    if (!caption) return;
    if (
      platform !== "facebook" &&
      platform !== "linkedin" &&
      platform !== "instagram"
    )
      return;
    const conn = activeDirectPublishConnection;
    if (!conn) return;
    if (platform === "instagram" && !media) {
      setScheduleResult({
        ok: false,
        error: t("schedule_box.instagram_needs_image"),
      });
      hapticError();
      return;
    }
    // The schedule endpoint requires ≥ 1 minute lead time. Clamp
    // here so the agent doesn't see a confusing 422 if they picked
    // a near-now time.
    if (scheduledAt.getTime() - Date.now() < 60_000) {
      setScheduleResult({
        ok: false,
        error: t("schedule_box.future_clamp"),
      });
      hapticError();
      return;
    }
    hapticButtonPress();
    setScheduling(true);
    setScheduleResult(null);
    const res = await scheduleMobileQuickPost({
      platform,
      connectionId: conn.id,
      caption,
      hashtags,
      mediaItemId: media?.id,
      scheduledFor: scheduledAt.toISOString(),
      trigger,
      subjectKind: pickedSubject?.kind,
      subjectRefId: pickedSubject?.refId ?? undefined,
    });
    setScheduling(false);
    if (res.ok === false) {
      hapticError();
      setScheduleResult({ ok: false, error: res.message });
      return;
    }
    hapticSuccess();
    setScheduleResult({ ok: true, scheduledFor: res.scheduledFor });
  }, [
    caption,
    hashtags,
    platform,
    activeDirectPublishConnection,
    trigger,
    media,
    scheduledAt,
    pickedSubject,
    t,
  ]);

  const onCreateRecurring = useCallback(async () => {
    if (!caption) return;
    if (
      platform !== "facebook" &&
      platform !== "linkedin" &&
      platform !== "instagram"
    )
      return;
    const conn = activeDirectPublishConnection;
    if (!conn) return;
    if (platform === "instagram" && !media) {
      setRecurringResult({
        ok: false,
        error: t("recurring_box.ig_needs_image"),
      });
      hapticError();
      return;
    }
    hapticButtonPress();
    setCreatingRecurring(true);
    setRecurringResult(null);
    const maxN = parseInt(recurringMax, 10);
    const res = await createMobileRecurringPost({
      platform,
      connectionId: conn.id,
      caption,
      hashtags,
      mediaItemId: media?.id,
      trigger,
      subjectKind: pickedSubject?.kind,
      subjectRefId: pickedSubject?.refId ?? undefined,
      cadence: recurringCadence,
      weeklyDayOfWeek:
        recurringCadence === "weekly" ? recurringWeekday : undefined,
      timeOfDayHour: recurringTime.getHours(),
      timeOfDayMinute: recurringTime.getMinutes(),
      timezone: recurringTimezone,
      maxOccurrences: Number.isFinite(maxN) && maxN > 0 ? maxN : undefined,
    });
    setCreatingRecurring(false);
    if (res.ok === false) {
      hapticError();
      setRecurringResult({ ok: false, error: res.message });
      return;
    }
    hapticSuccess();
    setRecurringResult({
      ok: true,
      recurringScheduleId: res.recurringScheduleId,
      nextOccurrenceAt: res.nextOccurrenceAt,
    });
  }, [
    caption,
    hashtags,
    platform,
    activeDirectPublishConnection,
    trigger,
    media,
    pickedSubject,
    recurringCadence,
    recurringWeekday,
    recurringTime,
    recurringTimezone,
    recurringMax,
    t,
  ]);

  const onPublish = useCallback(async () => {
    if (!caption) return;
    if (
      platform !== "facebook" &&
      platform !== "linkedin" &&
      platform !== "instagram"
    )
      return;
    const conn = activeDirectPublishConnection;
    if (!conn) return;
    // Instagram requires an image. Block the publish before we
    // round-trip to the server.
    if (platform === "instagram" && !media) {
      setPublishResult({
        ok: false,
        error: t("actions.ig_needs_image_publish"),
      });
      hapticError();
      return;
    }
    hapticButtonPress();
    setPublishing(true);
    setPublishResult(null);
    const res = await publishMobileQuickPost({
      platform,
      connectionId: conn.id,
      caption,
      hashtags,
      mediaItemId: media?.id,
      trigger,
      subjectKind: pickedSubject?.kind,
      subjectRefId: pickedSubject?.refId ?? undefined,
    });
    setPublishing(false);
    if (res.ok === false) {
      hapticError();
      setPublishResult({ ok: false, error: res.message });
      return;
    }
    hapticSuccess();
    setPublishResult({
      ok: true,
      externalPostUrl: res.externalPostUrl,
      platform: res.platform,
    });
  }, [
    caption,
    hashtags,
    platform,
    activeDirectPublishConnection,
    trigger,
    media,
    pickedSubject,
    t,
  ]);

  return (
    <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <Stack.Screen options={{ title: t("title"), headerBackTitle: t("back") }} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Trigger picker */}
        <Text style={styles.sectionLabel}>{t("section_label")}</Text>
        <View style={styles.triggerGrid}>
          {TRIGGERS.map((trig) => {
            const active = trigger === trig.id;
            return (
              <Pressable
                key={trig.id}
                onPress={() => {
                  setTrigger(trig.id);
                  setGenerated(false);
                  hapticButtonPress();
                }}
                style={[
                  styles.triggerChip,
                  active && styles.triggerChipActive,
                ]}
              >
                <Ionicons
                  name={trig.icon}
                  size={18}
                  color={active ? tokens.accent : tokens.text}
                />
                <Text
                  style={[
                    styles.triggerChipText,
                    active && styles.triggerChipTextActive,
                  ]}
                >
                  {t(`trigger_options.${trig.id}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Brief */}
        <View style={[styles.briefHeaderRow, { marginTop: 18 }]}>
          <Text style={styles.sectionLabel}>
            {trigger === "by_address"
              ? t("brief.section_label_by_address")
              : trigger === "custom" ||
                  trigger === "market_update" ||
                  trigger === "testimonial"
                ? t("brief.section_label_synthetic")
                : t("brief.section_label_default")}
          </Text>
          {triggerAllowsSubjects && (
            <Pressable
              onPress={openSubjectPicker}
              style={styles.subjectPickButton}
            >
              <Ionicons name="list-outline" size={14} color={tokens.accent} />
              <Text style={styles.subjectPickButtonText}>
                {subjectPickerCtaLabel(trigger, t)}
              </Text>
            </Pressable>
          )}
        </View>

        {/* by_address — show the lookup row first; on hit, the brief
            textarea below pre-fills with the stitched property
            details. */}
        {trigger === "by_address" && (
          <View style={styles.lookupBox}>
            <TextInput
              style={styles.lookupInput}
              placeholder={t("lookup.input_placeholder")}
              placeholderTextColor={tokens.textSubtle}
              value={lookupInput}
              onChangeText={setLookupInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => {
                if (!lookupBusy) void onLookupAddress();
              }}
            />
            <Pressable
              onPress={() => void onLookupAddress()}
              disabled={lookupBusy || lookupInput.trim().length < 3}
              style={[
                styles.lookupButton,
                (lookupBusy || lookupInput.trim().length < 3) &&
                  styles.lookupButtonBusy,
              ]}
            >
              {lookupBusy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="search" size={14} color="#fff" />
                  <Text style={styles.lookupButtonText}>{t("lookup.button")}</Text>
                </>
              )}
            </Pressable>
            {lookupError && (
              <View style={styles.errorBox}>
                <Ionicons
                  name="alert-circle"
                  size={16}
                  color={tokens.danger}
                />
                <Text style={styles.errorText}>{lookupError}</Text>
              </View>
            )}
            {lookupResult && (
              <View
                style={[
                  styles.lookupResultCard,
                  lookupResult.found
                    ? styles.lookupResultFound
                    : styles.lookupResultMissing,
                ]}
              >
                <Text
                  style={[
                    styles.lookupResultTitle,
                    lookupResult.found
                      ? styles.lookupResultTitleFound
                      : styles.lookupResultTitleMissing,
                  ]}
                >
                  {lookupResult.found
                    ? t("lookup.found")
                    : t("lookup.not_found")}
                </Text>
                {lookupResult.found && (
                  <Text style={styles.lookupResultDetail}>
                    {[
                      lookupResult.beds != null && `${lookupResult.beds}bd`,
                      lookupResult.baths != null && `${lookupResult.baths}ba`,
                      lookupResult.sqft != null &&
                        `${lookupResult.sqft.toLocaleString()} sqft`,
                      lookupResult.estimatedValue != null &&
                        `~$${lookupResult.estimatedValue.toLocaleString()}`,
                      lookupResult.listingStatus,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                )}
                <Text style={styles.lookupResultHint}>
                  {t("lookup.hint")}
                </Text>
              </View>
            )}
          </View>
        )}

        <TextInput
          style={[
            styles.briefInput,
            trigger === "by_address" && { marginTop: 10 },
          ]}
          placeholder={placeholderFor(trigger, t)}
          placeholderTextColor={tokens.textSubtle}
          multiline
          value={brief}
          onChangeText={setBrief}
          textAlignVertical="top"
        />
        {pickedSubjectId && (
          <View style={styles.pickedSubjectBadge}>
            <Ionicons
              name="checkmark-circle"
              size={14}
              color={tokens.success}
            />
            <Text style={styles.pickedSubjectText}>
              {t("brief.picked_subject_hint")}
            </Text>
          </View>
        )}

        {/* Subject picker modal-style list. Lives inline rather than
            as a true modal so it scrolls naturally inside the
            KeyboardAvoidingView. */}
        {showSubjectPicker && (
          <View style={styles.subjectPickerCard}>
            <View style={styles.subjectPickerHeader}>
              <Text style={styles.subjectPickerTitle}>
                {subjectPickerHeaderLabel(trigger, t)}
              </Text>
              <Pressable
                onPress={() => setShowSubjectPicker(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={18} color={tokens.textSubtle} />
              </Pressable>
            </View>
            {subjectsLoading ? (
              <View style={styles.subjectLoadingBlock}>
                <ActivityIndicator color={tokens.accent} />
              </View>
            ) : subjectsError ? (
              <Text style={styles.subjectErrorText}>{subjectsError}</Text>
            ) : subjects.length === 0 ? (
              <Text style={styles.subjectEmptyText}>
                {subjectEmptyLabel(trigger, t)}
              </Text>
            ) : (
              subjects.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => onPickSubject(s)}
                  style={styles.subjectRow}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subjectLabel} numberOfLines={1}>
                      {s.label}
                    </Text>
                    {s.sub ? (
                      <Text style={styles.subjectSub} numberOfLines={1}>
                        {s.sub}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={tokens.textSubtle}
                  />
                </Pressable>
              ))
            )}
          </View>
        )}

        {/* Image attachment — optional for FB / LinkedIn, required
            for IG. Snap a fresh photo or pick from the library; the
            chosen image uploads to media_library and is referenced
            by id in the publish payload. */}
        <Text style={[styles.sectionLabel, { marginTop: 18 }]}>
          {t("image.section_label")}
        </Text>
        {media ? (
          <View style={styles.imagePreview}>
            {media.signedUrl ? (
              <Image
                source={{ uri: media.signedUrl }}
                style={styles.imagePreviewThumb}
              />
            ) : (
              <View style={[styles.imagePreviewThumb, styles.imageFallback]} />
            )}
            <View style={styles.imagePreviewMeta}>
              <Text style={styles.imagePreviewName} numberOfLines={1}>
                {media.fileName ?? t("image.attached_fallback")}
              </Text>
              <Text style={styles.imagePreviewSub}>
                {media.contentType ?? "image"}
                {media.sizeBytes != null
                  ? ` · ${formatBytes(media.sizeBytes)}`
                  : ""}
              </Text>
              <View style={styles.imageActions}>
                <Pressable
                  onPress={onPickFromLibrary}
                  disabled={uploading}
                  style={styles.imageActionLink}
                >
                  <Text style={styles.imageActionLinkText}>{t("image.change")}</Text>
                </Pressable>
                <Pressable
                  onPress={onClearImage}
                  disabled={uploading}
                  style={styles.imageActionLink}
                >
                  <Text style={styles.imageActionLinkText}>{t("image.remove")}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.imagePickerRow}>
            <Pressable
              onPress={onPickFromCamera}
              disabled={uploading}
              style={[styles.imagePickerButton, uploading && styles.imagePickerBusy]}
            >
              <Ionicons name="camera-outline" size={18} color={tokens.text} />
              <Text style={styles.imagePickerText}>{t("image.camera")}</Text>
            </Pressable>
            <Pressable
              onPress={onPickFromLibrary}
              disabled={uploading}
              style={[styles.imagePickerButton, uploading && styles.imagePickerBusy]}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={tokens.accent} />
              ) : (
                <>
                  <Ionicons name="image-outline" size={18} color={tokens.text} />
                  <Text style={styles.imagePickerText}>{t("image.library")}</Text>
                </>
              )}
            </Pressable>
          </View>
        )}
        {imageError && (
          <View style={[styles.errorBox, { marginTop: 8 }]}>
            <Ionicons name="alert-circle" size={16} color={tokens.danger} />
            <Text style={styles.errorText}>{imageError}</Text>
          </View>
        )}

        {/* Platform tabs */}
        <Text style={[styles.sectionLabel, { marginTop: 18 }]}>
          {t("platform.section_label")}
        </Text>
        <View style={styles.platformRow}>
          {PLATFORMS.map((p) => {
            const active = platform === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => {
                  setPlatform(p.id);
                  setGenerated(false);
                  hapticButtonPress();
                }}
                style={[
                  styles.platformTab,
                  active && styles.platformTabActive,
                ]}
              >
                <Text
                  style={[
                    styles.platformTabText,
                    active && styles.platformTabTextActive,
                  ]}
                >
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Generate button */}
        <Pressable
          onPress={onGenerate}
          disabled={busy}
          style={[styles.generateButton, busy && styles.generateButtonBusy]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="sparkles" size={18} color="#fff" />
              <Text style={styles.generateButtonText}>
                {generated ? t("generate.regenerate") : t("generate.button")}
              </Text>
            </>
          )}
        </Pressable>

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color={tokens.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Generated caption */}
        {generated && caption && (
          <View style={styles.captionCard}>
            <Text style={styles.captionLabel}>{t("caption.label")}</Text>
            <TextInput
              style={styles.captionInput}
              value={caption}
              onChangeText={setCaption}
              multiline
              textAlignVertical="top"
            />
            {hashtags.length > 0 && platform !== "instagram" && (
              <View style={styles.hashtagRow}>
                {hashtags.map((h) => (
                  <View key={h} style={styles.hashtagChip}>
                    <Text style={styles.hashtagChipText}>
                      #{h.replace(/^#/, "")}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            {/* Mode picker — only available when the agent can
                actually direct-publish. Without a connection the
                only path is Share/Copy. */}
            {canDirectPublish && (
              <View style={styles.modeRow}>
                {(["now", "schedule", "recurring"] as Mode[]).map((m) => {
                  const active = mode === m;
                  const label =
                    m === "now"
                      ? t("mode.now")
                      : m === "schedule"
                        ? t("mode.schedule")
                        : t("mode.recurring");
                  return (
                    <Pressable
                      key={m}
                      onPress={() => {
                        setMode(m);
                        hapticButtonPress();
                      }}
                      style={[
                        styles.modeTab,
                        active && styles.modeTabActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeTabText,
                          active && styles.modeTabTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {canDirectPublish && mode === "schedule" && (
              <View style={styles.scheduleBox}>
                <Text style={styles.scheduleLabel}>
                  {t("schedule_box.publish_at", { tz: recurringTimezone })}
                </Text>
                <View style={styles.schedulePickerRow}>
                  <Pressable
                    onPress={() => setShowSchedulePicker("date")}
                    style={styles.schedulePickerButton}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={16}
                      color={tokens.text}
                    />
                    <Text style={styles.schedulePickerText}>
                      {scheduledAt.toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowSchedulePicker("time")}
                    style={styles.schedulePickerButton}
                  >
                    <Ionicons
                      name="time-outline"
                      size={16}
                      color={tokens.text}
                    />
                    <Text style={styles.schedulePickerText}>
                      {scheduledAt.toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                  </Pressable>
                </View>
                {showSchedulePicker && (
                  <DateTimePicker
                    value={scheduledAt}
                    mode={showSchedulePicker === "date" ? "date" : "time"}
                    minimumDate={new Date(Date.now() + 60_000)}
                    onChange={(_e, d) => {
                      // Android dismisses on outside-tap; iOS keeps the
                      // wheel up until user taps Done. Either way, the
                      // event carries the selected date (or no date on
                      // dismiss).
                      setShowSchedulePicker(null);
                      if (d) setScheduledAt(d);
                    }}
                  />
                )}
                <Text style={styles.scheduleHint}>
                  {t("schedule_box.hint")}
                </Text>
              </View>
            )}

            {canDirectPublish && mode === "recurring" && (
              <View style={styles.recurringBox}>
                <Text style={styles.scheduleLabel}>{t("recurring_box.cadence")}</Text>
                <View style={styles.modeRow}>
                  {(["daily", "weekly"] as const).map((c) => {
                    const active = recurringCadence === c;
                    return (
                      <Pressable
                        key={c}
                        onPress={() => {
                          setRecurringCadence(c);
                          hapticButtonPress();
                        }}
                        style={[
                          styles.modeTab,
                          active && styles.modeTabActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.modeTabText,
                            active && styles.modeTabTextActive,
                          ]}
                        >
                          {c === "daily" ? t("recurring_box.daily") : t("recurring_box.weekly")}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {recurringCadence === "weekly" && (
                  <>
                    <Text style={[styles.scheduleLabel, { marginTop: 12 }]}>
                      {t("recurring_box.day_of_week")}
                    </Text>
                    <View style={styles.weekdayRow}>
                      {(["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const).map(
                        (key, i) => {
                          const active = recurringWeekday === i;
                          return (
                            <Pressable
                              key={key}
                              onPress={() => {
                                setRecurringWeekday(i);
                                hapticButtonPress();
                              }}
                              style={[
                                styles.weekdayChip,
                                active && styles.weekdayChipActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.weekdayChipText,
                                  active && styles.weekdayChipTextActive,
                                ]}
                              >
                                {t(`recurring_box.weekdays.${key}`)}
                              </Text>
                            </Pressable>
                          );
                        },
                      )}
                    </View>
                  </>
                )}

                <Text style={[styles.scheduleLabel, { marginTop: 12 }]}>
                  {t("recurring_box.time_of_day", { tz: recurringTimezone })}
                </Text>
                <Pressable
                  onPress={() => setShowRecurringTimePicker(true)}
                  style={styles.schedulePickerButton}
                >
                  <Ionicons
                    name="time-outline"
                    size={16}
                    color={tokens.text}
                  />
                  <Text style={styles.schedulePickerText}>
                    {recurringTime.toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </Text>
                </Pressable>
                {showRecurringTimePicker && (
                  <DateTimePicker
                    value={recurringTime}
                    mode="time"
                    onChange={(_e, d) => {
                      setShowRecurringTimePicker(false);
                      if (d) setRecurringTime(d);
                    }}
                  />
                )}

                <Text style={[styles.scheduleLabel, { marginTop: 12 }]}>
                  {t("recurring_box.stop_after")}
                </Text>
                <TextInput
                  value={recurringMax}
                  onChangeText={setRecurringMax}
                  keyboardType="number-pad"
                  placeholder={t("recurring_box.unlimited_placeholder")}
                  placeholderTextColor={tokens.textSubtle}
                  style={styles.maxOccurrencesInput}
                />

                <Text style={styles.scheduleHint}>
                  {t("recurring_box.hint")}
                </Text>
              </View>
            )}

            <View style={styles.actionRow}>
              {canDirectPublish && (
                <Pressable
                  onPress={
                    mode === "schedule"
                      ? onSchedule
                      : mode === "recurring"
                        ? onCreateRecurring
                        : onPublish
                  }
                  disabled={publishing || scheduling || creatingRecurring}
                  style={[
                    styles.actionButton,
                    mode === "now" && platform === "linkedin"
                      ? styles.publishButtonLinkedIn
                      : mode === "now"
                        ? styles.publishButton
                        : mode === "schedule"
                          ? styles.scheduleButton
                          : styles.recurringButton,
                    (publishing || scheduling || creatingRecurring) &&
                      styles.actionButtonBusy,
                  ]}
                >
                  {publishing || scheduling || creatingRecurring ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons
                        name={
                          mode === "schedule"
                            ? "calendar-outline"
                            : mode === "recurring"
                              ? "repeat-outline"
                              : "send"
                        }
                        size={16}
                        color="#fff"
                      />
                      <Text style={styles.publishButtonText}>
                        {mode === "schedule"
                          ? t("actions.schedule")
                          : mode === "recurring"
                            ? t("actions.create_recurring")
                            : t("actions.publish_to", { platform: platform === "linkedin" ? "LinkedIn" : "Facebook" })}
                      </Text>
                    </>
                  )}
                </Pressable>
              )}
              <Pressable onPress={onShare} style={styles.actionButton}>
                <Ionicons
                  name="share-outline"
                  size={16}
                  color={tokens.accent}
                />
                <Text style={styles.actionButtonText}>{t("actions.share_copy")}</Text>
              </Pressable>
            </View>

            {scheduleResult?.ok === true ? (
              <View style={styles.successBanner}>
                <Ionicons
                  name="calendar"
                  size={18}
                  color={tokens.success}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.successBannerTitle}>
                    {t("banners.scheduled_for", {
                      date: new Date(scheduleResult.scheduledFor).toLocaleString(),
                    })}
                  </Text>
                  <Pressable
                    onPress={() => router.push("/scheduled" as never)}
                  >
                    <Text style={styles.successBannerLink}>
                      {t("banners.view_scheduled")}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : scheduleResult?.ok === false ? (
              <View style={styles.errorBox}>
                <Ionicons
                  name="alert-circle"
                  size={16}
                  color={tokens.danger}
                />
                <Text style={styles.errorText}>{scheduleResult.error}</Text>
              </View>
            ) : null}

            {recurringResult?.ok === true ? (
              <View style={styles.successBanner}>
                <Ionicons name="repeat" size={18} color={tokens.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.successBannerTitle}>
                    {t("banners.recurring_created", {
                      date: new Date(recurringResult.nextOccurrenceAt).toLocaleString(),
                    })}
                  </Text>
                  <Pressable
                    onPress={() => router.push("/recurring" as never)}
                  >
                    <Text style={styles.successBannerLink}>
                      {t("banners.manage_recurring")}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : recurringResult?.ok === false ? (
              <View style={styles.errorBox}>
                <Ionicons
                  name="alert-circle"
                  size={16}
                  color={tokens.danger}
                />
                <Text style={styles.errorText}>{recurringResult.error}</Text>
              </View>
            ) : null}

            {/* Publish result banner — success links to the live post,
                failure shows the error inline (reconnect flow lives on
                the connect-platforms screen). */}
            {publishResult?.ok === true ? (
              <View style={styles.successBanner}>
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={tokens.success}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.successBannerTitle}>
                    {t("banners.published_to", { platform: labelFor(publishResult.platform) })}
                  </Text>
                  {publishResult.externalPostUrl && (
                    <Pressable
                      onPress={() =>
                        publishResult.externalPostUrl &&
                        Linking.openURL(publishResult.externalPostUrl)
                      }
                    >
                      <Text style={styles.successBannerLink}>
                        {t("banners.view_the_post")}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ) : publishResult?.ok === false ? (
              <View style={styles.errorBox}>
                <Ionicons
                  name="alert-circle"
                  size={16}
                  color={tokens.danger}
                />
                <Text style={styles.errorText}>{publishResult.error}</Text>
              </View>
            ) : null}

            <Text style={styles.helperText}>
              {platform === "facebook" && !canDirectPublish ? (
                <>
                  {t("helper.want_one_tap")}{" "}
                  <Text
                    style={styles.linkText}
                    onPress={() => router.push("/connect-platforms" as never)}
                  >
                    {t("helper.connect_fb_page")}
                  </Text>
                  .
                </>
              ) : platform === "linkedin" && !canDirectPublish ? (
                <>
                  {t("helper.want_one_tap")}{" "}
                  <Text
                    style={styles.linkText}
                    onPress={() => router.push("/connect-platforms" as never)}
                  >
                    {t("helper.connect_linkedin")}
                  </Text>{" "}
                  {t("helper.and_post_personal_feed")}
                </>
              ) : platform === "instagram" && !igConnection ? (
                <>
                  {t("helper.want_one_tap")}{" "}
                  <Text
                    style={styles.linkText}
                    onPress={() => router.push("/connect-platforms" as never)}
                  >
                    {t("helper.connect_fb_page")}
                  </Text>{" "}
                  {t("helper.with_ig_business")}
                </>
              ) : platform === "instagram" && !media ? (
                <>{t("helper.instagram_needs_image_attach")}</>
              ) : platform === "instagram" ? (
                <>{t("helper.instagram_publish_note")}</>
              ) : platform === "facebook" ? (
                <>
                  {t("helper.facebook_publish_note")}{" "}
                  <Text
                    style={styles.linkText}
                    onPress={() => router.push("/connect-platforms" as never)}
                  >
                    {t("helper.connect_platforms_link")}
                  </Text>
                  .
                </>
              ) : platform === "linkedin" ? (
                <>
                  {t("helper.linkedin_publish_note")}{" "}
                  <Text
                    style={styles.linkText}
                    onPress={() => router.push("/connect-platforms" as never)}
                  >
                    {t("helper.connect_platforms_link")}
                  </Text>
                  .
                </>
              ) : (
                <>
                  {t("helper.share_only_note", { platform: labelFor(platform) })}
                </>
              )}
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Helper functions take the `t` function as a parameter so they
 * stay pure + don't capture a stale i18n instance. Caller passes
 * the `t` from `useTranslation("quick_post")`.
 *
 * The CTA / header / empty helpers fall back to `.default` for
 * synthetic triggers (custom / market_update / testimonial /
 * by_address) since those don't have a CRM subject picker.
 */
type QuickPostTFunction = (
  key: string,
  options?: Record<string, unknown>,
) => string;

function subjectPickerCtaLabel(
  trigger: MobileQuickPostTrigger,
  t: QuickPostTFunction,
): string {
  switch (trigger) {
    case "new_listing":
      return t("subject_picker.cta.new_listing");
    case "open_house":
      return t("subject_picker.cta.open_house");
    case "price_drop":
      return t("subject_picker.cta.price_drop");
    case "just_sold":
      return t("subject_picker.cta.just_sold");
    default:
      return t("subject_picker.cta.default");
  }
}

function subjectPickerHeaderLabel(
  trigger: MobileQuickPostTrigger,
  t: QuickPostTFunction,
): string {
  switch (trigger) {
    case "new_listing":
      return t("subject_picker.header.new_listing");
    case "open_house":
      return t("subject_picker.header.open_house");
    case "price_drop":
      return t("subject_picker.header.price_drop");
    case "just_sold":
      return t("subject_picker.header.just_sold");
    default:
      return t("subject_picker.header.default");
  }
}

function subjectEmptyLabel(
  trigger: MobileQuickPostTrigger,
  t: QuickPostTFunction,
): string {
  switch (trigger) {
    case "new_listing":
      return t("subject_picker.empty.new_listing");
    case "open_house":
      return t("subject_picker.empty.open_house");
    case "price_drop":
      return t("subject_picker.empty.price_drop");
    case "just_sold":
      return t("subject_picker.empty.just_sold");
    default:
      return t("subject_picker.empty.default");
  }
}

function placeholderFor(
  trigger: MobileQuickPostTrigger,
  t: QuickPostTFunction,
): string {
  return t(`brief.placeholder.${trigger}`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function labelFor(p: MobileQuickPostPlatform): string {
  return PLATFORMS.find((x) => x.id === p)?.label ?? p;
}

function createStyles(tokens: ThemeTokens) {
  return StyleSheet.create({
    kav: { flex: 1, backgroundColor: tokens.bg },
    scrollContent: {
      padding: 16,
      paddingBottom: 48,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: tokens.text,
      marginBottom: 8,
    },
    triggerGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    triggerChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: tokens.surface,
      borderWidth: 1,
      borderColor: tokens.border,
    },
    triggerChipActive: {
      backgroundColor: tokens.accentLight,
      borderColor: tokens.accent,
    },
    triggerChipText: {
      fontSize: 13,
      fontWeight: "600",
      color: tokens.text,
    },
    triggerChipTextActive: {
      color: tokens.accent,
    },
    briefInput: {
      minHeight: 96,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tokens.border,
      backgroundColor: tokens.surface,
      padding: 12,
      fontSize: 14,
      color: tokens.text,
    },
    lookupBox: {
      gap: 8,
    },
    lookupInput: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tokens.border,
      backgroundColor: tokens.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: tokens.text,
    },
    lookupButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: tokens.text,
    },
    lookupButtonBusy: { opacity: 0.5 },
    lookupButtonText: {
      fontSize: 13,
      fontWeight: "700",
      color: "#fff",
    },
    lookupResultCard: {
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
    },
    lookupResultFound: {
      backgroundColor: tokens.successBg,
      borderColor: tokens.successBorder,
    },
    lookupResultMissing: {
      backgroundColor: tokens.surface,
      borderColor: tokens.border,
    },
    lookupResultTitle: {
      fontSize: 12,
      fontWeight: "700",
    },
    lookupResultTitleFound: {
      color: tokens.successText,
    },
    lookupResultTitleMissing: {
      color: tokens.text,
    },
    lookupResultDetail: {
      marginTop: 4,
      fontSize: 12,
      color: tokens.text,
    },
    lookupResultHint: {
      marginTop: 6,
      fontSize: 11,
      color: tokens.textSubtle,
      lineHeight: 16,
    },
    briefHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    subjectPickButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: tokens.accentLight,
    },
    subjectPickButtonText: {
      fontSize: 11,
      fontWeight: "700",
      color: tokens.accent,
    },
    pickedSubjectBadge: {
      marginTop: 6,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 6,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: tokens.successBg,
      borderWidth: 1,
      borderColor: tokens.successBorder,
    },
    pickedSubjectText: {
      flex: 1,
      fontSize: 11,
      lineHeight: 16,
      color: tokens.successText,
    },
    subjectPickerCard: {
      marginTop: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tokens.border,
      backgroundColor: tokens.surface,
      overflow: "hidden",
    },
    subjectPickerHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: tokens.borderSubtle,
    },
    subjectPickerTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: tokens.text,
    },
    subjectLoadingBlock: {
      paddingVertical: 24,
      alignItems: "center",
    },
    subjectErrorText: {
      padding: 12,
      fontSize: 13,
      color: tokens.danger,
    },
    subjectEmptyText: {
      padding: 12,
      fontSize: 13,
      lineHeight: 19,
      color: tokens.textSubtle,
    },
    subjectRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: tokens.borderSubtle,
    },
    subjectLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: tokens.text,
    },
    subjectSub: {
      marginTop: 2,
      fontSize: 11,
      color: tokens.textSubtle,
    },
    platformRow: {
      flexDirection: "row",
      gap: 6,
    },
    platformTab: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: tokens.border,
      backgroundColor: tokens.surface,
      alignItems: "center",
    },
    platformTabActive: {
      backgroundColor: tokens.accentLight,
      borderColor: tokens.accent,
    },
    platformTabText: {
      fontSize: 12,
      fontWeight: "600",
      color: tokens.text,
    },
    platformTabTextActive: {
      color: tokens.accent,
    },
    generateButton: {
      marginTop: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: tokens.accent,
    },
    generateButtonBusy: {
      opacity: 0.7,
    },
    generateButtonText: {
      fontSize: 15,
      fontWeight: "700",
      color: "#fff",
    },
    errorBox: {
      marginTop: 12,
      flexDirection: "row",
      gap: 8,
      alignItems: "flex-start",
      padding: 10,
      borderRadius: 8,
      backgroundColor: tokens.dangerBg,
      borderWidth: 1,
      borderColor: tokens.danger,
    },
    errorText: {
      flex: 1,
      fontSize: 13,
      color: tokens.danger,
    },
    captionCard: {
      marginTop: 18,
      padding: 14,
      borderRadius: 14,
      backgroundColor: tokens.surface,
      borderWidth: 1,
      borderColor: tokens.border,
    },
    captionLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: tokens.textSubtle,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    captionInput: {
      minHeight: 120,
      fontSize: 14,
      lineHeight: 20,
      color: tokens.text,
      backgroundColor: tokens.bg,
      borderRadius: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: tokens.border,
    },
    hashtagRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 10,
    },
    hashtagChip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: tokens.bg,
      borderWidth: 1,
      borderColor: tokens.border,
    },
    hashtagChipText: {
      fontSize: 11,
      color: tokens.textSubtle,
    },
    actionRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 14,
    },
    actionButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: tokens.accentLight,
    },
    actionButtonBusy: { opacity: 0.7 },
    publishButton: {
      backgroundColor: "#1877F2", // Facebook blue
    },
    publishButtonLinkedIn: {
      backgroundColor: "#0A66C2", // LinkedIn blue
    },
    scheduleButton: {
      backgroundColor: "#6366F1", // indigo
    },
    recurringButton: {
      backgroundColor: "#9333EA", // purple
    },
    modeRow: {
      flexDirection: "row",
      gap: 6,
      marginTop: 12,
    },
    modeTab: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: tokens.border,
      backgroundColor: tokens.surface,
      alignItems: "center",
    },
    modeTabActive: {
      backgroundColor: tokens.accentLight,
      borderColor: tokens.accent,
    },
    modeTabText: {
      fontSize: 12,
      fontWeight: "600",
      color: tokens.text,
    },
    modeTabTextActive: {
      color: tokens.accent,
    },
    scheduleBox: {
      marginTop: 10,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tokens.border,
      backgroundColor: tokens.surface,
      gap: 8,
    },
    recurringBox: {
      marginTop: 10,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tokens.border,
      backgroundColor: tokens.surface,
    },
    scheduleLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: tokens.textSubtle,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    schedulePickerRow: {
      flexDirection: "row",
      gap: 8,
    },
    schedulePickerButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: tokens.border,
      backgroundColor: tokens.bg,
    },
    schedulePickerText: {
      fontSize: 13,
      fontWeight: "600",
      color: tokens.text,
    },
    scheduleHint: {
      fontSize: 11,
      color: tokens.textSubtle,
      lineHeight: 16,
    },
    weekdayRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 4,
    },
    weekdayChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: tokens.border,
      backgroundColor: tokens.bg,
    },
    weekdayChipActive: {
      backgroundColor: tokens.accentLight,
      borderColor: tokens.accent,
    },
    weekdayChipText: {
      fontSize: 12,
      fontWeight: "600",
      color: tokens.text,
    },
    weekdayChipTextActive: {
      color: tokens.accent,
    },
    maxOccurrencesInput: {
      marginTop: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: tokens.border,
      backgroundColor: tokens.bg,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 14,
      color: tokens.text,
    },
    publishButtonText: {
      fontSize: 13,
      fontWeight: "700",
      color: "#fff",
    },
    actionButtonText: {
      fontSize: 13,
      fontWeight: "700",
      color: tokens.accent,
    },
    successBanner: {
      marginTop: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 12,
      borderRadius: 10,
      backgroundColor: tokens.successBg,
      borderWidth: 1,
      borderColor: tokens.successBorder,
    },
    successBannerTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: tokens.successText,
    },
    successBannerLink: {
      marginTop: 2,
      fontSize: 12,
      fontWeight: "600",
      color: tokens.successText,
      textDecorationLine: "underline",
    },
    linkText: {
      fontWeight: "700",
      color: tokens.accent,
      textDecorationLine: "underline",
    },
    helperText: {
      marginTop: 10,
      fontSize: 11,
      color: tokens.textSubtle,
      lineHeight: 16,
    },
    imagePickerRow: {
      flexDirection: "row",
      gap: 8,
    },
    imagePickerButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: tokens.border,
      backgroundColor: tokens.surface,
      borderStyle: "dashed",
    },
    imagePickerBusy: { opacity: 0.6 },
    imagePickerText: {
      fontSize: 13,
      fontWeight: "600",
      color: tokens.text,
    },
    imagePreview: {
      flexDirection: "row",
      gap: 12,
      padding: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tokens.border,
      backgroundColor: tokens.surface,
    },
    imagePreviewThumb: {
      width: 72,
      height: 72,
      borderRadius: 8,
      backgroundColor: tokens.bg,
    },
    imageFallback: {
      borderWidth: 1,
      borderColor: tokens.border,
    },
    imagePreviewMeta: { flex: 1, minWidth: 0 },
    imagePreviewName: {
      fontSize: 13,
      fontWeight: "700",
      color: tokens.text,
    },
    imagePreviewSub: {
      marginTop: 2,
      fontSize: 11,
      color: tokens.textSubtle,
    },
    imageActions: {
      flexDirection: "row",
      gap: 14,
      marginTop: 8,
    },
    imageActionLink: { paddingVertical: 2 },
    imageActionLinkText: {
      fontSize: 12,
      fontWeight: "700",
      color: tokens.accent,
    },
  });
}
