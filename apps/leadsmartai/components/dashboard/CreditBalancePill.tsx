"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Live credit balance in the top bar — links to the Credits page to buy more.
 * Renders nothing until the balance loads (avoids a flash of "0"). Turns amber
 * when the balance is low.
 */
export function CreditBalancePill() {
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/credits", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && typeof j?.credits === "number") setCredits(j.credits);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (credits === null) return null;
  const low = credits < 100;

  return (
    <Link
      href="/dashboard/credits"
      title="Credits — click to buy more"
      className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-2xl border px-3 text-sm font-semibold shadow-sm ring-1 ring-slate-900/[0.03] transition ${
        low
          ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
          : "border-slate-200/90 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <Coins className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
      {credits.toLocaleString()}
    </Link>
  );
}
