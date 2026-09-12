import { RefreshControl, type RefreshControlProps } from "react-native";
import { useThemeTokens } from "../lib/useThemeTokens";

/**
 * Branded `RefreshControl` wrapper.
 *
 * The platform default `RefreshControl` uses iOS system-gray on
 * iOS and Material grey on Android. Both look out of place in
 * CloseBoss's blue brand palette and particularly bad in dark
 * mode where the gray spinner gets lost against the slate-900
 * background. This wrapper threads the active theme's accent
 * color through both `tintColor` (iOS) and `colors`
 * (Android — the prop literally takes an array because Material
 * supports cycling through multiple colors during the spin).
 *
 * `progressBackgroundColor` (Android only) is set to
 * `theme.surface` so the puck behind the spinner blends with
 * the card surfaces in either mode instead of staying pure
 * white in dark mode.
 *
 * Props are forwarded — callers still pass `refreshing` and
 * `onRefresh` directly. Anything they pass for `tintColor` /
 * `colors` overrides the defaults.
 */
export function BrandRefreshControl(props: RefreshControlProps) {
  const tokens = useThemeTokens();
  return (
    <RefreshControl
      tintColor={tokens.accent}
      colors={[tokens.accent]}
      progressBackgroundColor={tokens.surface}
      // Pull `tintColor` for the activity indicator label too on
      // iOS, in case any caller decides to attach a `title` prop.
      titleColor={tokens.accent}
      {...props}
    />
  );
}
