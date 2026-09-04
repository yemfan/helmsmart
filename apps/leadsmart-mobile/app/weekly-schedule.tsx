import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  fetchMobileWeeklySchedule,
  saveMobileWeeklySchedule,
  type MobileWeeklyDay,
  type MobileWeeklyMediaType,
  type MobileWeeklyScheduleData,
} from "../lib/leadsmartMobileApi";
import { hapticButtonPress, hapticError, hapticSuccess } from "../lib/haptics";
import { useThemeTokens } from "../lib/useThemeTokens";
import type { ThemeTokens } from "../lib/theme";

/**
 * Weekly post schedule — mobile counterpart of the web dashboard's
 * "Weekly post schedule". Pick the days you want a post; per checked day set a
 * time, content type (text / image / video), channels, and a topic. AI
 * researches the topic and auto-posts on schedule. Shares the same
 * social_weekly_schedules rows as the dashboard (via /api/mobile/social/weekly-schedule).
 */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MEDIA_TYPES: MobileWeeklyMediaType[] = ["text", "image", "video"];
const MEDIA_LABELS: Record<MobileWeeklyMediaType, string> = { text: "Text", image: "Image", video: "Video" };
const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  threads: "Threads",
  pinterest: "Pinterest",
  tiktok: "TikTok",
  youtube: "YouTube",
};

