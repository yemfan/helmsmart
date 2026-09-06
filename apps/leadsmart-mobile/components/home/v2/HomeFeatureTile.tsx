import { useRouter, type Href } from "expo-router";
import { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { hapticSelectionChange } from "../../../lib/haptics";
import { useThemeTokens } from "../../../lib/useThemeTokens";
import type { ThemeTokens } from "../../../lib/theme";

/**
 * Single feature tile in the v1.6 Home redesign — an icon-on-tinted-square
 * with a label below. Tapping pushes the tile's `href` and fires a light
 * selection haptic so the press feels deliberate.
 *
 * Accent color is provided by the caller (the parent Section header picks
 * a per-supercategory accent from the theme — see
 * `apps/leadsmart-mobile/docs/HOME_REDESIGN_PLAN.md` for the mapping).
 * Defaulting to `tokens.accent` keeps any future ad-hoc usage on brand.
 *
 * The optional `badge` prop renders a tiny rounded pill in the top-right
 * — used for "HOT" / "VIP" / "NEW" callouts. Pill color follows the badge
 * variant, not the tile accent, so the badge stays visible against any
 * accent background.
 */
export type HomeFeatureTileProps = {
  /** Lucide icon component (or any 24px-friendly React element). */
  icon: React.ReactNode;
  /** Visible label below the icon. Localize at the call site. */
  label: string;
  /** Expo Router target. Either a string path or a typed-route object. */
  href: Href;
  /** Hex / token color for the icon foreground + tinted background.
   *  Defaults to the brand accent. */
  accentColor?: string;
  /** Optional top-right badge — "HOT" (rose), "VIP" (amber), "NEW" (emerald). */
  badge?: { label: string; variant?: "hot" | "vip" | "new" };
  /** Width override — defaults to a 3-col grid cell (see HomeFeatureGrid). */
  style?: StyleProp<ViewStyle>;
  /** Accessibility hint when label alone is ambiguous. */
  accessibilityHint?: string;
};

export function HomeFeatureTile({
  icon,
  label,
  href,
  accentColor,
  badge,
  style,
  accessibilityHint,
}: HomeFeatureTileProps) {
  const router = useRouter();
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const tint = accentColor ?? tokens.accent;
  // Solid vibrant fill (colorful app-icon style, per the reference design)
  // with a white glyph. The caller passes the icon already colored white;
  // we draw the bubble in the tile's own hue.
  const iconBg = tint;

  const badgeVariant = badge?.variant ?? "hot";
  const badgeColor =
    badgeVariant === "vip"
      ? tokens.warning
      : badgeVariant === "new"
      ? tokens.success
      : tokens.danger;

  const onPress = () => {
    hapticSelectionChange();
    router.push(href);
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        style,
        pressed && styles.tilePressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
    >
      <View style={[styles.iconBubble, { backgroundColor: iconBg, shadowColor: tint }]}>
        {/* The caller passes the icon already configured with size + color.
            Wrapping in a View so accessibility focus lands on the Pressable,
            not the icon itself. */}
        <View pointerEvents="none">
          {icon}
        </View>
      </View>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: badgeColor }]}>
          <Text style={styles.badgeText}>{badge.label}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    tile: {
      // Transparent — the tile is now content inside the section card,
      // so only the card draws a surface/border (the "block" look). Width
      // is controlled by HomeFeatureGrid's 3-col cell.
      paddingVertical: 10,
      paddingHorizontal: 4,
      alignItems: "center",
      justifyContent: "flex-start",
      minHeight: 92,
    },
    tilePressed: {
      opacity: 0.6,
    },
    iconBubble: {
      width: 50,
      height: 50,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
      // Soft colored glow gives the solid tiles depth, like an app-icon grid.
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 5,
      elevation: 3,
    },
    label: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.text,
      textAlign: "center",
      lineHeight: 15,
    },
    badge: {
      position: "absolute",
      top: 6,
      right: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
      minWidth: 26,
      alignItems: "center",
    },
    badgeText: {
      color: "#fff",
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 0.3,
    },
  });
