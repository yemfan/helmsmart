"use client";

import { useEffect, useState } from "react";
import { applyApprovalDelta, onApprovalsChanged } from "@/lib/approval-events";

/**
 * How many AI-team approvals are waiting: the server's count (from the
 * dashboard layout), nudged by `announceApprovalsChanged` between renders.
 * A new server count replaces the nudged one.
 */
export function usePendingApprovals(serverCount: number): number {
  const [count, setCount] = useState(serverCount);
  useEffect(() => setCount(serverCount), [serverCount]);
  useEffect(() => onApprovalsChanged((delta) => setCount((c) => applyApprovalDelta(c, delta))), []);
  return count;
}
