import { useEffect, useMemo, useRef } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";
import { hapticSelectionChange } from "../lib/haptics";
import { useThemeTokens } from "../lib/useThemeTokens";

/**
 * The house on/off switch — emerald when on, slate when off — with the same
 * prop names as React Native's `Switch` so call sites swap in place.
 *
 * Why not the native Switch: it renders iOS green / Android blue-grey and
 * ignores the palette, so the same setting looked different on each platform
 * and different from the web. The design rule (see CLAUDE.md → Toggles) is one
 * switch everywhere, placed directly next to its label.
 */
export function Toggle({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const tokens = useThemeTokens();
  const pos = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(pos, { toValue: value ? 1 : 0, duration: 160, useNativeDriver: true }).start();
  }, [value, pos]);

  const trackColor = value ? tokens.successButton : tokens.neutralScale[300];
  const styles = useMemo(() => createStyles(), []);
  const translateX = pos.interpolate({ inputRange: [0, 1], outputRange: [2, 18] });

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        hapticSelectionChange();
        onValueChange(!value);
      }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={[styles.track, { backgroundColor: trackColor, opacity: disabled ? 0.5 : 1 }]}
    >
      <Animated.View style={[styles.thumb, { transform: [{ translateX }] }]} />
    </Pressable>
  );
}

const createStyles = () =>
  StyleSheet.create({
    track: {
      width: 36,
      height: 20,
      borderRadius: 10,
      justifyContent: "center",
    },
    thumb: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: "#ffffff",
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 1.5,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
  });
