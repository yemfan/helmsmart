import type { DailyAgendaItem } from "@leadsmart/shared";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { ErrorBanner } from "../ErrorBanner";
import { DailyAgendaList } from "./DailyAgendaList";
import { fetchMobileDailyAgenda } from "../../lib/leadsmartMobileApi";
import type { MobileApiFailure } from "../../lib/leadsmartMobileApi";
import { useCachedFetch } from "../../lib/offline/useCachedFetch";
import type { ThemeTokens } from "../../lib/theme";
import { useThemeTokens } from "../../lib/useThemeTokens";

/**
 * "Today's agenda" section — extracted from the old Home screen so it can
 * be dropped into both the Home tab and the Boss (home) screen without
 * duplicating the fetch/route logic.
 *
 * Owns its own cached fetch (`home:agenda`, the same cache key the Home
 * screen used) so mounting it in two places shares one cache entry.
 */

type AgendaPayload = { agendaDate: string; items: DailyAgendaItem[] };

function formatAgendaDayLabel(agendaDate: string, locale: string): string {
  try {
    const parts = agendaDate.split("-").map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return agendaDate;
    const [y, m, d] = parts;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString(locale, {
      weekday: "long",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return agendaDate;
  }
}

export function TodayAgenda() {
  const router = useRouter();
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t, i18n } = useTranslation(["home", "common"]);

  const agendaFetcher = useCallback(async (): Promise<AgendaPayload | MobileApiFailure> => {
    const res = await fetchMobileDailyAgenda();
    if (res.ok === false) return res;
    return { agendaDate: res.agendaDate, items: res.items };
  }, []);

  const {
    data,
    error,
    refresh,
  } = useCachedFetch<AgendaPayload>("home:agenda", agendaFetcher);

  const agendaDate = data?.agendaDate ?? "";
  const agendaItems = data?.items ?? [];

  const handleAgendaItem = useCallback(
    (item: DailyAgendaItem) => {
      if (item.leadId) {
        router.push({ pathname: "/lead/[id]", params: { id: String(item.leadId) } });
        return;
      }
      if (item.type === "task") {
        router.push("/(tabs)/tasks");
        return;
      }
      if (item.type === "appointment") {
        router.push("/(tabs)/calendar");
        return;
      }
      router.push("/(tabs)/leads");
    },
    [router],
  );

  return (
    <View>
      <Text style={styles.sectionHeading}>{t("sections.today")}</Text>
      {agendaDate ? (
        <Text style={styles.agendaHint}>
          {t("sections.today_hint", {
            day: formatAgendaDayLabel(agendaDate, i18n.language),
          })}
        </Text>
      ) : null}
      {error ? (
        <ErrorBanner
          title={t("errors.agenda_unavailable")}
          message={error.message}
          onRetry={refresh}
        />
      ) : null}
      <DailyAgendaList items={agendaItems} onItemPress={handleAgendaItem} />
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
    agendaHint: {
      fontSize: 12,
      color: theme.textSubtle,
      marginBottom: 10,
      marginTop: -4,
    },
  });
