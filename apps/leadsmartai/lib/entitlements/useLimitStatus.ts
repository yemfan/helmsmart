"use client";

import { useEffect, useState } from "react";
import type { AgentLimitApiAction } from "./checkAgentLimitClient";

/**
 * `state` buckets the usage into coarse zones so the UI can pick copy
 * without doing arithmetic itself:
 *   - "ok"   — well below the cap
 *   - "near" — ≥80% of cap (warn the user it's coming)
 *   - "hit"  — at the cap (future requests will be blocked)
 *   - "unlimited" — no cap on this action (Premium, etc.)
 *   - "unknown" — still loading, or the server returned no data
 */
export type LimitState = "ok" | "near" | "hit" | "unlimited" | "unknown";

export type LimitStatus = {
  action: AgentLimitApiAction;
  state: LimitState;
  current: number | null;
  limit: number | null;
  percent: number | null;
  allowed: boolean;
  plan: string | null;
};

const UNKNOWN: Omit<LimitStatus, "action"> = {
  state: "unknown",
  current: null,
  limit: null,
  percent: null,
  allowed: true,
  plan: null,
};

/**
 * Hook: fetches `/api/agent/check-limit` once per mount (+ revalidates
 * on focus) and returns a compact status envelope. Uses `AccessResult`
 * shape from the server — see apps/leadsmartai/lib/entitlements/accessResult.ts.
 *
 * Scope is intentionally narrow: this is a display helper. It does NOT
 * decrement usage — components should call `consumeAgentUsage` after
 * a gated action as before.
 */
export function useLimitStatus(action: AgentLimitApiAction): LimitStatus {
  const [status, setStatus] = useState<LimitStatus>({ action, ...UNKNOWN });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/agent/check-limit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action }),
        });
        const body = (await res.json().catch(() => null)) as {
          ok?: boolean;
          result?: {
            allowed: boolean;
            reason?: string | null;
            plan: string | null;
            currentUsage: number | null;
            limit: number | null;
          };
        } | null;
        if (cancelled) return;
        const r = body?.result;
        if (!r) {
          setStatus({ action, ...UNKNOWN });
          return;
        }
        const limit = typeof r.limit === "number" ? r.limit : null;
        const current = typeof r.currentUsage === "number" ? r.currentUsage : null;
        const percent =
          limit != null && limit > 0 && current != null
            ? Math.min(100, Math.round((current / limit) * 100))
            : null;
        const state: LimitState =
          limit == null
            ? "unlimited"
            : current != null && current >= limit
              ? "hit"
              : percent != null && percent >= 80
                ? "near"
                : "ok";
        setStatus({
          action,
          state,
          current,
          limit,
          percent,
          allowed: r.allowed,
          plan: r.plan,
        });
      } catch {
        if (!cancelled) setStatus({ action, ...UNKNOWN });
      }
    }
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [action]);

  return status;
}
