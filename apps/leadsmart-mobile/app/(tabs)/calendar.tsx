import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppointmentCard } from "../../components/calendar/AppointmentCard";
import { AppointmentComposerModal } from "../../components/calendar/AppointmentComposerModal";
import { ReminderCard } from "../../components/calendar/ReminderCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { ScreenLoading } from "../../components/ScreenLoading";
import { BrandRefreshControl } from "../../components/BrandRefreshControl";
import { TaskCard } from "../../components/tasks/TaskCard";
import type {
  MobileCalendarEventDto,
  MobileFollowUpReminderDto,
  MobileLeadTaskDto,
} from "@leadsmart/shared";
import {
  fetchMobileCalendarEvents,
  fetchMobileReminders,
  patchMobileCalendarEvent,
  patchMobileTask,
} from "../../lib/leadsmartMobileApi";
import type { MobileApiFailure } from "../../lib/leadsmartMobileApi";
import { useThemeTokens } from "../../lib/useThemeTokens";
import type { ThemeTokens } from "../../lib/theme";
import {
  hapticButtonPress,
  hapticError,
  hapticRowTap,
  hapticSuccess,
  hapticWarning,
} from "../../lib/haptics";
import { useNetwork } from "../../lib/offline/NetworkContext";
import { useWriteQueue } from "../../lib/offline/useWriteQueue";

