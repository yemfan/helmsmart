"use client";

import { useState, useTransition } from "react";

import { setPlaybookAutoAction } from "./actions";

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium text-slate-900 dark:text-white">{label}</span>
        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
          checked ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"
        } disabled:opacity-50`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

/**
 * Opt-in auto-start toggles. When on, opening a listing transaction auto-starts
 * the selling playbook, and opening a buyer transaction the buying playbook.
 */
export function AutoSettingsCard({ autoSelling, autoBuying }: { autoSelling: boolean; autoBuying: boolean }) {
  const [selling, setSelling] = useState(autoSelling);
  const [buying, setBuying] = useState(autoBuying);
  const [pending, startTransition] = useTransition();

  function update(next: { autoSelling?: boolean; autoBuying?: boolean }) {
    if (next.autoSelling !== undefined) setSelling(next.autoSelling);
    if (next.autoBuying !== undefined) setBuying(next.autoBuying);
    startTransition(async () => {
      await setPlaybookAutoAction(next);
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Auto-start</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Let the AI team start a playbook automatically from your transactions. Off by default.
      </p>
      <div className="mt-4 space-y-4">
        <Toggle
          label="Auto-start selling playbook"
          hint="When you open a listing (seller) transaction — the listing agreement is signed."
          checked={selling}
          disabled={pending}
          onChange={(v) => update({ autoSelling: v })}
        />
        <Toggle
          label="Auto-start buying playbook"
          hint="When you open a buyer transaction — kicks off the consultation + search setup."
          checked={buying}
          disabled={pending}
          onChange={(v) => update({ autoBuying: v })}
        />
      </div>
    </div>
  );
}
