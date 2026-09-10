"use client";

/**
 * PropertyTools tier, usage limits, and paywall — layered on {@link AuthProvider} (CloseBoss-style session).
 * Role/plan resolution: `GET /api/access/usage` + `lib/access.ts` (incl. PREMIUM_GRANT_ROLES).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AccessTier } from "@/lib/access";
import { hasPremiumToolAccess } from "@/lib/access";
import type { AccessUsageState } from "@/lib/usage";
import { getUsage } from "@/lib/usage";
import { useAuth } from "@/components/AuthProvider";
import PaywallModal from "@/components/PaywallModal";

type AccessContextValue = {
  tier: AccessTier;
  usage: AccessUsageState | null;
  /** Auth session loading and/or usage fetch in flight */
  loading: boolean;
  /** Refreshes Supabase session + usage/tier from API */
  refresh: () => Promise<void>;
  openAuth: (mode?: "login" | "signup") => void;
  closeAuth: () => void;
  openPaywall: (message?: string) => void;
  closePaywall: () => void;
};

const AccessContext = createContext<AccessContextValue | null>(null);

export function useAccess() {
  const ctx = useContext(AccessContext);
  if (!ctx) {
    throw new Error("useAccess must be used within AccessProvider");
  }
  return ctx;
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading, refresh: refreshAuth, openAuth, closeAuth } = useAuth();

  const [usage, setUsage] = useState<AccessUsageState | null>(null);
  const usageRef = useRef<AccessUsageState | null>(null);
  usageRef.current = usage;

  const [usageLoading, setUsageLoading] = useState(true);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallMessage, setPaywallMessage] = useState<string | undefined>();

  const refreshUsage = useCallback(async () => {
    setUsageLoading(true);
    try {
      const state = await getUsage();
      setUsage(state);
    } catch {
      setUsage(null);
    } finally {
      setUsageLoading(false);
    }
  }, []);

  /** Reload usage when Supabase session identity changes (login/logout/switch). */
  useEffect(() => {
    void refreshUsage();
  }, [user?.id, refreshUsage]);

  const refresh = useCallback(async () => {
    await refreshAuth();
    await refreshUsage();
  }, [refreshAuth, refreshUsage]);

  const tier: AccessTier = usage?.tier ?? "guest";
  const loading = authLoading || usageLoading;

  const closePaywall = useCallback(() => {
    setPaywallOpen(false);
    setPaywallMessage(undefined);
  }, []);

  const openPaywall = useCallback((message?: string) => {
    const u = usageRef.current;
    if (hasPremiumToolAccess({ tier: u?.tier ?? null, plan: u?.plan ?? null })) return;
    setPaywallMessage(message);
    setPaywallOpen(true);
  }, []);

  useEffect(() => {
    if (tier === "premium") {
      closePaywall();
    }
  }, [tier, closePaywall]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("checkout") !== "success") return;

    let cancelled = false;
    void (async () => {
      await refresh();
      if (cancelled) return;
      closePaywall();
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      const next = `${url.pathname}${url.search}`;
      router.replace(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, refresh, router, closePaywall]);

  const value = useMemo<AccessContextValue>(
    () => ({
      tier,
      usage,
      loading,
      refresh,
      openAuth,
      closeAuth,
      openPaywall,
      closePaywall,
    }),
    [tier, usage, loading, refresh, openAuth, closeAuth, openPaywall, closePaywall]
  );

  return (
    <AccessContext.Provider value={value}>
      {children}
      <PaywallModal
        open={paywallOpen}
        onClose={closePaywall}
        message={paywallMessage}
        ctaLabel="Upgrade Now"
      />
    </AccessContext.Provider>
  );
}
