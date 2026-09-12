import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Thin wrapper around `expo-haptics` that adds three things the
 * raw API doesn't give you:
 *
 * 1. **No-op on web / unsupported platforms.** `expo-haptics`
 *    throws on web and on iOS simulators without a supporting
 *    Taptic engine. We catch those silently so screens don't
 *    have to branch on `Platform.OS === "web"` every time.
 * 2. **Debouncing.** Back-to-back taps on a tab or button can
 *    fire the impact engine twice within a frame, which feels
 *    muddy. We drop anything that fires within 40ms of the
 *    previous event — short enough that intentional taps always
 *    go through, long enough to kill the double-fire.
 * 3. **Semantic names.** Callers pick the role (`tabSwitch`,
 *    `rowTap`, `success`, `warning`, `error`, `destructive`)
 *    rather than the expo primitive, so if Apple ever changes
 *    the preferred mapping we fix it in one place.
 *
 * Haptics are OFF on Android by default — Android uses
 * system-wide vibration preferences and most apps leave row
 * taps silent. iOS is where the feel actually matters.
 */

let lastFiredAt = 0;
const DEBOUNCE_MS = 40;

function canFire(): boolean {
  if (Platform.OS === "web") return false;
  // Android respects the user's system vibration toggle via
  // the native layer, but the Taptic fidelity there is rough
  // enough that we'd rather stay silent unless the user opts
  // in. iOS is where CloseBoss's target users spend their day.
  if (Platform.OS !== "ios") return false;

  const now = Date.now();
  if (now - lastFiredAt < DEBOUNCE_MS) return false;
  lastFiredAt = now;
  return true;
}

function safeImpact(style: Haptics.ImpactFeedbackStyle) {
  if (!canFire()) return;
  Haptics.impactAsync(style).catch(() => {
    // Simulator / missing Taptic engine — stay silent.
  });
}

function safeNotification(type: Haptics.NotificationFeedbackType) {
  if (!canFire()) return;
  Haptics.notificationAsync(type).catch(() => {});
}

function safeSelection() {
  if (!canFire()) return;
  Haptics.selectionAsync().catch(() => {});
}

/**
 * Tab bar press — system-native "selection changed" tick.
 * Lightest feedback we have; fires every time you switch tabs.
 */
export function hapticTabSwitch() {
  safeSelection();
}

/**
 * Row tap — opening a lead, a thread, an appointment, etc.
 * Uses a light impact so the row feels "picked up" without
 * being startling on every scroll.
 */
export function hapticRowTap() {
  safeImpact(Haptics.ImpactFeedbackStyle.Light);
}

/**
 * Primary button / confirm action (e.g. "Save appointment",
 * "Send reply", "Sign in"). Medium impact — distinct from a
 * row tap but still subtle.
 */
export function hapticButtonPress() {
  safeImpact(Haptics.ImpactFeedbackStyle.Medium);
}

/**
 * Toggling a filter chip, picking a priority, or any other
 * "I just changed a selection" moment. System-native tick.
 */
export function hapticSelectionChange() {
  safeSelection();
}

/**
 * Task completed, message sent, appointment booked. Plays the
 * iOS success notification pattern (double-tap ascending).
 */
export function hapticSuccess() {
  safeNotification(Haptics.NotificationFeedbackType.Success);
}

/**
 * Form validation error, API failure, stale data. iOS error
 * pattern (triple buzz).
 */
export function hapticError() {
  safeNotification(Haptics.NotificationFeedbackType.Error);
}

/**
 * Warning before destructive action (sign out, delete, cancel
 * appointment). iOS warning pattern.
 */
export function hapticWarning() {
  safeNotification(Haptics.NotificationFeedbackType.Warning);
}

/**
 * Long-press, swipe-to-delete confirm, or any other "heavy"
 * gesture. Heavy impact.
 */
export function hapticDestructive() {
  safeImpact(Haptics.ImpactFeedbackStyle.Heavy);
}
