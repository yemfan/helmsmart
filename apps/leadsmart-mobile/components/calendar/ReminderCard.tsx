import type { MobileFollowUpReminderDto } from "@leadsmart/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatShortDateTime } from "../../lib/format";
import { useThemeTokens } from "../../lib/useThemeTokens";
import type { ThemeTokens } from "../../lib/theme";

type Props = {
  reminder: MobileFollowUpReminderDto;
  onPress?: () => void;
};

/** CRM follow-up touchpoint (`leads.next_contact_at`). */
export function ReminderCard({ reminder, onPress }: Props) {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("calendar_screen");
  const title = reminder.lead_name ?? t("reminder_card.unnamed");
  const status = reminder.overdue
    ? t("reminder_card.status.overdue")
    : t("reminder_card.status.scheduled");

  const body = (
    <View style={[styles.card, reminder.overdue && styles.cardOverdue]}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.sub}>
        {status} · {formatShortDateTime(reminder.next_contact_at)}
      </Text>
      <Text style={styles.hint}>{t("reminder_card.hint")}</Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
        {body}
      </Pressable>
    );
  }

  return body;
}

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      marginVertical: 6,
    },
    cardOverdue: {
      borderColor: theme.overdueBorder,
      backgroundColor: theme.overdueBg,
    },
    pressed: { opacity: 0.92 },
    title: { fontSize: 16, fontWeight: "600", color: theme.text },
    sub: { marginTop: 6, fontSize: 14, color: theme.textMuted, fontWeight: "500" },
    hint: { marginTop: 8, fontSize: 12, color: theme.accent, fontWeight: "600" },
  });
