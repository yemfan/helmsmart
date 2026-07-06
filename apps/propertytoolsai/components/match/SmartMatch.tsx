"use client";

import React, { useMemo, useState } from "react";
import { buildMatchExplanation } from "@/lib/match/explanations";
import type { BuyerPreferences, PropertyMatch } from "@/lib/match/types";
import { SmartMatchLeadModal } from "./SmartMatchLeadModal";

function generateSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `match_${Math.random().toString(36).slice(2, 11)}`;
}

type MatchForm = {
  budget: number;
  city: string;
  state: string;
  beds: number;
  baths: number;
  lifestyle: NonNullable<BuyerPreferences["lifestyle"]>;
  timeline: NonNullable<BuyerPreferences["timeline"]>;
};

function toBuyerPreferences(form: MatchForm): BuyerPreferences {
  return {
    budget: Number(form.budget),
    city: form.city.trim() || undefined,
    state: form.state.trim() || undefined,
    beds: form.beds,
    baths: form.baths,
    lifestyle: form.lifestyle,
    timeline: form.timeline,
  };
}

type MatchApiOk = {
  success: true;
  preferences: BuyerPreferences;
  provider: string;
  matches: PropertyMatch[];
};

export function SmartMatch() {
  const [form, setForm] = useState<MatchForm>({
    budget: 800000,
    city: "Pasadena",
    state: "CA",
    beds: 3,
    baths: 2,
    lifestyle: "family",
    timeline: "3_months",
  });
  const [results, setResults] = useState<PropertyMatch[]>([]);
  const [provider, setProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [leadForm, setLeadForm] = useState({ name: "", email: "", phone: "" });
  const [leadUnlocked, setLeadUnlocked] = useState(false);
  const [unlockedLeadId, setUnlockedLeadId] = useState<string | null>(null);
  const [saveSearchBusy, setSaveSearchBusy] = useState(false);
  const [saveSearchDone, setSaveSearchDone] = useState(false);
  const [saveSearchError, setSaveSearchError] = useState("");

  const sessionId = useMemo(() => generateSessionId(), []);
  const prefsForCopy = useMemo(() => toBuyerPreferences(form), [form]);

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toBuyerPreferences(form)),
      });
      const data = (await res.json()) as MatchApiOk | { success?: false; error?: string };
      if (!res.ok || !data || (data as MatchApiOk).success !== true) {
        throw new Error((data as { error?: string }).error || "Request failed");
      }
      const ok = data as MatchApiOk;
      setResults(ok.matches || []);
      setProvider(ok.provider);
    } catch (e) {
      setResults([]);
      setProvider(null);
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function unlockMatches() {
    setUnlocking(true);
    setUnlockError("");
    try {
      const res = await fetch("/api/match/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...leadForm,
          preferences: toBuyerPreferences(form),
          topMatch: results[0] || null,
          sessionId,
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string; leadId?: string };
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Unlock failed");
      }
      if (data.leadId) setUnlockedLeadId(String(data.leadId));
      setLeadUnlocked(true);
      setSaveSearchDone(false);
      setSaveSearchError("");
      setModalOpen(false);
      setLeadForm({ name: "", email: "", phone: "" });
    } catch (e) {
      setUnlockError(e instanceof Error ? e.message : "Unlock failed");
    } finally {
      setUnlocking(false);
    }
  }

  async function saveDailySearch() {
    if (!unlockedLeadId) return;
    setSaveSearchBusy(true);
    setSaveSearchError("");
    try {
      const res = await fetch("/api/match/save-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: unlockedLeadId,
          preferences: toBuyerPreferences(form),
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Could not save search");
      }
      setSaveSearchDone(true);
    } catch (e) {
      setSaveSearchError(e instanceof Error ? e.message : "Could not save search");
    } finally {
      setSaveSearchBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900">Find Your Perfect Home</h2>
        <p className="mt-2 text-sm text-gray-600">
          Tell us what matters most and we&apos;ll rank homes for you.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <input
            placeholder="Budget"
            type="number"
            value={form.budget}
            onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })}
            className="rounded-lg border p-3"
          />
          <input
            placeholder="City"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className="rounded-lg border p-3"
          />
          <input
            placeholder="State"
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
            className="rounded-lg border p-3"
          />
          <input
            placeholder="Bedrooms (min)"
            type="number"
            min={1}
            value={form.beds}
            onChange={(e) => setForm({ ...form, beds: Number(e.target.value) })}
            className="rounded-lg border p-3"
          />
          <input
            placeholder="Bathrooms (min)"
            type="number"
            min={1}
            step={0.5}
            value={form.baths}
            onChange={(e) => setForm({ ...form, baths: Number(e.target.value) })}
            className="rounded-lg border p-3"
          />
          <select
            value={form.lifestyle}
            onChange={(e) =>
              setForm({
                ...form,
                lifestyle: e.target.value as NonNullable<BuyerPreferences["lifestyle"]>,
              })
            }
            className="rounded-lg border bg-white p-3"
          >
            <option value="family">Family</option>
            <option value="investment">Investment</option>
            <option value="commute">Commute</option>
            <option value="luxury">Luxury</option>
          </select>
          <select
            value={form.timeline}
            onChange={(e) =>
              setForm({
                ...form,
                timeline: e.target.value as NonNullable<BuyerPreferences["timeline"]>,
              })
            }
            className="rounded-lg border bg-white p-3 md:col-span-2 xl:col-span-1"
          >
            <option value="asap">ASAP</option>
            <option value="3_months">3 Months</option>
            <option value="6_months">6 Months</option>
          </select>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={loading}
            className="rounded-lg bg-[#0072ce] px-5 py-3 text-white disabled:bg-gray-300"
          >
            {loading ? "Finding..." : "Find Matches"}
          </button>
          {results.length > 0 && !leadUnlocked ? (
            <button
              type="button"
              onClick={() => {
                setUnlockError("");
                setModalOpen(true);
              }}
              className="rounded-lg border px-5 py-3"
            >
              Unlock Full Matches + Off-Market Deals
            </button>
          ) : null}
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </div>

      {provider ? (
        <p className="text-center text-xs text-gray-500">
          Data: {provider === "live" ? "AI-matched live listings" : "Sample listings"}
        </p>
      ) : null}

      <div className="space-y-4">
        {results.map((r) => (
          <div key={r.id} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-lg font-semibold text-gray-900">{r.address}</div>
                <div className="mt-1 text-sm text-gray-600">${r.price.toLocaleString()}</div>
              </div>
              <div className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                Match Score: {r.matchScore}
              </div>
            </div>

            <ul className="mt-3 space-y-1 text-sm text-gray-600">
              {r.matchReasons.map((reason, i) => (
                <li key={i}>• {reason}</li>
              ))}
            </ul>

            <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
              {buildMatchExplanation(prefsForCopy, r)}
            </div>

            {/* AI-matched listings link out to their external source. `r.id`
                is the source URL when the engine returned one; otherwise it's
                the address (no link available), so render plain text. */}
            {/^https?:\/\//i.test(r.id) ? (
              <a
                href={r.id}
                target="_blank"
                rel="noopener nofollow"
                className="mt-3 inline-block text-sm font-medium text-blue-600 underline"
              >
                View listing ↗
              </a>
            ) : (
              <span className="mt-3 inline-block text-sm text-gray-400">
                No listing link available
              </span>
            )}
          </div>
        ))}
      </div>

      {leadUnlocked ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Full matches unlocked. Your preferences were saved and can now be routed into CRM follow-up,
            assignment, conversation, and automated follow-ups.
          </div>
          {unlockedLeadId ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => void saveDailySearch()}
                disabled={saveSearchBusy || saveSearchDone}
                className="rounded-xl border border-gray-900 bg-white px-5 py-3 text-sm font-medium text-gray-900 disabled:bg-gray-100"
              >
                {saveSearchBusy
                  ? "Saving..."
                  : saveSearchDone
                    ? "Daily alerts enabled"
                    : "Send me homes like this daily"}
              </button>
              {saveSearchError ? (
                <span className="text-sm text-red-600">{saveSearchError}</span>
              ) : null}
            </div>
          ) : null}
          {saveSearchDone ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              You&apos;re subscribed to daily listing alerts for this search (run the daily cron job in
              production).
            </div>
          ) : null}
        </div>
      ) : null}

      <SmartMatchLeadModal
        open={modalOpen}
        form={leadForm}
        onChange={(patch) => setLeadForm((prev) => ({ ...prev, ...patch }))}
        onSubmit={() => void unlockMatches()}
        loading={unlocking}
        error={unlockError}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
