import type { MobileLeadTaskDto, MobileTasksGroupedResponseDto } from "@leadsmart/shared";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { ScreenLoading } from "../../components/ScreenLoading";
import { BrandRefreshControl } from "../../components/BrandRefreshControl";
import { TaskCard } from "../../components/tasks/TaskCard";
import { fetchMobileTasks, patchMobileTask } from "../../lib/leadsmartMobileApi";
import type { MobileApiFailure } from "../../lib/leadsmartMobileApi";
import { useThemeTokens } from "../../lib/useThemeTokens";
import type { ThemeTokens } from "../../lib/theme";

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

export default function TasksScreen() {
  const router = useRouter();
  const tokens = useThemeTokens();
  const { t } = useTranslation("mobile_misc_screens");
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [grouped, setGrouped] = useState<MobileTasksGroupedResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<MobileApiFailure | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const load = useCallback(async (mode: "full" | "refresh") => {
    if (mode === "full") {
      setLoading(true);
      setError(null);
    }
    if (mode === "refresh") setRefreshing(true);

    const res = await fetchMobileTasks();

    if (mode === "full") setLoading(false);
    if (mode === "refresh") setRefreshing(false);

    if (res.ok === false) {
      setError(res);
      setGrouped(null);
      return;
    }
    setGrouped(res);
    setError(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load("full");
    }, [load])
  );

  const onRefresh = useCallback(() => {
    void load("refresh");
  }, [load]);

  const removeTask = useCallback((taskId: string) => {
    setGrouped((prev) => {
      if (!prev) return prev;
      const without = (arr: MobileLeadTaskDto[]) => arr.filter((t) => t.id !== taskId);
      return {
        ...prev,
        overdue: without(prev.overdue),
        today: without(prev.today),
        upcoming: without(prev.upcoming),
      };
    });
  }, []);

  const completeTask = useCallback(
    async (task: MobileLeadTaskDto) => {
      setActionError(null);
      setCompletingId(task.id);
      const res = await patchMobileTask(task.id, { status: "done" });
      setCompletingId(null);
      if (res.ok === false) {
        setActionError(res.message);
        return;
      }
      removeTask(task.id);
    },
    [removeTask]
  );

  if (loading && !grouped) {
    return <ScreenLoading message={t("tasks.loading")} />;
  }

  if (error && !grouped) {
    return (
      <View style={styles.centered}>
        <ErrorBanner
          title={t("tasks.loadFailed")}
          message={error.message}
          onRetry={() => {
            void load("full");
          }}
        />
      </View>
    );
  }

  const g = grouped!;
  const totalOpen = g.overdue.length + g.today.length + g.upcoming.length;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<BrandRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {actionError ? (
        <View style={styles.bannerPad}>
          <ErrorBanner
            title={t("tasks.actionFailed")}
            message={actionError}
            onRetry={() => setActionError(null)}
            retryLabel={t("tasks.dismiss")}
          />
        </View>
      ) : null}

      {totalOpen === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState title={t("tasks.emptyTitle")} subtitle={t("tasks.emptySubtitle")} />
        </View>
      ) : null}

      {g.overdue.length > 0 ? (
        <Section title={t("tasks.overdue")} hint={t("tasks.overdueHint")} styles={styles}>
          {g.overdue.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              showLeadName
              onPress={t.contact_id ? () => router.push(`/lead/${t.contact_id}`) : undefined}
              onComplete={() => void completeTask(t)}
              completing={completingId === t.id}
            />
          ))}
        </Section>
      ) : null}

      {g.today.length > 0 ? (
        <Section title={t("tasks.today")} hint={t("tasks.todayHint")} styles={styles}>
          {g.today.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              showLeadName
              onPress={t.contact_id ? () => router.push(`/lead/${t.contact_id}`) : undefined}
              onComplete={() => void completeTask(t)}
              completing={completingId === t.id}
            />
          ))}
        </Section>
      ) : null}

      {g.upcoming.length > 0 ? (
        <Section title={t("tasks.upcoming")} hint={t("tasks.upcomingHint")} styles={styles}>
          {g.upcoming.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              showLeadName
              onPress={t.contact_id ? () => router.push(`/lead/${t.contact_id}`) : undefined}
              onComplete={() => void completeTask(t)}
              completing={completingId === t.id}
            />
          ))}
        </Section>
      ) : null}
    </ScrollView>
  );
}

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: theme.bg },
  scrollContent: { paddingBottom: 32 },
  centered: {
    flex: 1,
    backgroundColor: theme.bg,
    padding: 16,
    paddingTop: 24,
  },
  bannerPad: { paddingHorizontal: 12, paddingTop: 12 },
  emptyWrap: { paddingHorizontal: 12, paddingTop: 24 },
  section: { marginTop: 8, paddingHorizontal: 12 },
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
});
