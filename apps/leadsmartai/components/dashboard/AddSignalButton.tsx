"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import type { ContactSignalType } from "@/lib/contacts/types";

const TYPES: { value: ContactSignalType; label: string; defaultAction: string }[] = [
  {
    value: "equity_milestone",
    label: "Equity milestone",
    defaultAction: "Send EM-01 equity milestone SMS",
  },
  {
    value: "refi_detected",
    label: "Refi detected",
    defaultAction: "Call — offer free home-value check",
  },
  {
    value: "job_change",
    label: "Job change",
    defaultAction: "Call — likely selling, offer referral",
  },
  {
    value: "listing_activity",
    label: "Listing activity nearby",
    defaultAction: "Send JS-01 comparable sale SMS",
  },
  {
    value: "anniversary_due",
    label: "Anniversary due",
    defaultAction: "Send HA-01 home anniversary SMS",
  },
  { value: "life_event_other", label: "Other life event", defaultAction: "" },
];

const CONFIDENCE = ["low", "medium", "high"] as const;

export default function AddSignalButton({
  contactId,
  variant = "primary",
  label,
}: {
  contactId: string;
  variant?: "primary" | "ghost";
  label?: string;
}) {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ContactSignalType>("equity_milestone");
  const [signalLabel, setSignalLabel] = useState("");
  const [confidence, setConfidence] = useState<(typeof CONFIDENCE)[number]>("medium");
  const [suggestedAction, setSuggestedAction] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setType("equity_milestone");
    setSignalLabel("");
    setConfidence("medium");
    setSuggestedAction("");
    setError(null);
  }

  function pickType(t: ContactSignalType) {
    setType(t);
    const preset = TYPES.find((x) => x.value === t);
    if (preset && !suggestedAction) setSuggestedAction(preset.defaultAction);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!signalLabel.trim()) {
      setError("Label required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/sphere/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          type,
          label: signalLabel,
          confidence,
          suggestedAction: suggestedAction.trim() || null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Create failed");
      setOpen(false);
      reset();
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={
        variant === "primary"
          ? "rounded-lg bg-brand-accent px-3 py-2 text-xs font-medium text-white hover:opacity-90"
          : "rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
      }
    >
      + {label ?? t("pages.addSignalButton.addSignal")}
    </button>
  );

  if (!open) return trigger;

  return (
    <>
      {trigger}
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <form
          onSubmit={(e) => void submit(e)}
          className="w-full max-w-md space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
        >
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t("pages.addSignal.title")}</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Signals surface on the contact profile and the Signals page. Per spec §2.6.3, they
              never auto-send — they&apos;re a calling list.
            </p>
          </div>

          <label className="block">
            <span className="text-[11px] font-medium text-gray-500">{t("pages.addSignal.type")}</span>
            <select
              value={type}
              onChange={(e) => pickType(e.target.value as ContactSignalType)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-gray-500">{t("pages.addSignal.label")}</span>
            <input
              type="text"
              value={signalLabel}
              onChange={(e) => setSignalLabel(e.target.value)}
              placeholder={t("pages.addSignal.labelPlaceholder")}
              maxLength={200}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              autoFocus
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-gray-500">{t("pages.addSignal.confidence")}</span>
            <div className="mt-1 inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5 text-xs">
              {CONFIDENCE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setConfidence(c)}
                  className={`rounded px-3 py-1 font-medium capitalize ${
                    confidence === c
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-gray-500">{t("pages.addSignal.suggestedAction")}<span className="text-gray-400">(optional)</span>
            </span>
            <textarea
              value={suggestedAction}
              onChange={(e) => setSuggestedAction(e.target.value)}
              rows={2}
              maxLength={500}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              className="rounded-lg px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
            >{t("pages.addSignal.cancel")}</button>
            <button
              type="submit"
              disabled={saving || !signalLabel.trim()}
              className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? t("common:status.saving") : t("pages.addSignalButton.addSignal")}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
