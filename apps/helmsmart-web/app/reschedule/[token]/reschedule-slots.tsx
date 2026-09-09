"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

type Slot = { startISO: string; label: string };

export function RescheduleSlots({ token, slots }: { token: string; slots: Slot[] }) {
  const { t } = useTranslation("public");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [confirmed, setConfirmed] = useState("");
  const [error, setError] = useState("");

  async function pick(slot: Slot) {
    setStatus("saving");
    setError("");
    try {
      const res = await fetch(`/api/reschedule/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: slot.startISO }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; label?: string; error?: string };
      if (!res.ok || !data.ok) {
        /*
         * The API's own `reason` is English prose built in `lib/booking.ts`
         * ("That time was just taken.", "Couldn't reschedule — please try
         * another time."), and this page is read by a customer who may not
         * have English. Every one of those reasons means the same thing to
         * the person choosing a slot, so the reader gets that one sentence in
         * their own language rather than a fluent English near-miss.
         */
        setError(t("reschedule.slots.unavailable"));
        setStatus("error");
        return;
      }
      setConfirmed(data.label || slot.label);
      setStatus("done");
    } catch {
      setError(t("reschedule.slots.error"));
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 12, padding: "20px 24px", textAlign: "center" }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: "#047857", margin: "0 0 4px" }}>{t("reschedule.slots.doneTitle")}</p>
        <p style={{ fontSize: 14, color: "#065f46", margin: 0 }}>{t("reschedule.slots.doneBody", { when: confirmed })}</p>
      </div>
    );
  }

  return (
    <div>
      {status === "error" && (
        <p style={{ fontSize: 13, color: "#f43f5e", margin: "0 0 12px" }}>{error}</p>
      )}
      {slots.length === 0 ? (
        <p style={{ fontSize: 14, color: "#94a3b8" }}>{t("reschedule.slots.none")}</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
          {slots.map((s) => (
            <button
              key={s.startISO}
              disabled={status === "saving"}
              onClick={() => pick(s)}
              style={{
                padding: "12px 10px",
                background: "#fff",
                border: "1px solid #d2e8fb",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                color: "#1e88e5",
                cursor: status === "saving" ? "default" : "pointer",
                opacity: status === "saving" ? 0.6 : 1,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
