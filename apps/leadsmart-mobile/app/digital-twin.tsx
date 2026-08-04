import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  buildMobileDigitalTwin,
  fetchMobileDigitalTwin,
  updateMobileDigitalTwin,
  uploadMobileIntroVideo,
  type MobileBrandProfile,
  type MobileDigitalTwinState,
} from "../lib/leadsmartMobileApi";
import { hapticButtonPress, hapticError, hapticSuccess } from "../lib/haptics";
import { useThemeTokens } from "../lib/useThemeTokens";
import type { ThemeTokens } from "../lib/theme";

/**
 * Digital Twin (mobile, Phase A) — record a short intro video on your phone and
 * AI turns it into your brand profile. Consent-gated (own likeness/voice only);
 * shares the same agents.dt_* rows as the dashboard. Voice clone + talking-avatar
 * are on the dashboard for now.
 */

type Stage = "idle" | "uploading" | "processing";

export default function DigitalTwinScreen() {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const [state, setState] = useState<MobileDigitalTwinState | null>(null);
  const [consent, setConsent] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<MobileBrandProfile | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetchMobileDigitalTwin();
    if (res.ok === false) {
      setError(res.message);
      return;
    }
    setState(res.data);
    setConsent(res.data.consent);
    setProfile(res.data.profile);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const runBuild = useCallback(
    async (uri: string, fileName: string | undefined, mimeType: string | undefined) => {
      if (!consent) {
        setError("Check the consent box first.");
        return;
      }
      setError(null);
      setNote(null);
      setStage("uploading");
      const up = await uploadMobileIntroVideo({ uri, fileName, contentType: mimeType ?? "video/mp4" });
      if (up.ok === false) {
        setStage("idle");
        setError(up.message);
        hapticError();
        return;
      }
      setStage("processing");
      const built = await buildMobileDigitalTwin({ videoPath: up.path, consent: true });
      setStage("idle");
      if (built.ok === false) {
        setError(built.message);
        hapticError();
        // The server may still finish processing — reflect whatever landed.
        void load();
        return;
      }
      hapticSuccess();
      setNote("Brand profile ready.");
      await load();
    },
    [consent, load],
  );

  const onRecord = useCallback(async () => {
    hapticButtonPress();
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError("Camera permission is needed to record your intro video.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 60,
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset) await runBuild(asset.uri, asset.fileName ?? undefined, asset.mimeType ?? undefined);
  }, [runBuild]);

  const onPickVideo = useCallback(async () => {
    hapticButtonPress();
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Library permission is needed to choose a video.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset) await runBuild(asset.uri, asset.fileName ?? undefined, asset.mimeType ?? undefined);
  }, [runBuild]);

  async function saveProfile() {
    if (!profile) return;
    hapticButtonPress();
    setSavingProfile(true);
    setNote(null);
    const res = await updateMobileDigitalTwin({ profile });
    setSavingProfile(false);
    if (res.ok === false) {
      setError(res.message);
      hapticError();
      return;
    }
    setNote("Saved.");
    hapticSuccess();
  }

  const busy = stage !== "idle";

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <Stack.Screen options={{ title: "Digital Twin", headerBackTitle: "Back" }} />

      <Text style={styles.intro}>
        Record a short intro video (talk to camera — who you are, your market, what you specialize in). AI turns it into
        your brand profile, used across your posts and assistants. Your video stays private.
      </Text>

      {state && !state.configured ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnText}>Not available yet (server needs FAL_KEY + ANTHROPIC_API_KEY).</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={tokens.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Consent */}
      <Pressable
        style={styles.consentRow}
        onPress={() => {
          const next = !consent;
          setConsent(next);
          void updateMobileDigitalTwin({ consent: next });
        }}
      >
        <View style={[styles.checkbox, consent && styles.checkboxOn]}>
          {consent ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
        </View>
        <Text style={styles.consentText}>
          I consent to AI use of <Text style={{ fontWeight: "700" }}>my own</Text> likeness and voice from my intro
          video. I can revoke this anytime.
        </Text>
      </Pressable>

      {/* Capture */}
      <View style={styles.captureRow}>
        <Pressable
          onPress={onRecord}
          disabled={!consent || busy}
          style={[styles.captureBtn, (!consent || busy) && styles.btnDisabled]}
        >
          <Ionicons name="videocam" size={16} color="#fff" />
          <Text style={styles.captureText}>Record</Text>
        </Pressable>
        <Pressable
          onPress={onPickVideo}
          disabled={!consent || busy}
          style={[styles.captureBtnAlt, (!consent || busy) && styles.btnDisabled]}
        >
          <Ionicons name="folder-open-outline" size={16} color={tokens.accent} />
          <Text style={styles.captureTextAlt}>Choose video</Text>
        </Pressable>
      </View>

      {busy ? (
        <View style={styles.busyRow}>
          <ActivityIndicator color={tokens.accent} />
          <Text style={styles.busyText}>
            {stage === "uploading" ? "Uploading your video…" : "Analyzing your video — this can take a minute…"}
          </Text>
        </View>
      ) : null}

      {note ? <Text style={styles.savedNote}>{note}</Text> : null}

      {/* Profile */}
      {profile ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your brand profile</Text>

          <Text style={styles.fieldLabel}>Bio</Text>
          <TextInput
            value={profile.bio}
            onChangeText={(bio) => setProfile((p) => (p ? { ...p, bio } : p))}
            multiline
            style={[styles.input, styles.inputMultiline]}
            placeholderTextColor={tokens.textSubtle}
          />

          <Text style={styles.fieldLabel}>Tagline</Text>
          <TextInput
            value={profile.tagline}
            onChangeText={(tagline) => setProfile((p) => (p ? { ...p, tagline } : p))}
            style={styles.input}
            placeholderTextColor={tokens.textSubtle}
          />

          {profile.specialties.length > 0 ? (
            <>
              <Text style={styles.fieldLabel}>Specialties</Text>
              <View style={styles.chipsWrap}>
                {profile.specialties.map((s) => (
                  <View key={s} style={styles.chip}>
                    <Text style={styles.chipText}>{s}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {profile.market ? (
            <>
              <Text style={styles.fieldLabel}>Market</Text>
              <Text style={styles.readText}>{profile.market}</Text>
            </>
          ) : null}
          {profile.tone ? (
            <>
              <Text style={styles.fieldLabel}>Tone</Text>
              <Text style={styles.readText}>{profile.tone}</Text>
            </>
          ) : null}

          <Pressable
            onPress={() => void saveProfile()}
            disabled={savingProfile}
            style={[styles.saveBtn, savingProfile && styles.btnDisabled]}
          >
            {savingProfile ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save profile</Text>}
          </Pressable>

          <Text style={styles.helperText}>
            Voice cloning and talking-avatar videos are on the dashboard. Re-record above anytime to refresh your
            profile.
          </Text>
        </View>
      ) : null}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function createStyles(tokens: ThemeTokens) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: tokens.bg },
    scrollContent: { padding: 16, paddingBottom: 48 },
    intro: { fontSize: 13, lineHeight: 19, color: tokens.textSecondary, marginBottom: 14 },
    warnBox: {
      padding: 10,
      borderRadius: 8,
      backgroundColor: tokens.surfaceMuted,
      borderWidth: 1,
      borderColor: tokens.borderSubtle,
      marginBottom: 12,
    },
    warnText: { fontSize: 12, color: tokens.textSubtle },
    errorBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 10,
      borderRadius: 8,
      backgroundColor: tokens.dangerBg,
      borderWidth: 1,
      borderColor: tokens.dangerBorder,
      marginBottom: 12,
    },
    errorText: { flex: 1, fontSize: 13, color: tokens.danger },
    consentRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      padding: 12,
      borderRadius: 12,
      backgroundColor: tokens.surface,
      borderWidth: 1,
      borderColor: tokens.border,
      marginBottom: 12,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: tokens.border,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
    },
    checkboxOn: { backgroundColor: tokens.accent, borderColor: tokens.accent },
    consentText: { flex: 1, fontSize: 12, lineHeight: 18, color: tokens.textSecondary },
    captureRow: { flexDirection: "row", gap: 10 },
    captureBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: tokens.accent,
    },
    captureText: { fontSize: 14, fontWeight: "700", color: "#fff" },
    captureBtnAlt: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: tokens.surface,
      borderWidth: 1,
      borderColor: tokens.border,
    },
    captureTextAlt: { fontSize: 14, fontWeight: "700", color: tokens.accent },
    btnDisabled: { opacity: 0.5 },
    busyRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
    busyText: { flex: 1, fontSize: 13, color: tokens.textSecondary },
    savedNote: { marginTop: 12, fontSize: 13, color: tokens.success, textAlign: "center" },
    card: {
      marginTop: 16,
      backgroundColor: tokens.surface,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: tokens.border,
    },
    cardTitle: { fontSize: 16, fontWeight: "700", color: tokens.text, marginBottom: 8 },
    fieldLabel: { fontSize: 11, fontWeight: "700", color: tokens.textSubtle, marginTop: 12, marginBottom: 4 },
    input: {
      borderWidth: 1,
      borderColor: tokens.border,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 14,
      color: tokens.text,
      backgroundColor: tokens.bg,
    },
    inputMultiline: { minHeight: 84, textAlignVertical: "top" },
    chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: tokens.accentLight,
    },
    chipText: { fontSize: 11, fontWeight: "600", color: tokens.accent },
    readText: { fontSize: 14, color: tokens.textSecondary, lineHeight: 20 },
    saveBtn: {
      marginTop: 16,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: tokens.accent,
    },
    saveText: { fontSize: 15, fontWeight: "700", color: "#fff" },
    helperText: { marginTop: 14, fontSize: 11, lineHeight: 16, color: tokens.textSubtle },
  });
}
