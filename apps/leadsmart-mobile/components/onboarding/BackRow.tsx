import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useOnboardingStyles } from "../../lib/onboarding/styles";

/**
 * Thin back-chevron row for onboarding screens.
 *
 * The onboarding stack uses `headerShown: false` across all four
 * screens so users can focus on the marketing copy. That worked
 * for the forward path (welcome → value → login → notifications)
 * but left users stranded if they hit "Next" by accident — Expo
 * Router's native gesture back works on iOS but is unreliable on
 * Android, and there was nothing clickable on screen.
 *
 * This component:
 * - Only renders when `router.canGoBack()` is true, so the first
 *   screen in the stack stays clean.
 * - Uses a 44×44 hit target (WCAG 2.5.5).
 * - Falls back to a provided `fallbackHref` if back is unavailable
 *   (useful when the screen is entered via deep link).
 */
export function BackRow({ fallbackHref }: { fallbackHref?: string }) {
  const router = useRouter();
  const s = useOnboardingStyles();
  const { t } = useTranslation("onboarding");
  const canGoBack = router.canGoBack();

  if (!canGoBack && !fallbackHref) {
    // Keep the vertical space so layouts don't jump when the
    // back button appears/disappears between screens.
    return <View style={s.backRow} />;
  }

  return (
    <View style={s.backRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("back.a11y")}
        accessibilityHint={t("back.hint")}
        onPress={() => {
          if (canGoBack) {
            router.back();
          } else if (fallbackHref) {
            router.replace(fallbackHref as never);
          }
        }}
        style={({ pressed }) => [s.backButton, pressed && s.backButtonPressed]}
        hitSlop={8}
      >
        <Text style={s.backButtonText}>‹</Text>
      </Pressable>
    </View>
  );
}
