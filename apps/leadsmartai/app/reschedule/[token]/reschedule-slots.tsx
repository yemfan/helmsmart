"use client";

import { useState } from "react";

type Slot = { startISO: string; label: string };

/**
 * Pick a new time. Ported from HelmSmart, which has had self-serve reschedule
 * since it shipped, so both products behave the same way.
 *
 * A slot can be gone between the page rendering and the tap — the link lives in
 * a text message and may be opened days later — so a rejection is a normal
 * outcome here, not an error state to apologise for. It says which, and leaves
 * the other times tappable.
 */
export function RescheduleSlots({ token, slots }: { token: string; slots: Slot[] }) {
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
        setError(data.error || "That time isn't available anymore — please pick another.");
        setStatus("error");
        return;
      }
      setConfirmed(data.label || slot.label);
      setStatus("done");
    } catch {
      setError("Something went wrong — please try again.");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-5 text-center">
        <p className="text-base font-bold text-emerald-700">You&apos;re rescheduled ✓</p>
        <p className="mt-1 text-sm text-emerald-800">New time: {confirmed}.</p>
      </div>
    );
  }

  return (
    <div>
      {status === "error" && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      {slots.length === 0 ? (
        <p className="text-sm text-slate-400">No open times that day — try another day above.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {slots.map((s) => (
            <button
              key={s.startISO}
              type="button"
              disabled={status === "saving"}
              onClick={() => pick(s)}
              className="rounded-xl border border-blue-100 bg-white px-3 py-3 text-sm font-semibold text-blue-600 transition hover:border-blue-300 disabled:opacity-60"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
