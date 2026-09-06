"use client";

import { useState } from "react";

type Props = {
  planType: string;
};

export function CancelSubscriptionButton({ planType }: Props) {
  const isFree = !planType || planType === "free" || planType === "starter";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isFree) return null;

  async function openPortal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.url) {
        window.location.href = body.url;
      } else {
        setError(body.error ?? "Could not open billing portal.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={loading}
        onClick={() => void openPortal()}
        className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
      >
        {loading ? "Loading..." : "Cancel Subscription"}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </>
  );
}
