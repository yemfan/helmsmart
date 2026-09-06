"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Toggle } from "@/components/ui/Toggle";

/**
 * Per-contact Auto Pilot — when on, the AI answers this contact's inbound
 * texts on its own (the Twilio webhook reads `contacts.auto_pilot`).
 *
 * This switch used to live only inside the floating "AI Guide" bubble, which
 * was retired in favour of Ask Max. It now sits where the conversation is:
 * the Conversations thread header and the lead profile.
 *
 * Optimistic flip, reverted with a reason if the save is refused — a switch
 * must never show a state the database does not hold.
 */
export function AutoPilotToggle({
  contactId,
  initial,
  size = "md",
  showHint = false,
}: {
  contactId: string;
  initial: boolean;
  size?: "sm" | "md";
  /** Explain what the switch does under the label (lead profile); the thread header keeps it as a tooltip. */
  showHint?: boolean;
}) {
  const { t } = useTranslation("dashboard");
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new contact in the same mounted header starts from its own value.
  useEffect(() => {
    setOn(initial);
    setError(null);
  }, [contactId, initial]);

  async function change(next: boolean) {
    setOn(next);
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/dashboard/sms/auto-pilot", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, enabled: next }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error || t("inbox.autoPilotFailed"));
    } catch (e) {
      setOn(!next);
      setError(e instanceof Error && e.message ? e.message : t("inbox.autoPilotFailed"));
    } finally {
      setSaving(false);
    }
  }

  const hint = t("inbox.autoPilotHint");
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2" title={showHint ? undefined : hint}>
        <Toggle checked={on} onChange={change} disabled={saving} label={t("inbox.autoPilot")} size={size} />
        <span className={`font-medium ${size === "sm" ? "text-xs" : "text-sm"} ${on ? "text-emerald-700 dark:text-emerald-400" : "text-slate-600 dark:text-slate-400"}`}>
          {t("inbox.autoPilot")}
        </span>
      </div>
      {showHint && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      {error && (
        <p className="text-xs text-rose-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
