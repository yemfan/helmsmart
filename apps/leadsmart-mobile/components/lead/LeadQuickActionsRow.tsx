import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { presentAiQuickReplyPlaceholder } from "../../lib/lead/aiQuickReplyPlaceholder";
import { buildMailtoUrl, buildSmsUrl, buildTelUrl, normalizePhoneForLinking } from "../../lib/lead/contactLinking";
import { openExternalUrl } from "../../lib/lead/openExternalUrl";
import { postMobileClickToCall } from "../../lib/leadsmartMobileApi";
import { hapticButtonPress, hapticError, hapticSuccess } from "../../lib/haptics";
import { useThemeTokens } from "../../lib/useThemeTokens";
import type { ThemeTokens } from "../../lib/theme";

export type LeadQuickActionsRowProps = {
  leadId: string;
  displayPhone: string | null | undefined;
  email: string;
  /** Contact's display name — used to personalize the AI reply notice (never the raw id). */
  leadName?: string | null;
  /** When true, four equal-width actions in one row (lead detail wireframe). */
  toolbar?: boolean;
};

type ActionKey = "call" | "sms" | "email" | "ai";

/**
 * Action ids only. Labels + hints resolve from i18n at render time —
 * see the JSX below for `t("actions.<id>.label")` / `t("actions.<id>.hint")`.
 */
const ACTION_KEYS: ActionKey[] = ["call", "sms", "email", "ai"];

type CallUiState =
  | { kind: "idle" }
  | { kind: "calling" }
  | { kind: "ringing" }
  | { kind: "error"; message: string };

type LeadComponentsT = (
  key: string,
  options?: Record<string, unknown>,
) => string;

/**
 * Map structured click-to-call error codes to a short chip label.
 * The full message is set as the chip's title so a long-press on iOS
 * (or VoiceOver) reveals the why.
 */
function callErrorLabel(code: string | undefined, t: LeadComponentsT): string {
  switch (code) {
    case "missing_agent_phone":
      return t("call_error.label.missing_agent_phone");
    case "missing_contact_phone":
      return t("call_error.label.missing_contact_phone");
    case "invalid_phone":
      return t("call_error.label.invalid_phone");
    case "twilio_api_failed":
      return t("call_error.label.twilio_api_failed");
    default:
      return t("call_error.label.default");
  }
}

function callErrorDetail(
  code: string | undefined,
  fallback: string | undefined,
  t: LeadComponentsT,
): string {
  switch (code) {
    case "missing_agent_phone":
      return t("call_error.detail.missing_agent_phone");
    case "missing_contact_phone":
      return t("call_error.detail.missing_contact_phone");
    case "invalid_phone":
      return t("call_error.detail.invalid_phone");
    case "missing_caller_id":
    case "twilio_not_configured":
      return t("call_error.detail.twilio_not_configured");
    case "twilio_api_failed":
      return t("call_error.detail.twilio_api_failed");
    default:
      return fallback ?? t("call_error.detail.default");
  }
}

