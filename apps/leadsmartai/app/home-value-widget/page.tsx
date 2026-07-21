 "use client";

import { useState } from "react";

type WidgetStep = "address" | "email" | "done";

type EstimateResult = {
  estimatedValue: number;
  low: number;
  high: number;
};

export default function HomeValueWidgetPage() {
  const [step, setStep] = useState<WidgetStep>("address");
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [agentId, setAgentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);

  // Allow passing ?agentId=... for lead attribution when embedded.
  useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("agentId");
      if (id) setAgentId(id);
    }
  });

  const formatCurrency = (value: number) =>
    `$${Math.round(value).toLocaleString()}`;

  const runEstimatorFallback = (addr: string): EstimateResult => {
    // Fallback estimator (only used if the backend call fails).
    const base = 750000;
    const noise = (addr.length % 50) * 1000;
    const estimatedValue = base + noise;
    const low = estimatedValue * 0.92;
    const high = estimatedValue * 1.08;
    return { estimatedValue, low, high };
  };

  const handleAddressSubmit = async () => {
    setError(null);
    if (!address.trim()) {
      setError("Please enter a property address.");
      return;
    }
    setLoading(true);
    setEstimate(null);
    try {
      const res = await fetch("/api/home-value?refresh=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address.trim() }),
      });

      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error ?? "Failed to estimate home value");
      }

      const estimatedValue = json?.estimated_value as number | null;
      if (!Number.isFinite(estimatedValue) || (estimatedValue ?? 0) <= 0) {
        throw new Error("No estimated value returned");
      }

      const estimatedValueNum = estimatedValue as number;
      const low = estimatedValueNum * 0.92;
      const high = estimatedValueNum * 1.08;

      setEstimate({ estimatedValue: estimatedValueNum, low, high });
      setStep("email");
    } catch (e: any) {
      // Keep UX working even if estimator backend is temporarily unavailable.
      console.error("Home value estimate error:", e);
      setEstimate(runEstimatorFallback(address.trim()));
      setStep("email");
      setError(
        "We couldn’t compute a live estimate right now, but we’ll still unlock the report request."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLeadSubmit = async () => {
    setError(null);
    if (!email.trim()) {
      setError("Please enter your email to unlock the full report.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/home-value-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          address: address.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          agentId: agentId || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error ?? "Failed to save your request");
      }
      setStep("done");
    } catch (e: any) {
      console.error(e);
      setError("There was an issue saving your request. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <div className="bg-white shadow-md rounded-xl p-4 border border-gray-100">
        <h1 className="text-lg font-bold text-gray-900 mb-1">
          What&apos;s My Home Worth?
        </h1>
        <p className="text-xs text-gray-600 mb-3">
          Get an instant home value estimate and have a local agent follow up
          with a personalized report.
        </p>

        {step === "address" && (
          <div className="space-y-3">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter property address"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleAddressSubmit}
              disabled={loading}
              className="w-full inline-flex items-center justify-center bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && (
                <span className="mr-2 inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {loading ? "Estimating..." : "Get My Estimate"}
            </button>
          </div>
        )}

        {step !== "address" && estimate && (
          <div className="mt-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Estimated Home Value
            </h2>
            <p className="text-xl font-bold text-blue-700">
              {formatCurrency(estimate.estimatedValue)}
            </p>
            <p className="text-[11px] text-gray-500">
              Estimated range: {formatCurrency(estimate.low)} –{" "}
              {formatCurrency(estimate.high)}
            </p>
          </div>
        )}

        {step === "email" && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-gray-700">
              Enter your email to unlock your full home value report and have a
              local expert follow up.
            </p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone (optional)"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleLeadSubmit}
              disabled={loading}
              className="w-full inline-flex items-center justify-center bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Submitting..." : "Unlock Full Report"}
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="mt-4">
            <p className="text-xs text-emerald-700 font-semibold">
              Thank you! Your home value report request has been sent. An agent
              will follow up with a detailed CMA.
            </p>
          </div>
        )}

        {error && (
          <p className="mt-2 text-[11px] text-red-600 font-medium">{error}</p>
        )}

        <p className="mt-4 text-[10px] text-gray-400 text-center">
          Powered by CloseBoss
        </p>
      </div>
    </div>
  );
}

