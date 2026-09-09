"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { updateOrgNpi } from "@/lib/actions/eligibility";

export function NpiSetting({ initial }: { initial: string }) {
  const [npi, setNpi] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      try {
        await updateOrgNpi(npi);
        setSaved(true);
      } catch (e) {
        console.error("save practice NPI", e);
        // English-only surface, same as eligibility-panel.tsx: no namespace is
        // bound here, so the literal is the whole vocabulary available.
        setError("Couldn't save");
      }
    });
  }

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
      <label className="block text-sm font-semibold text-slate-800 mb-1">Practice NPI</label>
      <p className="text-xs text-slate-500 mb-3">
        Your National Provider Identifier — the requesting provider on insurance eligibility checks.
      </p>
      <div className="flex items-center gap-2">
        <input
          value={npi}
          onChange={(e) => { setNpi(e.target.value); setSaved(false); }}
          placeholder="1234567890"
          inputMode="numeric"
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={save}
          disabled={pending}
          className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
        </button>
        {saved && <span className="text-xs text-emerald-600">Saved</span>}
      </div>
      {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}
    </div>
  );
}