export function LeadQuickActionsRow({ leadId, displayPhone, email, leadName, toolbar }: LeadQuickActionsRowProps) {
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("lead_components");
  const phone = normalizePhoneForLinking(displayPhone);
  const emailTrimmed = email.trim();
  const canCall = Boolean(phone);
  const canSms = Boolean(phone);
  const canEmail = Boolean(emailTrimmed);

  const [callState, setCallState] = useState<CallUiState>({ kind: "idle" });
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const scheduleReset = useCallback((ms: number) => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCallState({ kind: "idle" }), ms);
  }, []);

  /**
   * Click-to-call: ring the agent's own phone via Twilio, then bridge
   * to the contact when answered. The win over `tel:` is logging — the
   * server records every bridge attempt to lead_calls so the timeline
   * stays accurate even when the call is placed from mobile.
   *
   * Fallback: if Twilio is not configured server-side
   * (missing_caller_id / twilio_not_configured), open the device's
   * native dialer so the agent isn't blocked. Other errors surface
   * inline on the chip without falling back, since the tel: dialer
   * wouldn't fix "no phone on file" or "invalid phone".
   */
  const onCall = useCallback(async () => {
    if (!phone) return;
    hapticButtonPress();
    setCallState({ kind: "calling" });
    const res = await postMobileClickToCall(leadId);
    if (res.ok) {
      hapticSuccess();
      setCallState({ kind: "ringing" });
      scheduleReset(4000);
      return;
    }
    if (res.code === "missing_caller_id" || res.code === "twilio_not_configured") {
      // Twilio not wired — drop to the native dialer instead of failing.
      setCallState({ kind: "idle" });
      await openExternalUrl(buildTelUrl(phone), t("open_external_fail.tel"));
      return;
    }
    hapticError();
    setCallState({
      kind: "error",
      message: callErrorDetail(res.code, res.message, t),
    });
    scheduleReset(6000);
  }, [leadId, phone, scheduleReset, t]);

  const onPress = useCallback(
    async (key: ActionKey) => {
      // The `call` branch already fires `hapticButtonPress()` inside
      // `onCall` (right before it kicks off the Twilio bridge). For
      // the other three actions — SMS, Email, AI quick-reply — we
      // fire it here so every chip in the toolbar feels the same on
      // tap, instead of `call` being the only "tactile" one.
      if (key === "call" && phone) {
        await onCall();
        return;
      }
      if (key === "sms" && phone) {
        hapticButtonPress();
        await openExternalUrl(buildSmsUrl(phone), t("open_external_fail.sms"));
        return;
      }
      if (key === "email" && emailTrimmed) {
        hapticButtonPress();
        await openExternalUrl(
          buildMailtoUrl(emailTrimmed),
          t("open_external_fail.email"),
        );
        return;
      }
      if (key === "ai") {
        hapticButtonPress();
        presentAiQuickReplyPlaceholder(leadId, "choose", leadName);
      }
    },
    [leadId, phone, emailTrimmed, leadName, onCall, t],
  );

  const enabled = (key: ActionKey) => {
    if (key === "call") return canCall;
    if (key === "sms") return canSms;
    if (key === "email") return canEmail;
    return true;
  };

  const callLabel = (() => {
    switch (callState.kind) {
      case "calling":
        return t("call_state.calling");
      case "ringing":
        return t("call_state.ringing");
      case "error":
        return callErrorLabel(undefined, t);
      default:
        return t("actions.call.label");
    }
  })();

  return (
    <View
      style={[styles.wrap, toolbar && styles.wrapToolbar]}
      accessibilityRole="toolbar"
      accessibilityLabel={t("actions.toolbar_a11y")}
    >
      {ACTION_KEYS.map((key) => {
        const isEnabled = enabled(key);
        const isCall = key === "call";
        const callBusy = isCall && (callState.kind === "calling" || callState.kind === "ringing");
        const callErrored = isCall && callState.kind === "error";
        const label = t(`actions.${key}.label`);
        const hint = t(`actions.${key}.hint`);
        const displayLabel = isCall ? callLabel : label;
        const displayHint = isCall && callState.kind === "error" ? callState.message : hint;
        return (
          <Pressable
            key={key}
            style={({ pressed }) => [
              styles.chip,
              toolbar && styles.chipToolbar,
              !isEnabled && styles.chipDisabled,
              callBusy && styles.chipBusy,
              callErrored && styles.chipError,
              pressed && isEnabled && !callBusy && styles.chipPressed,
            ]}
            onPress={() => void onPress(key)}
            disabled={(key !== "ai" && !isEnabled) || callBusy}
            accessibilityRole="button"
            accessibilityLabel={displayLabel}
            accessibilityHint={displayHint}
            accessibilityState={{ disabled: (key !== "ai" && !isEnabled) || callBusy, busy: callBusy }}
          >
            <Text
              style={[
                styles.chipLabel,
                !isEnabled && key !== "ai" && styles.chipLabelDisabled,
                callBusy && styles.chipLabelBusy,
                callErrored && styles.chipLabelError,
              ]}
              numberOfLines={1}
            >
              {displayLabel}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
  },
  wrapToolbar: {
    marginTop: 0,
    paddingTop: 0,
    borderTopWidth: 0,
    flexWrap: "nowrap",
  },
  chip: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.border,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  chipToolbar: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
  },
  chipPressed: {
    backgroundColor: theme.surfaceElevated,
  },
  chipDisabled: {
    opacity: 0.45,
  },
  chipBusy: {
    backgroundColor: theme.infoBg,
    borderColor: theme.infoText,
  },
  chipError: {
    backgroundColor: theme.dangerBg,
    borderColor: theme.dangerText,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.accent,
  },
  chipLabelDisabled: {
    color: theme.textMuted,
  },
  chipLabelBusy: {
    color: theme.infoText,
  },
  chipLabelError: {
    color: theme.dangerText,
  },
});