function fmtTime(h: number, m: number): string {
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";

export default function WeeklyScheduleScreen() {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const [data, setData] = useState<MobileWeeklyScheduleData | null>(null);
  const [days, setDays] = useState<MobileWeeklyDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetchMobileWeeklySchedule();
    if (res.ok === false) {
      setError(res.message);
      setDays([]);
      return;
    }
    setData(res.data);
    setDays(res.data.days.map((d) => ({ ...d, timezone: d.timezone || tz })));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const patch = useCallback((weekday: number, next: Partial<MobileWeeklyDay>) => {
    setDays((cur) => cur?.map((d) => (d.weekday === weekday ? { ...d, ...next } : d)) ?? cur);
    setNote(null);
  }, []);

  const platformsFor = useCallback(
    (mediaType: MobileWeeklyMediaType): string[] => data?.platformsByMedia?.[mediaType] ?? [],
    [data],
  );

  function stepMinutes(day: MobileWeeklyDay, delta: number) {
    let total = day.postHour * 60 + day.postMinute + delta;
    total = ((total % 1440) + 1440) % 1440;
    patch(day.weekday, { postHour: Math.floor(total / 60), postMinute: total % 60 });
  }

  // 1-5, the same clamp the server applies. The extras are spread through the
  // day after the first post and finish by 9pm.
  function stepPostsPerDay(day: MobileWeeklyDay, delta: number) {
    patch(day.weekday, { postsPerDay: Math.min(5, Math.max(1, day.postsPerDay + delta)) });
  }

  function setMediaType(day: MobileWeeklyDay, mediaType: MobileWeeklyMediaType) {
    patch(day.weekday, { mediaType, platforms: null });
  }

  function togglePlatform(day: MobileWeeklyDay, p: string) {
    const all = platformsFor(day.mediaType);
    const current = day.platforms ?? all;
    const set = new Set(current);
    if (set.has(p)) set.delete(p);
    else set.add(p);
    const arr = all.filter((x) => set.has(x));
    patch(day.weekday, { platforms: arr.length === 0 || arr.length === all.length ? null : arr });
  }

  async function save() {
    if (!days) return;
    hapticButtonPress();
    setSaving(true);
    setError(null);
    setNote(null);
    const res = await saveMobileWeeklySchedule(days);
    setSaving(false);
    if (res.ok === false) {
      setError(res.message);
      hapticError();
      return;
    }
    setData(res.data);
    setDays(res.data.days.map((d) => ({ ...d, timezone: d.timezone || tz })));
    setNote("Schedule saved.");
    hapticSuccess();
  }

  if (!days) {
    return (
      <View style={styles.loadingScreen}>
        <Stack.Screen options={{ title: "Weekly Schedule", headerBackTitle: "Back" }} />
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <Stack.Screen options={{ title: "Weekly Schedule", headerBackTitle: "Back" }} />

      <Text style={styles.intro}>
        Pick the days you want a post. For each, choose a content type, time, channels, and a topic — or let AI pick
        the time and topic — and how many posts that day. AI researches the topic and posts automatically. Text →
        Facebook, LinkedIn, Threads. Image adds a branded card + Instagram &amp; Pinterest. Video films your digital
        twin → TikTok, YouTube &amp; more.
      </Text>

      {data && !data.configured ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnText}>Not enabled yet (server needs ANTHROPIC_API_KEY).</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={tokens.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {days.map((d) => {
        const all = platformsFor(d.mediaType);
        const selected = d.platforms ?? all;
        const allSelected = d.platforms === null;
        return (
          <View key={d.weekday} style={styles.card}>
            <Pressable
              style={styles.dayHeader}
              onPress={() => patch(d.weekday, { enabled: !d.enabled })}
            >
              <View style={[styles.checkbox, d.enabled && styles.checkboxOn]}>
                {d.enabled ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
              </View>
              <Text style={styles.dayName}>{WEEKDAYS[d.weekday]}</Text>
            </Pressable>

            {d.enabled ? (
              <View style={styles.dayBody}>
                {/* Time */}
                <View style={styles.row}>
                  <Text style={styles.label}>Time</Text>
                  {d.timeMode === "ai" ? (
                    <Text style={styles.aiNote}>AI picks the best time each {WEEKDAYS[d.weekday]}</Text>
                  ) : (
                    <>
                      <View style={styles.stepper}>
                        <Pressable onPress={() => stepMinutes(d, -15)} style={styles.stepBtn} hitSlop={8}>
                          <Ionicons name="remove" size={16} color={tokens.text} />
                        </Pressable>
                        <Text style={styles.timeText}>{fmtTime(d.postHour, d.postMinute)}</Text>
                        <Pressable onPress={() => stepMinutes(d, 15)} style={styles.stepBtn} hitSlop={8}>
                          <Ionicons name="add" size={16} color={tokens.text} />
                        </Pressable>
                      </View>
                      <Text style={styles.tz}>{d.timezone}</Text>
                    </>
                  )}
                </View>
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Let AI pick the time</Text>
                  <Switch
                    value={d.timeMode === "ai"}
                    onValueChange={(on) => patch(d.weekday, { timeMode: on ? "ai" : "fixed" })}
                    accessibilityLabel="Let AI pick the time"
                  />
                </View>

                {/* Posts per day */}
                <View style={styles.row}>
                  <Text style={styles.label}>Per day</Text>
                  <View style={styles.stepper}>
                    <Pressable
                      onPress={() => stepPostsPerDay(d, -1)}
                      style={styles.stepBtn}
                      hitSlop={8}
                      disabled={d.postsPerDay <= 1}
                      accessibilityLabel="Fewer posts per day"
                    >
                      <Ionicons name="remove" size={16} color={d.postsPerDay <= 1 ? tokens.textSubtle : tokens.text} />
                    </Pressable>
                    <Text style={styles.countText}>{d.postsPerDay}</Text>
                    <Pressable
                      onPress={() => stepPostsPerDay(d, 1)}
                      style={styles.stepBtn}
                      hitSlop={8}
                      disabled={d.postsPerDay >= 5}
                      accessibilityLabel="More posts per day"
                    >
                      <Ionicons name="add" size={16} color={d.postsPerDay >= 5 ? tokens.textSubtle : tokens.text} />
                    </Pressable>
                  </View>
                  {d.postsPerDay > 1 ? <Text style={styles.tz}>spread through the day, done by 9pm</Text> : null}
                </View>

                {/* Content type */}
                <View style={styles.row}>
                  <Text style={styles.label}>Type</Text>
                  <View style={styles.segment}>
                    {MEDIA_TYPES.map((t) => (
                      <Pressable
                        key={t}
                        onPress={() => setMediaType(d, t)}
                        style={[styles.segBtn, d.mediaType === t && styles.segBtnOn]}
                      >
                        <Text style={[styles.segText, d.mediaType === t && styles.segTextOn]}>
                          {MEDIA_LABELS[t]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                {d.mediaType === "video" && data && !data.videoReady ? (
                  <Text style={styles.hint}>
                    Video uses your digital twin — set up your intro video + cloned voice first, or this day won&apos;t
                    post.
                  </Text>
                ) : null}

                {/* Channels */}
                <View style={styles.chipsRow}>
                  <Text style={styles.label}>Channels</Text>
                  {all.map((p) => (
                    <Pressable
                      key={p}
                      onPress={() => togglePlatform(d, p)}
                      style={[styles.chip, selected.includes(p) && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, selected.includes(p) && styles.chipTextOn]}>
                        {PLATFORM_LABELS[p] ?? p}
                      </Text>
                    </Pressable>
                  ))}
                  {allSelected ? <Text style={styles.allNote}>all connected</Text> : null}
                </View>

                {/* Topic */}
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Let AI pick the topic</Text>
                  <Switch
                    value={d.topicMode === "ai"}
                    onValueChange={(on) => patch(d.weekday, { topicMode: on ? "ai" : "fixed" })}
                    accessibilityLabel="Let AI pick the topic"
                  />
                </View>
                {d.topicMode === "ai" ? (
                  <Text style={styles.aiNote}>
                    AI searches the web for what is timely and useful that day and writes about that.
                  </Text>
                ) : (
                  <>
                    <View style={styles.chipsRow}>
                      <Text style={styles.label}>Topic</Text>
                      {(data?.topicPresets ?? []).map((topic) => (
                        <Pressable
                          key={topic}
                          onPress={() => patch(d.weekday, { topic })}
                          style={[styles.chip, d.topic === topic && styles.chipOn]}
                        >
                          <Text style={[styles.chipText, d.topic === topic && styles.chipTextOn]} numberOfLines={1}>
                            {topic}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <TextInput
                      value={d.topic}
                      onChangeText={(topic) => patch(d.weekday, { topic })}
                      placeholder="…or type your own topic"
                      placeholderTextColor={tokens.textSubtle}
                      style={styles.topicInput}
                    />
                  </>
                )}
              </View>
            ) : null}
          </View>
        );
      })}

      <Pressable onPress={() => void save()} disabled={saving} style={[styles.saveBtn, saving && styles.saveBtnBusy]}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save schedule</Text>}
      </Pressable>
      {note ? <Text style={styles.savedNote}>{note}</Text> : null}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function createStyles(tokens: ThemeTokens) {
  return StyleSheet.create({
    loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: tokens.bg },
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
    card: {
      backgroundColor: tokens.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: tokens.border,
      marginBottom: 10,
    },
    dayHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: tokens.border,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxOn: { backgroundColor: tokens.accent, borderColor: tokens.accent },
    dayName: { fontSize: 15, fontWeight: "700", color: tokens.text },
    dayBody: { marginTop: 12, gap: 10 },
    row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
    label: { fontSize: 11, fontWeight: "600", color: tokens.textSubtle, width: 58 },
    stepper: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: tokens.border,
      borderRadius: 10,
      paddingHorizontal: 6,
      paddingVertical: 4,
    },
    stepBtn: { padding: 4 },
    timeText: { fontSize: 14, fontWeight: "600", color: tokens.text, minWidth: 74, textAlign: "center" },
    countText: { fontSize: 14, fontWeight: "600", color: tokens.text, minWidth: 28, textAlign: "center" },
    tz: { fontSize: 10, color: tokens.textSubtle },
    aiNote: { flex: 1, fontSize: 12, lineHeight: 16, color: tokens.textSecondary },
    switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    switchLabel: { flex: 1, fontSize: 13, color: tokens.textSecondary },
    segment: { flexDirection: "row", borderWidth: 1, borderColor: tokens.border, borderRadius: 10, overflow: "hidden" },
    segBtn: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: tokens.surface },
    segBtnOn: { backgroundColor: tokens.accent },
    segText: { fontSize: 12, fontWeight: "600", color: tokens.textSecondary },
    segTextOn: { color: "#fff" },
    hint: { fontSize: 11, lineHeight: 15, color: tokens.warning ?? "#B45309" },
    chipsRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: tokens.border,
      backgroundColor: tokens.surface,
      maxWidth: 220,
    },
    chipOn: { borderColor: tokens.accent, backgroundColor: tokens.accentLight },
    chipText: { fontSize: 11, fontWeight: "600", color: tokens.textSecondary },
    chipTextOn: { color: tokens.accent },
    allNote: { fontSize: 10, color: tokens.textSubtle },
    topicInput: {
      borderWidth: 1,
      borderColor: tokens.border,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 14,
      color: tokens.text,
      backgroundColor: tokens.surface,
    },
    saveBtn: {
      marginTop: 8,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: tokens.accent,
    },
    saveBtnBusy: { opacity: 0.7 },
    saveText: { fontSize: 15, fontWeight: "700", color: "#fff" },
    savedNote: { marginTop: 10, fontSize: 13, color: tokens.success ?? "#15803D", textAlign: "center" },
  });
}
