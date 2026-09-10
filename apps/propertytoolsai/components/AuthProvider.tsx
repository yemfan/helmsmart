"use client";

/**
 * Supabase session + login/signup modal — same pattern as CloseBoss (`apps/leadsmartai/components/AuthProvider.tsx`).
 * PropertyTools-specific tier/plan/paywall logic lives in {@link AccessProvider}.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import AuthModal from "@/components/AuthModal";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  openAuth: (mode?: "login" | "signup") => void;
  closeAuth: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

  const refresh = useCallback(async () => {
    const supabase = supabaseBrowser();
    const {
      data: { user: next },
    } = await supabase.auth.getUser();
    setUser(next ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await refresh();
      if (!cancelled) setLoading(false);
    })();

    const supabase = supabaseBrowser();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      void refresh();
      // Close the modal on SIGNED_IN (email/password, magic link) AND on INITIAL_SESSION
      // (fresh page load after OAuth redirect — Supabase fires INITIAL_SESSION, not SIGNED_IN,
      // when restoring a session from cookies). Without this, the modal stays open after Google OAuth.
      if (session?.user) {
        setAuthOpen(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      refresh,
      openAuth: (mode = "login") => {
        setAuthMode(mode);
        setAuthOpen(true);
      },
      closeAuth: () => setAuthOpen(false),
    }),
    [user, loading, refresh]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthModal
        open={authOpen}
        initialMode={authMode}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={() => void refresh()}
      />
    </AuthContext.Provider>
  );
}
