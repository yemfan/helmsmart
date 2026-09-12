import { useColorScheme } from "react-native";
import { darkTheme, lightTheme, type ThemeTokens } from "./theme";

/**
 * Returns the active theme tokens based on the OS color scheme.
 *
 * React Native's `useColorScheme()` is a subscription hook — it
 * re-renders the calling component whenever the user flips dark
 * mode at the OS level, so any screen wired through this hook
 * updates live without a restart.
 *
 * Usage pattern in screens:
 *
 *   const tokens = useThemeTokens();
 *   const styles = useMemo(
 *     () => StyleSheet.create({
 *       root: { backgroundColor: tokens.bg },
 *       title: { color: tokens.text },
 *     }),
 *     [tokens]
 *   );
 *
 * `useMemo` ensures the StyleSheet is only rebuilt when the
 * token set actually changes, not on every render.
 *
 * When `scheme` is `null` (iOS silent-switch or Android before
 * first user choice) we fall back to light — matching the CloseBoss
 * web app which also defaults to light until the user opts in.
 */
export function useThemeTokens(): ThemeTokens {
  const scheme = useColorScheme();
  return scheme === "dark" ? darkTheme : lightTheme;
}

/**
 * Companion hook that returns the boolean for code paths that
 * care about the mode directly (e.g. picking a StatusBar style
 * or an asset variant). Prefer `useThemeTokens()` when you just
 * need colors.
 */
export function useIsDarkMode(): boolean {
  const scheme = useColorScheme();
  return scheme === "dark";
}
