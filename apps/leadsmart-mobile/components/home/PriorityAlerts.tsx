import type { MobileDashboardPriorityAlert } from "@leadsmart/shared";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { ErrorBanner } from "../ErrorBanner";
import { PriorityAlertCard } from "./PriorityAlertCard";
import { fetchMobileDashboard } from "../../lib/leadsmartMobileApi";
import type { MobileApiFailure } from "../../lib/leadsmartMobileApi";
import { useCachedFetch } from "../../lib/offline/useCachedFetch";
import type { ThemeTokens } from "../../lib/theme";
import { useThemeTokens } from "../../lib/useThemeTokens";

/**
 * "Priority alerts" section — extracted from the old Home screen so both
 * the Home tab and the Boss (home) screen can surface the same
 * hot-lead / overdue-task / escalation cards without duplicating the
 * fetch + routing logic.
 *
 * Owns its own cached fetch (`home:dashboard`, the same cache key the Home
 * screen used) so mounting it alongside the Home screen shares one cache
 * entry.
 */

type DashboardPayload = {
  priorityAlerts: MobileDashboardPriorityAlert[];
};

export function PriorityAlerts() {
  const router = useRouter();
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation(["home", "common"]);

  const dashFetcher = useCallback(async (): Promise<DashboardPayload | MobileApiFailure> => {
    const res = await fetchMobileDashboard();
    if (res.ok === false) return res;
    return { priorityAlerts: res.priorityAlerts };
  }, []);

  const { data, error, refresh } = useCachedFetch<DashboardPayload>(
    "home:dashboard",
    dashFetcher,
  );

  const alerts = data?.priorityAlerts ?? [];

  const handleAlertPress = useCallback(
    (a: MobileDashboardPriorityAlert) => {
      if (a.leadId) {
        router.push({ pathname: "/lead/[id]", params: { id: String(a.leadId) } });
        return;
      }
      if (a.type === "unread_message") {
        router.push("/(tabs)/inbox");
        return;
      }
      if (a.type === "overdue_task") {
        router.push("/tasks");
        return;
      }
      router.push("/(tabs)/leads");
    },
    [router],
  );

  return (
    <View>
      <Text style={styles.sectionHeading}>{t("sections.priority_alerts")}</Text>
      {error ? (
        <ErrorBanner
          title={t("errors.dashboard_update_failed")}
          message={error.message}
          onRetry={refresh}
        />
      ) : null}
      {alerts.length === 0 ? (
        <Text style={styles.muted}>{t("sections.no_alerts")}</Text>
      ) : (
        alerts.map((a, i) => (
          <PriorityAlertCard
            key={`${a.type}-${a.leadId ?? "x"}-${a.createdAt ?? i}`}
            alert={a}
            onPress={() => handleAlertPress(a)}
          />
        ))
      )}
    </View>
  );
}

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    sectionHeading: {
      fontSize: 12,
      fontWeight: "800",
      color: theme.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 8,
    },
    muted: {
      fontSize: 14,
      color: theme.textMuted,
      paddingVertical: 8,
      lineHeight: 20,
    },
  });
