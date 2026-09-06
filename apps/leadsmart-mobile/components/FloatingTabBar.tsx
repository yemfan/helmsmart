import { useMemo, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ThemeTokens } from "../lib/theme";
import { useThemeTokens } from "../lib/useThemeTokens";

/**
 * The bottom bar as a floating pill, the selected tab lifted in its own
 * rounded well — the shape the web app's mobile competitors use, and the
 * one the CEO pointed at.
 *
 * Deliberately NOT absolutely positioned: it sits in normal layout flow
 * with the screen background showing around it, so no screen has to learn a
 * new bottom inset and nothing scrolls underneath it.
 *
 * Typed structurally rather than importing BottomTabBarProps: the tab
 * navigator's package is a transitive dependency of expo-router and is not
 * resolvable from this workspace under pnpm's strict layout.
 */
type TabRoute = { key: string; name: string };
type TabOptions = {
  title?: string;
  tabBarLabel?: string | ((p: { focused: boolean; color: string }) => ReactNode);
  tabBarIcon?: (p: { focused: boolean; color: string; size: number }) => ReactNode;
  tabBarAccessibilityLabel?: string;
};
export type FloatingTabBarProps = {
  state: { index: number; routes: TabRoute[] };
  descriptors: Record<string, { options: TabOptions }>;
  navigation: {
    emit: (e: { type: "tabPress"; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
  /** Routes shown on the bar, in order. Everything else stays reachable by push. */
  visible: readonly string[];
};

export function FloatingTabBar({ state, descriptors, navigation, visible }: FloatingTabBarProps) {
  const tokens = useThemeTokens();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const routes = visible
    .map((name) => state.routes.find((r) => r.name === name))
    .filter((r): r is TabRoute => Boolean(r));
  const activeKey = state.routes[state.index]?.key;

  return (
    <View style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.pill}>
        {routes.map((route) => {
          const { options } = descriptors[route.key] ?? { options: {} };
          const focused = route.key === activeKey;
          const color = focused ? tokens.accent : tokens.neutralScale[400];
          const label =
            typeof options.tabBarLabel === "string"
              ? options.tabBarLabel
              : options.title ?? route.name;
          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              style={styles.item}
            >
              <View style={[styles.well, focused && styles.wellActive]}>
                {options.tabBarIcon?.({ focused, color, size: 22 })}
                <Text style={[styles.label, { color }]} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    outer: {
      backgroundColor: theme.bg,
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      height: 68,
      borderRadius: 34,
      paddingHorizontal: 8,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      ...theme.elevation.raised,
      ...(Platform.OS === "android" ? { elevation: 6 } : {}),
    },
    item: { flex: 1, alignItems: "center", justifyContent: "center" },
    well: {
      minWidth: 56,
      height: 56,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 6,
      gap: 2,
    },
    wellActive: { backgroundColor: theme.accentLight },
    label: { fontSize: 10, fontWeight: "600" },
  });