function Section({
  title,
  hint,
  children,
  styles,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

export default function CalendarScreen() {
  const router = useRouter();
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("calendar_screen");
  const { isConnected } = useNetwork();
  const { queueWrite } = useWriteQueue();
  const { newAppt } = useLocalSearchParams<{ newAppt?: string | string[] }>();
  const newApptFlag = Array.isArray(newAppt) ? newAppt[0] : newAppt;
  const [events, setEvents] = useState<MobileCalendarEventDto[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<MobileLeadTaskDto[]>([]);
  const [followUpsState, setFollowUpsState] = useState<MobileFollowUpReminderDto[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<MobileApiFailure | null>(null);
  const [remindersLoadError, setRemindersLoadError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (mode: "full" | "refresh") => {
    if (mode === "full") {
      setError(null);
      setRemindersLoadError(null);
    }
    if (mode === "refresh") setRefreshing(true);

    const [evRes, remRes] = await Promise.all([
      fetchMobileCalendarEvents(),
      fetchMobileReminders(),
    ]);

    if (mode === "refresh") setRefreshing(false);
    if (mode === "full") setInitialLoad(false);

    if (evRes.ok === false) {
      setError(evRes);
      setEvents([]);
      setOverdueTasks([]);
      setFollowUpsState([]);
      return;
    }

    setEvents(evRes.events);

    if (remRes.ok === false) {
      setRemindersLoadError(remRes.message);
      setOverdueTasks([]);
      setFollowUpsState([]);
      setError(null);
      return;
    }

    setOverdueTasks(remRes.overdue_tasks);
    setFollowUpsState(remRes.follow_ups);
    setRemindersLoadError(null);
    setError(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load("full");
    }, [load])
  );

  useFocusEffect(
    useCallback(() => {
      if (newApptFlag === "1") {
        setComposerOpen(true);
        requestAnimationFrame(() => {
          router.setParams({ newAppt: undefined });
        });
      }
    }, [newApptFlag, router])
  );

  const onRefresh = useCallback(() => {
    void load("refresh");
  }, [load]);

  const cancelEvent = useCallback(async (id: string) => {
    // Warning haptic before the server roundtrip — same feel as
    // iOS's own "confirm destructive" interaction, so users know
    // something irreversible is in flight.
    hapticWarning();
    setActionError(null);
    setCancellingId(id);
    const res = await patchMobileCalendarEvent(id, { status: "cancelled" });
    setCancellingId(null);
    if (res.ok === false) {
      hapticError();
      setActionError(res.message);
      return;
    }
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const completeTask = useCallback(async (taskId: string) => {
    setActionError(null);

    if (!isConnected) {
      await queueWrite("task-complete", [taskId]);
      hapticSuccess();
      // Optimistic removal
      setOverdueTasks((prev) => prev.filter((t) => t.id !== taskId));
      return;
    }

    setCompletingTaskId(taskId);
    const res = await patchMobileTask(taskId, { status: "done" });
    setCompletingTaskId(null);
    if (res.ok === false) {
      hapticError();
      setActionError(res.message);
      return;
    }
    // Success pattern — ascending double-tap — fires when the
    // task actually persisted, not before.
    hapticSuccess();
    setOverdueTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, [isConnected, queueWrite]);

  if (initialLoad) {
    return <ScreenLoading message={t("screen.loading")} />;
  }

  if (error && events.length === 0) {
    return (
      <View style={styles.centered}>
        <ErrorBanner
          title={t("screen.load_error.title")}
          message={error.message}
          onRetry={() => {
            void load("full");
          }}
        />
      </View>
    );
  }

  const hasAny =
    events.length > 0 || overdueTasks.length > 0 || followUpsState.length > 0;

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>{t("screen.title")}</Text>
        <Pressable
          onPress={() => {
            hapticButtonPress();
            setComposerOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t("screen.new_button_a11y")}
          style={({ pressed }) => [styles.newBtn, pressed && styles.newBtnPressed]}
        >
          <Text style={styles.newBtnText}>{t("screen.new_button")}</Text>
        </Pressable>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<BrandRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {remindersLoadError ? (
          <View style={styles.bannerPad}>
            <ErrorBanner
              title={t("screen.load_error.reminders_partial_title")}
              message={remindersLoadError}
              onRetry={() => {
                void load("refresh");
              }}
            />
          </View>
        ) : null}
        {actionError ? (
          <View style={styles.bannerPad}>
            <ErrorBanner
              title={t("screen.action_error.title")}
              message={actionError}
              onRetry={() => setActionError(null)}
              retryLabel={t("screen.action_error.dismiss")}
            />
          </View>
        ) : null}

        {!hasAny ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              title={t("screen.empty.title")}
              subtitle={t("screen.empty.subtitle")}
            />
          </View>
        ) : null}

        <Section
          title={t("sections.appointments.title")}
          hint={t("sections.appointments.hint")}
          styles={styles}
        >
          {events.length === 0 ? (
            <Text style={styles.muted}>{t("sections.appointments.empty")}</Text>
          ) : (
            events.map((e) => (
              <AppointmentCard
                key={e.id}
                event={e}
                onPress={() => {
                  hapticRowTap();
                  router.push(`/lead/${e.contact_id}`);
                }}
                onCancel={() => void cancelEvent(e.id)}
                cancelling={cancellingId === e.id}
              />
            ))
          )}
        </Section>

        <Section
          title={t("sections.overdue_tasks.title")}
          hint={t("sections.overdue_tasks.hint")}
          styles={styles}
        >
          {overdueTasks.length === 0 ? (
            <Text style={styles.muted}>{t("sections.overdue_tasks.empty")}</Text>
          ) : (
            overdueTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                showLeadName
                onPress={
                  task.contact_id
                    ? () => {
                        hapticRowTap();
                        router.push(`/lead/${task.contact_id}`);
                      }
                    : undefined
                }
                onComplete={() => void completeTask(task.id)}
                completing={completingTaskId === task.id}
              />
            ))
          )}
        </Section>

        <Section
          title={t("sections.follow_ups.title")}
          hint={t("sections.follow_ups.hint")}
          styles={styles}
        >
          {followUpsState.length === 0 ? (
            <Text style={styles.muted}>{t("sections.follow_ups.empty")}</Text>
          ) : (
            followUpsState.map((f) => (
              <ReminderCard
                key={`${f.contact_id}-${f.next_contact_at}`}
                reminder={f}
                onPress={() => {
                  hapticRowTap();
                  router.push(`/lead/${f.contact_id}`);
                }}
              />
            ))
          )}
        </Section>
      </ScrollView>

      <AppointmentComposerModal
        visible={composerOpen}
        leadIdFixed={null}
        onClose={() => setComposerOpen(false)}
        onCreated={() => {
          void load("refresh");
        }}
      />
    </View>
  );
}

/**
 * Style factory — consumed via `useMemo` in `CalendarScreen` so
 * the StyleSheet rebuilds whenever the OS color scheme flips.
 */
const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bg },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 4,
    },
    headerTitle: { fontSize: 22, fontWeight: "800", color: theme.text },
    newBtn: {
      backgroundColor: theme.accent,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
    },
    newBtnPressed: { opacity: 0.9 },
    newBtnText: { color: theme.textOnAccent, fontWeight: "700", fontSize: 15 },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 32 },
    centered: {
      flex: 1,
      backgroundColor: theme.bg,
      padding: 16,
      paddingTop: 24,
    },
    bannerPad: { paddingHorizontal: 12, paddingBottom: 8 },
    emptyWrap: { paddingHorizontal: 12, paddingTop: 8 },
    section: { marginTop: 4, paddingHorizontal: 12 },
    sectionTitle: {
      fontSize: 13,
      fontWeight: "800",
      color: theme.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: 4,
    },
    sectionHint: {
      fontSize: 12,
      color: theme.textSubtle,
      marginBottom: 4,
    },
    muted: { fontSize: 14, color: theme.textMuted, paddingVertical: 8 },
  });
