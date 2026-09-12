import { useCallback, useEffect, useRef, useState } from "react";
import type { MobileApiFailure } from "../closeBossMobileApi";
import { useNetwork } from "./NetworkContext";
import { cacheRead, cacheWrite } from "./readCache";

function isMobileApiFailure(v: unknown): v is MobileApiFailure {
  return typeof v === "object" && v !== null && (v as MobileApiFailure).ok === false;
}

/**
 * Drop-in React hook for screens to adopt read caching without
 * refactoring off `useState`. Returns cached data immediately
 * (with `stale=true`) and refreshes from the network in the
 * background when online.
 */
export function useCachedFetch<T>(
  cacheKey: string,
  fetcher: () => Promise<T | MobileApiFailure>,
  options?: { enabled?: boolean }
): {
  data: T | null;
  loading: boolean;
  error: MobileApiFailure | null;
  stale: boolean;
  refresh: () => void;
} {
  const enabled = options?.enabled ?? true;
  const { isConnected } = useNetwork();

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<MobileApiFailure | null>(null);
  const [stale, setStale] = useState(false);

  // Track the latest cacheKey to avoid writing stale fetches into
  // a cache slot that has since changed.
  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const runFetch = useCallback(
    async (fromRefresh: boolean) => {
      if (!fromRefresh) {
        // Step 1: try the cache first.
        const cached = await cacheRead<T>(cacheKeyRef.current);
        if (cached !== null) {
          setData(cached);
          setStale(true);
          setLoading(false);
        }
      }

      // Step 2: if online, fetch from network.
      if (!isConnected && !fromRefresh) {
        // Offline with no cache means we stay in loading until
        // reconnect or cache populates.
        if (data === null) {
          // Already loaded cache above — if still null, nothing to show.
        }
        setLoading(false);
        return;
      }

      try {
        const result = await fetcherRef.current();
        if (isMobileApiFailure(result)) {
          setError(result);
          // Keep showing stale cache data if available.
        } else {
          setData(result);
          setStale(false);
          setError(null);
          await cacheWrite(cacheKeyRef.current, result);
        }
      } catch {
        // Network-level error — keep stale data if available.
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isConnected]
  );

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    void runFetch(false);
  }, [enabled, cacheKey, runFetch]);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    void runFetch(true);
  }, [runFetch]);

  return { data, loading, error, stale, refresh };
}
