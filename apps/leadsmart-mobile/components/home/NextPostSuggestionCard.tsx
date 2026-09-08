import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Skeleton } from "../Skeleton";
import { FadeIn } from "../Reveal";
import { hapticButtonPress } from "../../lib/haptics";
import {
  fetchMobileNextPostSuggestions,
  type MobileNextPostSuggestion,
} from "../../lib/leadsmartMobileApi";
import { useThemeTokens } from "../../lib/useThemeTokens";
import type { ThemeTokens } from "../../lib/theme";

/**
 * Home-screen "Suggested next post" card.
 *
 * Deterministic, AI-free recommendations: cross-references the
 * agent's CRM subjects (new listings, upcoming open houses,
 * just-solds) against the last 30 days of published posts to
 * find what they haven't promoted yet. Ranks by urgency (open
 * house tomorrow > new listing this week > just-sold).
 *
 * Tap a row → opens Quick Post pre-filled with the right trigger
 * + subject pre-selected. The wizard reads the deep-link params
 * on mount and auto-picks via the existing onPickSubject path,
 * so the brief lands ready to edit + generate.
 *
 * Auto-hides when there are no suggestions — brand-new agents
 * with no CRM data and seasoned agents who've already posted
 * about everything both see nothing.
 */

const TRIGGER_ICONS: Record<
  MobileNextPostSuggestion["trigger"],
  keyof typeof Ionicons.glyphMap
> = {
  new_listing: "home-outline",
  open_house: "calendar-outline",
  just_sold: "trophy-outline",
};

/** i18n keys under `home.cards.next_post.triggers.*`. */
const TRIGGER_LABELS: Record<MobileNextPostSuggestion["trigger"], string> = {
  new_listing: "cards.next_post.triggers.new_listing",
  open_house: "cards.next_post.triggers.open_house",
  just_sold: "cards.next_post.triggers.just_sold",
};

export function NextPostSuggestionCard() {
  const { t } = useTranslation("home");
  const tokens = useThemeTokens();
  const router = useRouter();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const [items, setItems] = useState<MobileNextPostSuggestion[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetchMobileNextPostSuggestions({ limit: 3 });
    if (res.ok === false) {
      setItems([]);
      return;
    }
    setItems(res.suggestions);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onTap = useCallback(
    (s: MobileNextPostSuggestion) => {
      hapticButtonPress();
      router.push({
        pathname: "/quick-post",
        params: { trigger: s.trigger, subjectId: s.subjectId },
      } as never);
    },
    [router],
  );

  if (items === null) {
    return (
      <View style={styles.cardSkeleton}>
        <Skeleton height={14} width={140} />
        <View style={{ height: 10 }} />
        <Skeleton height={48} />
      </View>
    );
  }
  if (items.length === 0) return null;

  return (
    <FadeIn>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("cards.next_post.title")}</Text>
          <Text style={styles.subtitle}>{t("cards.next_post.ready", { count: items.length })}</Text>
        </View>

        <View style={{ marginTop: 10, gap: 8 }}>
          {items.map((s) => (
            <Pressable
              key={`${s.trigger}:${s.subjectId}`}
              onPress={() => onTap(s)}
              style={({ pressed }) => [
                styles.row,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={styles.iconBubble}>
                <Ionicons
                  name={TRIGGER_ICONS[s.trigger]}
                  size={16}
                  color={tokens.accent}
                />
              </View>
              <View style={styles.rowBody}>
                <View style={styles.metaRow}>
                  <Text style={styles.triggerText}>
                    {t(TRIGGER_LABELS[s.trigger])}
                  </Text>
                  <Text style={styles.reasonText} numberOfLines={1}>
                    · {s.reason}
                  </Text>
                </View>
                <Text style={styles.labelText} numberOfLines={1}>
                  {s.label}
                </Text>
                {s.sub ? (
                  <Text style={styles.subText} numberOfLines={1}>
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
          ))}
        </View>
      </View>
    </FadeIn>
  );
}

function createStyles(tokens: ThemeTokens) {
  return StyleSheet.create({
    card: {
      padding: 14,
      borderRadius: 14,
      backgroundColor: tokens.surface,
      borderWidth: 1,
      borderColor: tokens.border,
      marginBottom: 14,
    },
    cardSkeleton: {
      padding: 14,
      borderRadius: 14,
      backgroundColor: tokens.surface,
      borderWidth: 1,
      borderColor: tokens.border,
      marginBottom: 14,
    },
    header: {},
    title: {
      fontSize: 14,
      fontWeight: "800",
      color: tokens.text,
    },
    subtitle: {
      marginTop: 2,
      fontSize: 11,
      color: tokens.textSubtle,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 10,
      backgroundColor: tokens.bg,
      borderWidth: 1,
      borderColor: tokens.borderSubtle,
    },
    rowPressed: { opacity: 0.7 },
    iconBubble: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.accentLight,
    },
    rowBody: { flex: 1, minWidth: 0 },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    triggerText: {
      fontSize: 11,
      fontWeight: "700",
      color: tokens.accent,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    reasonText: {
      flex: 1,
      fontSize: 11,
      color: tokens.textSubtle,
    },
    labelText: {
      marginTop: 2,
      fontSize: 13,
      fontWeight: "700",
      color: tokens.text,
    },
    subText: {
      marginTop: 1,
      fontSize: 11,
      color: tokens.textSubtle,
    },
  });
}
