"use client";

import { useEffect, useState } from "react";

/**
 * Type → customized assistant name (set on Manage Your AI Team). Module-cached
 * so many consumers (e.g. every briefing task badge) share a single fetch of
 * /api/dashboard/closeboss/team. Returns {} until loaded; callers fall back
 * to their own role labels for anything missing (incl. non-assistant roles).
 */
let cache: Record<string, string> | null = null;
let inflight: Promise<Record<string, string>> | null = null;

function fetchNames(): Promise<Record<string, string>> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/dashboard/closeboss/team")
      .then((r) => r.json())
      .then((res) => {
        const m: Record<string, string> = {};
        for (const a of (res?.assistants ?? []) as { type?: string; name?: string }[]) {
          if (a.type && a.name) m[a.type] = a.name;
        }
        cache = m;
        return m;
      })
      .catch(() => ({}) as Record<string, string>);
  }
  return inflight;
}

export function useAssistantNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>(cache ?? {});
  useEffect(() => {
    let active = true;
    void fetchNames().then((m) => {
      if (active) setNames(m);
    });
    return () => {
      active = false;
    };
  }, []);
  return names;
}
