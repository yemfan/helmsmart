import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Skeleton } from "../Skeleton";
import { FadeIn } from "../Reveal";
import { hapticButtonPress } from "../../lib/haptics";
import {
  fetchMobileTopPosts,
  type MobileTopPost,
} from "../../lib/closeBossMobileApi";
import { useThemeTokens } from "../../lib/useThemeTokens";
import type { ThemeTokens } from "../../lib/theme";

/**
 * Home-screen "Engagement" card.
 *
 * Surfaces the agent's top-engagement posts from the last 14 days
 * so they can SEE what's working without navigating to Posts.
 * Renders the top 3 posts ranked by likes + comments + shares +
 * saves. Tap a row → opens the live post on Meta. Tap header →
 * jumps to the full Posts history.
 *
 * Empty-state policy: until the agent has at least one post with
 * non-zero metrics, the card stays hidden entirely (no point
 * occupying scarce home-screen real estate with a stub). The
 * server returns `hasMetrics: false` for this state.
 */
export function EngagementCard() {
  const { t } = useTranslation("home");
  const tokens = useThemeTokens();
  const router = useRouter();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const [items, setItems] = useState<MobileTopPost[]>([]);
  const [hasMetrics, setHasMetrics] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchMobileTopPosts({ limit: 3, windowDays: 14 });
    setLoading(false);
    if (res.ok === false) {
      // Quiet failure on Home — the surface is supplementary, an
      // error here shouldn't disrupt the rest of the screen.
      setItems([]);
      setHasMetrics(false);
      return;
    }
    setItems(res.items);
    setHasMetrics(res.hasMetrics);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Skeleton state — render quickly so the home screen doesn't
  // pop on data arrival. Render the same height as the loaded
  // card to avoid layout shift.
  if (loading || hasMetrics === null) {
    return (
      <View style={styles.cardSkeleton}>
        <Skeleton height={14} width={120} />
        <View style={{ height: 10 }} />
        <Skeleton height={56} />
      </View>
    );
  }

  // Hidden until there's something worth showing.
  if (!hasMetrics || items.length === 0) {
    return null;
  }

  return (
    <FadeIn>
      <View style={styles.card}>
        <Pressable
          onPress={() => {
            hapticButtonPress();
            router.push("/post-history" as never);
          }}
          style={styles.header}
        >
          <Text style={styles.title}>{t("cards.engagement.title")}</Text>
          <View style={styles.headerRight}>
            <Text style={styles.headerLink}>{t("cards.engagement.all_posts")}</Text>
            <Ionicons
              name="chevron-forward"
              size={14}
              color={tokens.accent}
            />
          </View>
        </Pressable>
        <Text style={styles.subtitle}>
          Top {items.length === 1 ? "post" : `${items.length} posts`} from the
          last 14 days
        </Text>

        <View style={{ marginTop: 12, gap: 10 }}>
          {items.map((item, idx) => (
            <PostRow
              key={item.id}
              item={item}
              rank={idx + 1}
              tokens={tokens}
              styles={styles}
            />
          ))}
        </View>
      </View>
    </FadeIn>
  );
}

function PostRow({
  item,
  rank,
  tokens,
  styles,
}: {
  item: MobileTopPost;
  rank: number;
  tokens: ThemeTokens;
  styles: ReturnType<typeof createStyles>;
}) {
  const accountName =
    item.pageName ??
    item.igBusinessUsername ??
    item.linkedinDisplayName ??
    "—";
  const { t } = useTranslation("home");
  const platformLabel =
    item.platform === "facebook"
      ? "FB"
      : item.platform === "instagram"
        ? "IG"
        : item.platform === "linkedin"
          ? "LI"
          : item.platform;

  const onPress = () => {
    hapticButtonPress();
    if (item.externalPostUrl) {
      void Linking.openURL(item.externalPostUrl);
    }
  };

  // Compact engagement summary — show the two highest non-null
  // counters so the row stays readable. Likes + comments are the
  // most universal, but if a post got more saves than likes (great
  // signal on IG), surface that instead.
  const cells: Array<{ label: string; value: number | null }> = [
    { label: "cards.engagement.likes", value: item.metrics.likes ?? null },
    { label: "cards.engagement.comments", value: item.metrics.comments ?? null },
    { label: "cards.engagement.shares", value: item.metrics.shares ?? null },
    { label: "cards.engagement.saves", value: item.metrics.saves ?? null },
  ];
  const ranked = cells
    .filter((c) => (c.value ?? 0) > 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 3);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {item.thumbnailUrl ? (
        <Image
          source={{ uri: item.thumbnailUrl }}
          style={styles.thumb}
        />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Text style={styles.thumbRank}>#{rank}</Text>
        </View>
      )}

      <View style={styles.rowBody}>
        <View style={styles.metaRow}>
          <View style={styles.platformPill}>
            <Text style={styles.platformPillText}>{platformLabel}</Text>
          </View>
          <Text style={styles.accountText} numberOfLines={1}>
            {accountName}
          </Text>
          <Text style={styles.scoreText}>
            {item.engagementScore.toLocaleString()} eng
          </Text>
        </View>
        <Text style={styles.caption} numberOfLines={2}>
          {item.caption}
        </Text>
        {ranked.length > 0 && (
          <View style={styles.cellRow}>
            {ranked.map((c) => (
              <Text key={c.label} style={styles.cell}>
                <Text style={styles.cellValue}>{c.value!.toLocaleString()}</Text>{" "}
                {t(c.label).toLowerCase()}
              </Text>
            ))}
          </View>
        )}
      </View>
    </Pressable>
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
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
    },
    title: {
      fontSize: 14,
      fontWeight: "800",
      color: tokens.text,
    },
    headerLink: {
      fontSize: 12,
      fontWeight: "700",
      color: tokens.accent,
    },
    subtitle: {
      marginTop: 2,
      fontSize: 11,
      color: tokens.textSubtle,
    },
    row: {
      flexDirection: "row",
      gap: 10,
      paddingVertical: 8,
      paddingHorizontal: 8,
      borderRadius: 10,
      backgroundColor: tokens.bg,
      borderWidth: 1,
      borderColor: tokens.borderSubtle,
    },
    rowPressed: { opacity: 0.7 },
    thumb: {
      width: 48,
      height: 48,
      borderRadius: 8,
      backgroundColor: tokens.surface,
    },
    thumbFallback: {
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: tokens.border,
    },
    thumbRank: {
      fontSize: 14,
      fontWeight: "800",
      color: tokens.textSubtle,
    },
    rowBody: { flex: 1, minWidth: 0 },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    platformPill: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 6,
      backgroundColor: tokens.accentLight,
    },
    platformPillText: {
      fontSize: 10,
      fontWeight: "800",
      color: tokens.accent,
      letterSpacing: 0.5,
    },
    accountText: {
      flex: 1,
      fontSize: 11,
      fontWeight: "600",
      color: tokens.text,
    },
    scoreText: {
      fontSize: 11,
      fontWeight: "800",
      color: tokens.text,
    },
    caption: {
      marginTop: 3,
      fontSize: 12,
      lineHeight: 16,
      color: tokens.text,
    },
    cellRow: {
      marginTop: 4,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    cell: {
      fontSize: 11,
      color: tokens.textSubtle,
    },
    cellValue: {
      fontWeight: "700",
      color: tokens.text,
    },
  });
}
