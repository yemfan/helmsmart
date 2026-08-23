"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  SALES_MODEL_ORDER,
  salesModels,
  type SalesModelId,
} from "@/lib/sales-models";

/**
 * Modal for switching the active sales model from the dashboard.
 *
 * Two-step UX:
 *   1. Pick a different model (radio cards in a column).
 *   2. Confirm — the warning copy is the user's last chance to back
 *      out before the dashboard rebrands itself.
 *
 * Submits via the parent `onConfirm` async callback (which writes to
 * Supabase + localStorage). The modal closes on success and stays open
 * with an inline error message on failure.
 */
export function SwitchModelModal({
  open,
  currentModel,
  onClose,
  onConfirm,
}: {
  open: boolean;
  currentModel: SalesModelId;
  onClose: () => void;
  onConfirm: (next: SalesModelId) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { t } = useTranslation("dashboard");
  const [picked, setPicked] = useState<SalesModelId>(currentModel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPicked(currentModel);
      setBusy(false);
      setError(null);
    }
  }, [open, currentModel]);

  // Esc-to-close — common keyboard a11y expectation for modals.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await onConfirm(picked);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not switch model. Try again.");
      return;
    }
    onClose();
  };

  const isSame = picked === currentModel;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="switch-model-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={(e) => {
        // Only the backdrop closes — clicks inside the dialog
        // shouldn't bubble up.
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-900/10">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 id="switch-model-title" className="text-lg font-semibold text-slate-900">{t("pages.switchModel.title")}</h2>
          <p className="mt-1 text-sm text-slate-600">{t("pages.switchModel.sub")}</p>
        </div>

        <div className="max-h-[55vh] space-y-2 overflow-y-auto px-6 py-4">
          {SALES_MODEL_ORDER.map((id) => {
            const m = salesModels[id];
            const checked = picked === id;
            return (
              <label
                key={id}
                className={[
                  "flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-3 transition",
                  checked
                    ? "border-blue-500 ring-2 ring-blue-500/20"
                    : "border-slate-200 hover:border-slate-300",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="sales-model-switch"
                  value={id}
                  checked={checked}
                  onChange={() => setPicked(id)}
                  className="mt-1 h-4 w-4 accent-blue-600"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xl" aria-hidden>
                      {m.emoji}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">
                      {m.name}
                    </span>
                    {m.recommended ? (
                      <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">{t("pages.switchModel.recommended")}</span>
                    ) : null}
                    {id === currentModel ? (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">{t("pages.switchModel.current")}</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{m.description}</p>
                </div>
              </label>
            );
          })}
        </div>

        {error ? (
          <div className="border-t border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          >{t("pages.switchModel.cancel")}</button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || isSame}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy
              ? t("common:status.switching")
              : isSame
                ? t("pages.switchModel.sameAsCurrent")
                : `Switch to ${salesModels[picked].name}`}
          </button>
        </div>
      </div>
    </div>
  );
}
