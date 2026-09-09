"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, Loader2, Check, X, AlertCircle } from "lucide-react";
import {
  checkPatientEligibility,
  updateClientInsurance,
} from "@/lib/actions/eligibility";

interface LatestCheck {
  status: string;
  plan_name: string | null;
  copay: number | null;
  coinsurance: number | null;
  deductible: number | null;
  deductible_remaining: number | null;
  error: string | null;
  checked_at: string;
}

interface Result {
  status: "active" | "inactive" | "error";
  planName: string | null;
  copay: number | null;
  coinsurance: number | null;
  deductible: number | null;
  deductibleRemaining: number | null;
  error: string | null;
}

interface Props {
  clientId: string;
  insurance: { payerId: string; payerName: string; memberId: string; dateOfBirth: string };
  latest: LatestCheck | null;
}

const money = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700",
    inactive: "bg-amber-100 text-amber-700",
    error: "bg-rose-100 text-rose-700",
  };
  const Icon = status === "active" ? Check : status === "inactive" ? X : AlertCircle;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${map[status] ?? map.error}`}>
      <Icon className="w-3 h-3" /> {status}
    </span>
  );
}

export function EligibilityPanel({ clientId, insurance, latest }: Props) {
  const [payerId, setPayerId] = useState(insurance.payerId);
  const [payerName, setPayerName] = useState(insurance.payerName);
  const [memberId, setMemberId] = useState(insurance.memberId);
  const [dob, setDob] = useState(insurance.dateOfBirth);

  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const [saving, startSave] = useTransition();
  const [checking, startCheck] = useTransition();

  const r = result ?? (latest ? {
    status: latest.status as Result["status"],
    planName: latest.plan_name,
    copay: latest.copay,
    coinsurance: latest.coinsurance,
    deductible: latest.deductible,
    deductibleRemaining: latest.deductible_remaining,
    error: latest.error,
  } : null);

  function save() {
    setError(null);
    setSavedNote(false);
    startSave(async () => {
      try {
        await updateClientInsurance(clientId, { payerId, payerName, memberId, dateOfBirth: dob });
        setSavedNote(true);
      } catch (e) {
        console.error("save client insurance", e);
        // This whole panel is still English-only — a medical-gated surface
        // with no namespace bound — so there is no key to reach for. Showing
        // the literal at least keeps the message stable instead of leaking a
        // Postgres error or Next's production redaction text.
        setError("Couldn't save");
      }
    });
  }

  function check() {
    setError(null);
    startCheck(async () => {
      try {
        const res = await checkPatientEligibility(clientId);
        setResult(res);
      } catch (e) {
        console.error("check patient eligibility", e);
        setError("Eligibility check failed");
      }
    });
  }

  const inputCls =
    "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-indigo-500" />
        <h2 className="text-sm font-semibold text-slate-700">Insurance &amp; Eligibility</h2>
      </div>

      <div className="p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Payer ID</label>
            <input className={inputCls} value={payerId} onChange={(e) => setPayerId(e.target.value)} placeholder="e.g. AHS" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Payer name</label>
            <input className={inputCls} value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="Aetna" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Member ID</label>
            <input className={inputCls} value={memberId} onChange={(e) => setMemberId(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Date of birth</label>
            <input type="date" className={inputCls} value={dob} onChange={(e) => setDob(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-2 text-sm font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </button>
          <button
            onClick={check}
            disabled={checking}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Check coverage
          </button>
          {savedNote && <span className="text-xs text-emerald-600">Saved</span>}
        </div>

        {error && <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}

        {r && (
          <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/60 space-y-2">
            <div className="flex items-center justify-between">
              <StatusBadge status={r.status} />
              {latest && !result && (
                <span className="text-[11px] text-slate-400">
                  {new Date(latest.checked_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              )}
            </div>
            {r.status === "error" ? (
              <p className="text-xs text-rose-600">{r.error}</p>
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <dt className="text-slate-500">Plan</dt>
                <dd className="text-slate-800 text-right">{r.planName ?? "—"}</dd>
                <dt className="text-slate-500">Copay</dt>
                <dd className="text-slate-800 text-right">{money(r.copay)}</dd>
                <dt className="text-slate-500">Coinsurance</dt>
                <dd className="text-slate-800 text-right">{r.coinsurance == null ? "—" : `${r.coinsurance}%`}</dd>
                <dt className="text-slate-500">Deductible</dt>
                <dd className="text-slate-800 text-right">
                  {money(r.deductibleRemaining ?? r.deductible)}
                  {r.deductibleRemaining != null && r.deductible != null && (
                    <span className="text-slate-400"> / {money(r.deductible)}</span>
                  )}
                </dd>
              </dl>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
