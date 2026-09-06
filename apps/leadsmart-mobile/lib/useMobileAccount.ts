import { useEffect, useState } from "react";

import { fetchMobileAccount, type MobileAccount } from "./leadsmartMobileApi";

/**
 * Who is signed in, for the header avatar and the profile card.
 *
 * One fetch per app launch, shared through a module-level cache: the header
 * mounts on every tab and the More screen asks too, and five requests for
 * one 32-pixel circle is four too many. `refresh()` is for after the agent
 * changes their photo on the web and pulls to refresh.
 */
let cached: MobileAccount | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<(a: MobileAccount | null) => void>();

function load(force = false): Promise<void> {
  if (cached && !force) return Promise.resolve();
  if (!inflight) {
    inflight = fetchMobileAccount()
      .then((res) => {
        if (res.ok) {
          cached = res.account;
          for (const fn of listeners) fn(cached);
        }
      })
      .catch(() => {
        // Decoration only — never worth an error state.
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useMobileAccount(): { account: MobileAccount | null; refresh: () => Promise<void> } {
  const [account, setAccount] = useState<MobileAccount | null>(cached);

  useEffect(() => {
    listeners.add(setAccount);
    void load();
    return () => {
      listeners.delete(setAccount);
    };
  }, []);

  return { account, refresh: () => load(true) };
}

/** "Michael Ye Real Estate" → "MY"; "fan.yes@…" → "FY". */
export function initialsFor(account: MobileAccount | null): string {
  const source = account?.brandName?.trim() || account?.email?.split("@")[0]?.trim() || "";
  if (!source) return "";
  return source
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
