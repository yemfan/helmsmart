"use client";

import { useTranslation } from "react-i18next";

import { useState } from "react";

/**
 * Click-to-call button rendered next to the contact's phone number.
 *
 * On click, POSTs to /api/voice/click-to-call. Twilio bridges the
 * agent's phone to the contact's. The button shows a one-second
 * "Calling…" state while awaiting the API response, then either
 * "Ringing your phone" on success or a structured error code's
 * copy on failure.
 *
 * Errors are intentionally specific (no generic "something went
 * wrong") so the agent knows whether to update Settings, the
 * contact's phone, or wait for ops to wire Twilio.
 */
export function CallButton({
  contactId,
  hasPhone,
}: {
  contactId: string;
  hasPhone: boolean;
}) {
  const { t } = useTranslation("dashboard");
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "calling" }
    | { kind: "ringing" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  if (!hasPhone) return null;

  const onClick = async () => {
    setState({ kind: "calling" });
    try {
      const res = await fetch("/api/voice/click-to-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
      };
      if (res.ok && json.ok) {
        setState({ kind: "ringing" });
        // Reset back to idle after a few seconds so the button can be reused.
        setTimeout(() => setState({ kind: "idle" }), 4000);
      } else {
        setState({
          kind: "error",
          message: friendlyError(json.code, json.error, t),
        });
        setTimeout(() => setState({ kind: "idle" }), 6000);
      }
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
      setTimeout(() => setState({ kind: "idle" }), 6000);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state.kind === "calling" || state.kind === "ringing"}
      className={[
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition",
        state.kind === "ringing"
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : state.kind === "error"
            ? "bg-red-50 text-red-700 ring-1 ring-red-200"
            : "bg-blue-50 text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100 disabled:opacity-60",
      ].join(" ")}
      title={state.kind === "error" ? state.message : t("call.title")}
      aria-label={t("call.ariaLabel")}
    >
      <PhoneIcon />
      {state.kind === "idle" && t("call.call")}
      {state.kind === "calling" && t("call.calling")}
      {state.kind === "ringing" && t("call.ringing")}
      {state.kind === "error" && t("call.failed")}
    </button>
  );
}

function PhoneIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function friendlyError(
  code: string | undefined,
  fallback: string | undefined,
  t: (k: string) => string,
): string {
  switch (code) {
    case "missing_agent_phone":
      return t("call.noAgentPhone");
    case "missing_contact_phone":
      return t("call.noContactPhone");
    case "invalid_phone":
      return t("call.badNumber");
    case "missing_caller_id":
    case "twilio_not_configured":
      return t("call.notConfigured");
    case "twilio_api_failed":
      return t("call.twilioRejected");
    default:
      return fallback ?? t("call.couldNotPlace");
  }
}
